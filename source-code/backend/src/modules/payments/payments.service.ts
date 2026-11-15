import { randomUUID,createHmac,timingSafeEqual,createHash } from 'node:crypto';
import { z } from 'zod';
import QRCode from 'qrcode';
import { lock,type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { money,id,text } from '../../shared/validation.js';
import type { Actor } from '../auth/auth.service.js';
import { accessibleOrder } from '../orders/orders.service.js';
import { ordersRepository } from '../orders/orders.repository.js';
import { paymentsRepository as repo } from './payments.repository.js';
import { notifyManagers,notifyShift } from '../../shared/notifications.js';
export type Gateway = {create(input:{paymentId:string;orderCode:string;amount:number;reference:string}):Promise<{qrContent?:string;qrImageUrl?:string;expiresAt?:string}>};
export type QrMode='demo'|'live'|'disabled';
export function isDemoQrReference(reference:string|null|undefined):boolean{
 const normalized=reference?.toUpperCase()??'';
 return normalized.startsWith('DEMO-')||/^DEMO[A-Z0-9]+$/.test(normalized);
}
function emvField(tag:string,value:string):string{
 const length=Buffer.byteLength(value,'utf8');
 check(/^\d{2}$/.test(tag)&&length<=99,'Dữ liệu VietQR không hợp lệ.','INVALID_QR_DATA',422);
 return tag+String(length).padStart(2,'0')+value;
}
function crc16(value:string):string{
 let crc=0xffff;
 for(const byte of Buffer.from(value,'utf8')){
  crc^=byte<<8;
  for(let bit=0;bit<8;bit++)crc=crc&0x8000?(crc<<1)^0x1021:crc<<1;
  crc&=0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,'0');
}
function vietQrPayload(bankBin:string,account:string,accountName:string,input:{amount:number;reference:string}):string{
 check(/^\d{6}$/.test(bankBin)&&/^\d{1,19}$/.test(account),'Cấu hình tài khoản VietQR không hợp lệ.','PAYMENT_NOT_CONFIGURED',503);
 check(Number.isSafeInteger(input.amount)&&input.amount>0,'Số tiền VietQR không hợp lệ.','INVALID_QR_DATA',422);
 check(input.reference.length>0&&Buffer.byteLength(input.reference,'utf8')<=50,'Mã tham chiếu VietQR không hợp lệ.','INVALID_QR_DATA',422);
 check(Buffer.byteLength(accountName,'utf8')<=25,'Tên tài khoản VietQR không hợp lệ.','PAYMENT_NOT_CONFIGURED',503);
 const beneficiary=emvField('00',bankBin)+emvField('01',account);
 const merchant=emvField('00','A000000727')+emvField('01',beneficiary)+emvField('02','QRIBFTTA');
 const additional=emvField('08',input.reference);
 const payload=[
  emvField('00','01'),emvField('01','12'),emvField('38',merchant),
  emvField('53','704'),emvField('54',String(input.amount)),
  emvField('58','VN'),emvField('59',accountName),emvField('62',additional),'6304',
 ].join('');
 return payload+crc16(payload);
}
export function sepayGateway(bankBin?:string,account?:string,accountName?:string):Gateway{return{create:async input=>{
 check(bankBin&&account&&accountName,'Chưa cấu hình tài khoản ngân hàng nhận QR.','PAYMENT_NOT_CONFIGURED',503);
 const qrContent=vietQrPayload(bankBin,account,accountName,input);
 const qrImageUrl=await QRCode.toDataURL(qrContent,{errorCorrectionLevel:'M',margin:4,width:320,type:'image/png'});
 return {qrContent,qrImageUrl};
}};}
export function httpGateway(url?:string,token?:string):Gateway{return{create:async input=>{
 check(url&&token,'Chưa cấu hình cổng thanh toán QR.','PAYMENT_NOT_CONFIGURED',503);
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)});
 check(response.ok,'Không thể tạo mã QR từ cổng thanh toán.','PAYMENT_GATEWAY_ERROR',502);
 return z.object({qrContent:text(10000),expiresAt:z.iso.datetime().optional()}).parse(await response.json());
}};}
export const webhookInput=z.object({eventId:text(150),paymentId:id,orderCode:text(30),reference:text(150),amount:money,status:z.enum(['success','pending','failed'])}).strict();
export function paymentsService(db:Database,gateway:Gateway,secret?:string,demoQr=false){
 const finalize=async(tx:Database,payment:any,received:unknown)=>{
   const existing=await repo.successful(tx,payment.ma_don);
   if(existing){check(existing.ma_giao_dich===payment.ma_giao_dich,'Đơn hàng đã có giao dịch thành công.','ALREADY_PAID');return existing;}
   await repo.consume(tx,payment.ma_don);const result=await repo.succeed(tx,payment.ma_giao_dich,received);
   const order=await ordersRepository.get(tx,payment.ma_don);
   await notifyManagers(tx,'THANH_TOAN','Có đơn hàng đã thanh toán.',{ma_don:payment.ma_don});
   await notifyShift(tx,order.ma_ca,'THANH_TOAN','Đơn hàng đã thanh toán.',{ma_don:payment.ma_don});return result;
 };
 return{
  cash:(actor:Actor,orderId:string,received:number)=>db.transaction(async tx=>{await lock(tx,'kho');const order=await accessibleOrder(tx,orderId,actor);
    check(order.da_xac_nhan,'Cần xác nhận đơn trước khi thanh toán.');
    const previous=await repo.successful(tx,orderId);
    if(previous){check(previous.phuong_thuc==='Tiền mặt'&&Number(previous.so_tien_nhan)===received,'Đơn hàng đã thanh toán với thông tin khác.','ALREADY_PAID');return {...previous,tien_thua:Number(previous.so_tien_nhan)-Number(previous.so_tien_thanh_toan)};}
    check(!await repo.receivedQrFunds(tx,orderId),'Đơn đã nhận tiền chuyển khoản. Cần đối soát QR trước, không thu thêm tiền mặt.','QR_FUNDS_RECEIVED');
    const shift=await ordersRepository.shift(tx,order.ma_ca,actor.id);check(shift?.dang_dien_ra&&!shift.da_kiem_ke,'Ca làm đã kết thúc.');
    check(received>=Number(order.tong_tien),'Số tiền nhận được nhỏ hơn tổng tiền đơn hàng. Hoàn trả toàn bộ số tiền đã nhận.','INSUFFICIENT_CASH',422);
    const payment=await repo.create(tx,randomUUID(),orderId,'Tiền mặt',order.tong_tien,null);
    const result=await finalize(tx,payment,received);return {...result,tien_thua:received-Number(order.tong_tien)};
  }),
  qr:async(actor:Actor,orderId:string)=>{
    // No database lock is held during a network request to the gateway.
    const order=await accessibleOrder(db,orderId,actor);check(order.da_xac_nhan&&!order.da_thanh_toan,'Đơn chưa xác nhận hoặc đã thanh toán.');
    const paymentId=randomUUID(),reference=demoQr?`DEMO${randomUUID().replaceAll('-','').toUpperCase()}`:'ME'+randomUUID().replaceAll('-','');
    const amount=Number(order.tong_tien);
    const qr=await gateway.create({paymentId,orderCode:order.ma_don_hien_thi,amount,reference});
    return db.transaction(async tx=>{await lock(tx,'kho');const current=await accessibleOrder(tx,orderId,actor);
      check(!current.da_thanh_toan,'Đơn hàng đã thanh toán.','ALREADY_PAID');
      const shift=await ordersRepository.shift(tx,current.ma_ca,actor.id);check(shift?.dang_dien_ra&&!shift.da_kiem_ke,'Ca làm đã kết thúc.');
      return {...await repo.create(tx,paymentId,orderId,'Chuyển khoản qua QR',current.tong_tien,reference),...qr,qr_mo_phong:demoQr};
    });
  },
  webhook:async(raw:Buffer,signature?:string)=>{
    check(secret,'Chưa cấu hình xác minh giao dịch QR.','PAYMENT_NOT_CONFIGURED',503);
    const expected=createHmac('sha256',secret).update(raw).digest();
    const actual=Buffer.from(signature?.replace(/^sha256=/,'')??'','hex');
    check(actual.length===expected.length&&timingSafeEqual(actual,expected),'Chữ ký giao dịch không hợp lệ.','INVALID_SIGNATURE',401);
    const v=webhookInput.parse(JSON.parse(raw.toString('utf8')));const hash=createHash('sha256').update(raw).digest('hex');
    return db.transaction(async tx=>{await lock(tx,'kho');const old=await repo.event(tx,v.eventId);
      if(old){check(old.noi_dung_bam===hash,'Mã sự kiện đã được sử dụng với nội dung khác.','EVENT_CONFLICT');return {received:true,duplicate:true};}
      const payment=await repo.get(tx,v.paymentId);check(payment&&payment.phuong_thuc==='Chuyển khoản qua QR','Không tìm thấy giao dịch QR.','NOT_FOUND',404);
      const order=await ordersRepository.get(tx,payment.ma_don);
      check(order.ma_don_hien_thi===v.orderCode&&payment.ma_tham_chieu_qr===v.reference,'Giao dịch không khớp đơn hàng.','PAYMENT_MISMATCH',422);
      await repo.storeEvent(tx,v,hash);return {received:true,duplicate:false};
    });
  },
  sepayWebhook:async(raw:Buffer,authorization:string|undefined,config:{secret:string;account:string})=>{
    const expected=Buffer.from('Apikey '+config.secret),actual=Buffer.from(authorization??'');
    check(config.secret&&expected.length===actual.length&&timingSafeEqual(expected,actual),'Thông tin xác thực SePay không hợp lệ.','INVALID_SIGNATURE',401);
    const v=z.object({id:z.union([z.string().min(1).max(100),z.number().int().positive()]),accountNumber:text(50),transferType:z.enum(['in','out']),transferAmount:money,content:z.string().max(2000),code:z.string().nullable().optional()}).passthrough().parse(JSON.parse(raw.toString('utf8')));
    if(v.transferType!=='in'||v.accountNumber!==config.account)return {success:true};
    const reference=(`${v.code??''} ${v.content}`).match(/ME[a-f0-9]{32}/i)?.[0]??'';
    return db.transaction(async tx=>{await lock(tx,'kho');const payment=reference?await repo.byReference(tx,reference):null;
      const event={eventId:'sepay:'+v.id,paymentId:payment?.ma_giao_dich??null,orderCode:payment?.ma_don_hien_thi??null,reference:payment?.ma_tham_chieu_qr??reference,amount:v.transferAmount,status:'success'};
      const hash=createHash('sha256').update(JSON.stringify(event)).digest('hex');const old=await repo.event(tx,event.eventId);
      if(old){check(old.noi_dung_bam===hash,'Mã giao dịch SePay đã được ghi nhận với nội dung khác.','EVENT_CONFLICT');return {success:true};}
      await repo.storeEvent(tx,event,hash);
      if(payment)await notifyShift(tx,payment.ma_ca,'QR_DA_NHAN','Đã nhận dữ liệu giao dịch QR. Vui lòng đối soát.',{ma_don:payment.ma_don,ma_giao_dich:payment.ma_giao_dich});
      else await notifyManagers(tx,'QR_CAN_KIEM_TRA','Có giao dịch chuyển khoản chưa khớp đơn hàng, cần kiểm tra.',{ma_su_kien:event.eventId,so_tien:v.transferAmount,tham_chieu:reference});
      return {success:true};
    });
  },
  reconcile:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const payment=await repo.get(tx,id);
    check(payment&&payment.phuong_thuc==='Chuyển khoản qua QR','Không tìm thấy giao dịch QR.','NOT_FOUND',404);
    const order=await accessibleOrder(tx,payment.ma_don,actor);if(payment.trang_thai==='Thành công')return payment;
    const shift=await ordersRepository.shift(tx,order.ma_ca,actor.id);
    check(shift&&!shift.da_kiem_ke,'Ca làm đã kiểm kê, không thể ghi thêm thanh toán.','SHIFT_ALREADY_COUNTED');
    // Verified bank receipts may arrive after shift end, before inventory is counted.
    if(isDemoQrReference(payment.ma_tham_chieu_qr)){
      check(shift.dang_dien_ra,'Ca làm đã kết thúc.');
      check(demoQr,'Giao dịch QR mô phỏng chỉ có thể đối soát trong chế độ demo.','DEMO_QR_DISABLED',409);
      check(Number(payment.so_tien_thanh_toan)===Number(order.tong_tien),'Số tiền giao dịch mô phỏng không khớp đơn hàng.','PAYMENT_MISMATCH',422);
      return finalize(tx,payment,payment.so_tien_thanh_toan);
    }
    const events=await repo.events(tx,id);
    const event=events.map(e=>e.noi_dung).find(e=>e.status==='success'&&e.reference===payment.ma_tham_chieu_qr&&e.orderCode===order.ma_don_hien_thi&&e.amount>=Number(order.tong_tien));
    check(event,'Đối soát chưa thành công: giao dịch chưa được xác nhận hoặc chưa đủ số tiền.','PAYMENT_UNCONFIRMED',422);
    return finalize(tx,payment,event.amount);
  }),
 };
}
