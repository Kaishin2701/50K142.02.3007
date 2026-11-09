import { z } from 'zod';
import { lock,type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { id,distinct,date,pageQuery } from '../../shared/validation.js';
import type { Actor } from '../auth/auth.service.js';
import { ordersRepository as repo } from './orders.repository.js';
import { renderPdf } from '../../shared/pdf.js';
import { notifyShift } from '../../shared/notifications.js';
import { previousRequest,rememberRequest } from '../../shared/idempotency.js';
export const orderInput=z.object({ma_ca:id,items:z.array(z.object({ma_mon:id,so_luong:z.number().int().min(1).max(1000)}).strict()).min(1).max(100).refine(v=>distinct(v,i=>i.ma_mon))}).strict();
export const orderQuery=pageQuery.extend({code:z.string().max(30).optional(),from:date.optional(),to:date.optional(),
 method:z.enum(['Tiền mặt','Chuyển khoản qua QR']).optional(),status:z.enum(['Chưa pha chế','Bắt đầu pha chế']).optional()})
 .refine(v=>!v.from||!v.to||v.from<=v.to,{message:'Khoảng ngày không hợp lệ.'});
export async function accessibleOrder(db:Database,id:string,actor:Actor){
 const order=await repo.get(db,id);check(order,'Đơn hàng không còn tồn tại.','NOT_FOUND',404);
 if(actor.role==='Nhân viên'){
   const shift=await repo.shift(db,order.ma_ca,actor.id);
   check(shift?.duoc_phan_cong,'Bạn không được phân công trong ca của đơn hàng này.','FORBIDDEN',403);
   check(order.trang_thai_pha_che!=='Hoàn tất pha chế','Lịch sử đơn hàng chỉ dành cho quản lý.','FORBIDDEN',403);
 }
 return order;
}
export function ordersService(db:Database,fontPath?:string){return{
 create:(actor:Actor,v:z.infer<typeof orderInput>,confirm:boolean,key?:string)=>db.transaction(async tx=>{
   await lock(tx,'kho');const old=await previousRequest(tx,key,actor.id,'create-order',{v,confirm});
   if(old){const result=await repo.get(tx,old);check(result,'Đơn của yêu cầu trước đã bị hủy. Hãy dùng khóa mới cho đơn mới.','ORIGINAL_ORDER_REMOVED');return result;}
   const shift=await repo.shift(tx,v.ma_ca,actor.id);
   check(shift?.dang_dien_ra&&shift.duoc_phan_cong&&!shift.da_kiem_ke,'Bạn cần được phân công vào ca đang diễn ra.','INVALID_SHIFT');
   const menu=await repo.menu(tx,v.items.map(i=>i.ma_mon));
   check(menu.length===v.items.length,'Một hoặc nhiều món không thể phục vụ.','UNAVAILABLE_MENU');
   check((await repo.recipeCount(tx,v.items.map(i=>i.ma_mon))).length===v.items.length,'Món chưa được khai báo định mức nguyên liệu.','MISSING_RECIPE');
   const needed=await repo.requirements(tx,v.items);
   for(const item of needed)check(item.dang_hoat_dong&&Number(item.kha_dung)>=Number(item.can_dung),`Nguyên liệu ${item.ten_nguyen_lieu} không đủ tồn khả dụng.`,'INSUFFICIENT_STOCK');
   const total=v.items.reduce((sum,item)=>sum+item.so_luong*Number(menu.find(m=>m.ma_mon===item.ma_mon)!.don_gia_hien_tai),0);
   check(Number.isSafeInteger(total)&&total<=99_999_999_999_999,'Giá trị đơn hàng vượt giới hạn.','INVALID_TOTAL',422);
   const order=await repo.create(tx,actor.id,v.ma_ca,total);
   for(const item of v.items)await repo.addLine(tx,order.ma_don,item,menu.find(m=>m.ma_mon===item.ma_mon));
   for(const item of needed)await repo.hold(tx,order.ma_don,item);
   await rememberRequest(tx,key,actor.id,'create-order',{v,confirm},order.ma_don);
   if(confirm){const result=await repo.confirm(tx,order.ma_don);await notifyShift(tx,v.ma_ca,'DON_HANG','Có đơn hàng mới.',{ma_don:order.ma_don});return result;}return order;
 }),
 confirm:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const order=await accessibleOrder(tx,id,actor);
   if(order.da_xac_nhan)return order;const shift=await repo.shift(tx,order.ma_ca,actor.id);
   check(shift?.dang_dien_ra&&!shift.da_kiem_ke,'Ca làm đã kết thúc.');const result=await repo.confirm(tx,id);await notifyShift(tx,order.ma_ca,'DON_HANG','Có đơn hàng mới.',{ma_don:id});return result;}),
 get:async(actor:Actor,id:string)=>{const order=await accessibleOrder(db,id,actor);return {...order,items:await repo.lines(db,id),payments:await repo.payments(db,id)};},
 list:(v:z.infer<typeof orderQuery>,history:boolean)=>repo.list(db,v,history),
 cancel:(actor:Actor,id:string)=>db.transaction(async tx=>{await lock(tx,'kho');const order=await accessibleOrder(tx,id,actor);
   check(!order.da_thanh_toan&&order.trang_thai_pha_che==='Chưa pha chế','Đơn hàng không thể hủy do đã thanh toán thành công hoặc đã bắt đầu pha chế.','CANNOT_CANCEL');
   await repo.remove(tx,id);await notifyShift(tx,order.ma_ca,'DON_HANG','Đơn hàng đã được hủy.',{ma_don:id});return {ma_don:id,da_huy:true};}),
 phase:(actor:Actor,id:string,phase:'Bắt đầu pha chế'|'Hoàn tất pha chế')=>db.transaction(async tx=>{await lock(tx,'kho');const order=await accessibleOrder(tx,id,actor);
   check(order.da_thanh_toan,'Đơn hàng chưa thanh toán thành công.','UNPAID_ORDER');
   check(order.trang_thai_pha_che===(phase==='Bắt đầu pha chế'?'Chưa pha chế':'Bắt đầu pha chế'),'Thứ tự trạng thái pha chế không hợp lệ.');
   const result=await repo.phase(tx,id,phase);await notifyShift(tx,order.ma_ca,'DON_HANG','Trạng thái pha chế đã thay đổi.',{ma_don:id});return result;}),
 invoice:async(actor:Actor,id:string)=>{
   const order=await accessibleOrder(db,id,actor);check(order.da_thanh_toan,'Chỉ xuất hóa đơn sau khi thanh toán thành công.','UNPAID_ORDER');
   const lines=await repo.lines(db,id),payment=(await repo.payments(db,id)).find(p=>p.trang_thai==='Thành công');
   check(payment,'Không tìm thấy giao dịch thanh toán thành công.','PAYMENT_NOT_FOUND');
   const format=(value:unknown)=>new Intl.NumberFormat('vi-VN').format(BigInt(String(value)))+' đ';
   return renderPdf(doc=>{
     doc.fontSize(20).text('Mê Cà Phê');doc.fontSize(11).text('106 Trần Cao Vân, Đà Nẵng');doc.moveDown();
     doc.fontSize(16).text('Hóa đơn bán hàng');doc.fontSize(11).text(`Mã đơn: ${order.ma_don_hien_thi}`);
     doc.text(`Ngày: ${new Date(order.thoi_gian_lap).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`);doc.moveDown();
     for(const line of lines)doc.text(`${line.ten_mon_luc_lap} × ${line.so_luong} | ${format(line.don_gia_luc_lap)} | ${format(line.thanh_tien)}`);
     doc.moveDown();doc.fontSize(13).text(`Tổng tiền: ${format(order.tong_tien)}`);doc.fontSize(11).text(`Thanh toán: ${payment.phuong_thuc}`);
     if(payment.phuong_thuc==='Tiền mặt'){doc.text(`Tiền nhận: ${format(payment.so_tien_nhan)}`);doc.text(`Tiền thừa: ${format(BigInt(payment.so_tien_nhan)-BigInt(order.tong_tien))}`);}
   },fontPath);
 },
 ticket:async(actor:Actor,id:string)=>{const order=await accessibleOrder(db,id,actor);check(order.da_thanh_toan,'Đơn chưa thanh toán.','UNPAID_ORDER');
   return{ma_don:order.ma_don,ma_don_hien_thi:order.ma_don_hien_thi,trang_thai_pha_che:order.trang_thai_pha_che,items:(await repo.lines(db,id)).map(i=>({ten_mon:i.ten_mon_luc_lap,so_luong:i.so_luong}))};},
};}
