import { test,before,after,beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { migrate } from '../src/shared/migrations.js';
import type { Database } from '../src/shared/database.js';
import { hashPassword,type Actor } from '../src/modules/auth/auth.service.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { usersService } from '../src/modules/users/users.service.js';
import { ordersService } from '../src/modules/orders/orders.service.js';
import { isDemoQrReference,paymentsService,sepayGateway,type Gateway } from '../src/modules/payments/payments.service.js';
import { paymentConfiguration } from '../src/config/payments.js';
import { inventoryService } from '../src/modules/inventory/inventory.service.js';
import { shiftsService } from '../src/modules/shifts/shifts.service.js';
import { reportsService } from '../src/modules/reports/reports.service.js';
import { createApp } from '../src/app.js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';

let pg:PGlite,db:Database,manager:Actor,employee:Actor,colleague:Actor,material:string,menu:string,shift:string,app:ReturnType<typeof createApp>;
const origin='http://127.0.0.1:5173';const secret='test-webhook-secret';let passwordHash:string;
const gateway:Gateway={create:async v=>({qrContent:`urn:test:${v.reference}`})};
function adapter(connection:any):Database{return{
 query:async(text,values=[])=>values.length?connection.query(text,values):(await connection.exec(text)).at(-1)??{rows:[]},
 transaction:async work=>connection.transaction(async(tx:any)=>work(adapter(tx))),
};}
async function one(sql:string,values:unknown[]=[]){return (await db.query(sql,values)).rows[0];}
const items=(count=1)=>({ma_ca:shift,items:[{ma_mon:menu,so_luong:count}]});
async function endShift(){await db.query(`UPDATE ca_lam SET ngay_lam=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-1 WHERE ma_ca=$1`,[shift]);}
function parseTlv(value:string){
 const result=new Map<string,string>();let offset=0;
 while(offset<value.length){
  const tag=value.slice(offset,offset+2),length=Number(value.slice(offset+2,offset+4));
  assert.match(tag,/^[0-9]{2}$/);assert.ok(Number.isInteger(length)&&length>=0);
  offset+=4;assert.ok(offset+length<=value.length,`Invalid EMV length for tag ${tag}`);
  result.set(tag,value.slice(offset,offset+length));offset+=length;
 }
 return result;
}
function decodeQrImage(imageUrl:string){
 assert.match(imageUrl,/^data:image\/png;base64,/,'VietQR image must be generated locally as PNG');
 const png=Buffer.from(imageUrl.slice('data:image/png;base64,'.length),'base64');
 const image=PNG.sync.read(png);
 const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height,{inversionAttempts:'attemptBoth'});
 assert.ok(decoded,'Locally generated VietQR image contained no decodable QR code');
 return decoded.data;
}
function emvCrc16(value:string){
 let crc=0xffff;
 for(const byte of Buffer.from(value,'ascii')){
  crc^=byte<<8;
  for(let bit=0;bit<8;bit++)crc=crc&0x8000?(crc<<1)^0x1021:crc<<1;
  crc&=0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,'0');
}
function emvField(tag:string,value:string){return tag+String(Buffer.byteLength(value,'ascii')).padStart(2,'0')+value;}
function assertVietQrPayload(payload:string,expected:{amount:number;reference:string}){
 const fields=parseTlv(payload);
 const merchant=parseTlv(fields.get('38')??'');
 const beneficiary=parseTlv(merchant.get('01')??'');
 const additional=parseTlv(fields.get('62')??'');
 assert.equal(fields.get('00'),'01');
 assert.equal(fields.get('01'),'12');
 assert.equal(merchant.get('00'),'A000000727');
 assert.equal(beneficiary.get('00'),'970422');
 assert.equal(beneficiary.get('01'),'0333101167');
 assert.equal(merchant.get('02'),'QRIBFTTA');
 assert.equal(fields.get('53'),'704');
 assert.equal(fields.get('54'),String(expected.amount));
 assert.equal(fields.get('58'),'VN');
 assert.equal(fields.get('59'),'NGUYEN THANH SANG');
 assert.equal(additional.get('08'),expected.reference);
 assert.equal(fields.get('63'),emvCrc16(payload.slice(0,-4)));
}
function assertVietQrImage(imageUrl:string,qrContent:string,expected:{amount:number;reference:string}){
 const payload=decodeQrImage(imageUrl);
 assert.equal(payload,qrContent,'Decoded PNG payload must exactly match qrContent');
 assertVietQrPayload(payload,expected);
 return payload;
}
function testPayload(merchant:string,amount:number,reference:string,checksum=true){
 const additional=emvField('08',reference);
 const content=[
  emvField('00','01'),emvField('01','12'),emvField('38',merchant),
  emvField('53','704'),emvField('54',String(amount)),
  emvField('58','VN'),emvField('59','NGUYEN THANH SANG'),
  emvField('62',additional),'6304',
 ].join('');
 return content+(checksum?emvCrc16(content):'0000');
}
before(async()=>{pg=new PGlite();db=adapter(pg);await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));passwordHash=await hashPassword('test-password');});
after(async()=>{await pg.close();});
beforeEach(async()=>{
 await db.query('TRUNCATE nguoi_dung,mon,nguyen_lieu,ca_lam,chuoi_ca_lap RESTART IDENTITY CASCADE');
 const people=[];for(const [name,phone,role] of [['manager','0900000001','Quản lý'],['employee','0900000002','Nhân viên'],['colleague','0900000003','Nhân viên']]){
   const user=await usersRepository.create(db,{ten_dang_nhap:name,ho_ten:name,so_dien_thoai:phone,vai_tro:role,mat_khau_bam:passwordHash});people.push({id:user.ma_nguoi_dung,role,sessionId:randomUUID()} as Actor);
 }[manager,employee,colleague]=people;
 material=(await one(`INSERT INTO nguyen_lieu(ten_nguyen_lieu,don_vi_tinh,ton_ly_thuyet,muc_ton_toi_thieu) VALUES('Nguyên liệu thử','ly',10,2) RETURNING *`)).ma_nguyen_lieu;
 menu=(await one(`INSERT INTO mon(ten_mon,danh_muc,don_gia_hien_tai) VALUES('Cà phê thử','Cà phê',25000) RETURNING *`)).ma_mon;
 await db.query('INSERT INTO dinh_muc_nguyen_lieu VALUES($1,$2,1)',[menu,material]);
 shift=(await one(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'00:00','23:59:59.999999',1,3) RETURNING *`)).ma_ca;
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[shift,employee.id]);
 app=createApp({db,origins:[origin],gateway,webhookSecret:secret});
});

test('migrations are repeatable and all application tables have row security',async()=>{
 await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));
 const result=await one(`SELECT count(*)::int AS count FROM pg_class WHERE relname IN ('nguoi_dung','phien_dang_nhap','don_hang','giao_dich_thanh_toan') AND relrowsecurity`);
 assert.equal(result.count,4);
});

test('SePay verifies account and authentication, deduplicates events, and requires sufficient funds before reconciliation',async()=>{
 const service=paymentsService(db,sepayGateway('970422','0333101167','NGUYEN THANH SANG'));
 const order=await ordersService(db).create(employee,items(2),true);
 const payment=await service.qr(employee,order.ma_don);
 assertVietQrImage(payment.qrImageUrl!,payment.qrContent!,{
  amount:Number(order.tong_tien),reference:payment.ma_tham_chieu_qr!,
 });
 const configured=createApp({db,origins:[origin],gateway,sepay:{secret,account:'0333101167'}});
 const incoming={id:1001,accountNumber:'0333101167',transferType:'in',transferAmount:20000,content:payment.ma_tham_chieu_qr.toUpperCase(),code:null};
 assert.equal((await request(configured).post('/api/payments/sepay/webhook').send(incoming)).status,401);
 const send=(payload:any)=>request(configured).post('/api/payments/sepay/webhook').set('Authorization','Apikey '+secret).send(payload);
 assert.equal((await send({...incoming,accountNumber:'another-account'})).status,200);
 assert.equal((await db.query('SELECT * FROM su_kien_thanh_toan')).rows.length,0);
 assert.deepEqual((await send(incoming)).body,{success:true});assert.deepEqual((await send(incoming)).body,{success:true});
 assert.equal((await db.query('SELECT * FROM su_kien_thanh_toan')).rows.length,1);
 await assert.rejects(service.reconcile(employee,payment.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),10);
 assert.equal((await send({...incoming,transferAmount:50000})).status,409);
 assert.equal((await send({...incoming,id:1002,transferAmount:50000})).status,200);
 await service.reconcile(employee,payment.ma_giao_dich);await service.reconcile(employee,payment.ma_giao_dich);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),8);
 assert.equal((await db.query("SELECT * FROM giao_dich_thanh_toan WHERE trang_thai='Thành công'")).rows.length,1);
});
test('VietQR payload uses the exact reference tag and missing bank configuration is rejected',async()=>{
 const gateway=sepayGateway('970422','0333101167','NGUYEN THANH SANG');
 const qr=await gateway.create({paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'ME0123456789abcdef0123456789abcdef'});
 const fields=parseTlv(qr.qrContent!);
 assert.equal(parseTlv(fields.get('62')??'').get('08'),'ME0123456789abcdef0123456789abcdef');
 assert.equal(fields.get('63'),emvCrc16(qr.qrContent!.slice(0,-4)));
 assert.ok(qr.qrImageUrl?.startsWith('data:image/png;base64,'));
 await assert.rejects(sepayGateway('970422','0333101167').create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'ME123',
 }),(error:any)=>error.code==='PAYMENT_NOT_CONFIGURED');
});
test('VietQR validation rejects invalid nesting and any mismatched or undecodable QR data',async()=>{
 const reference='DEMOABC123',amount=50000;
 const validMerchant=emvField('00','A000000727')
  +emvField('01',emvField('00','970422')+emvField('01','0333101167'))
  +emvField('02','QRIBFTTA');
 const valid=testPayload(validMerchant,amount,reference);
 assertVietQrPayload(valid,{amount,reference});

 const wrongLevel=emvField('00','A000000727')
  +emvField('01','970422')
  +emvField('02','0333101167');
 assert.throws(()=>assertVietQrPayload(testPayload(wrongLevel,amount,reference),{amount,reference}));

 const missingService=emvField('00','A000000727')
  +emvField('01',emvField('00','970422')+emvField('01','0333101167'));
 assert.throws(()=>assertVietQrPayload(testPayload(missingService,amount,reference),{amount,reference}));
 assert.throws(()=>assertVietQrPayload(testPayload(validMerchant,amount+1,reference),{amount,reference}));
 assert.throws(()=>assertVietQrPayload(testPayload(validMerchant,amount,'DEMOOTHER'),{amount,reference}));
 assert.throws(()=>assertVietQrPayload(testPayload(validMerchant,amount,reference,false),{amount,reference}));
 assert.throws(()=>decodeQrImage('data:image/png;base64,'));

 const image=await QRCode.toDataURL(valid,{errorCorrectionLevel:'M',margin:4,width:320,type:'image/png'});
 assert.throws(()=>assertVietQrImage(image,valid+'X',{amount,reference}));
});
test('new and legacy demo references remain unambiguously classified',async()=>{
 assert.equal(isDemoQrReference('DEMO0123456789abcdef0123456789abcdef'),true);
 assert.equal(isDemoQrReference('DEMO-01234567-89ab-cdef-0123-456789abcdef'),true);
 assert.equal(isDemoQrReference('ME0123456789abcdef0123456789abcdef'),false);
 const order=await ordersService(db).create(employee,items(),true);
 const payment=await paymentsService(db,sepayGateway('970422','0333101167','NGUYEN THANH SANG'),undefined,true).qr(employee,order.ma_don);
 assert.match(payment.ma_tham_chieu_qr!,/^[A-Za-z0-9]+$/);
 assert.ok(payment.ma_tham_chieu_qr!.length<=50,'VietQR reference must fit the EMV additional-data field');
});
test('locally generated VietQR images decode to configured EMV fields for different order totals',async t=>{
 const demoGateway=sepayGateway('970422','0333101167','NGUYEN THANH SANG');
 const totals:number[]=[];
 for(const quantity of [1,2,3]){
  await t.test(`decodes the ${quantity}-item order QR`,async()=>{
   const order=await ordersService(db).create(employee,items(quantity),true);
   totals.push(Number(order.tong_tien));
   const payment=await paymentsService(db,demoGateway,undefined,true).qr(employee,order.ma_don);
   const saved=(await ordersService(db).get(employee,order.ma_don)).payments.find(item=>item.ma_giao_dich===payment.ma_giao_dich);
   assert.ok(saved);
   assert.equal(saved.ma_tham_chieu_qr,payment.ma_tham_chieu_qr);
   assert.equal(saved.qr_mo_phong,true);
   const reference=payment.ma_tham_chieu_qr!;
   assert.match(reference,/^[A-Za-z0-9]+$/);
   assert.ok(reference.length<=50,'VietQR reference must fit the EMV additional-data field');
   assertVietQrImage(payment.qrImageUrl!,payment.qrContent!,{
    amount:Number(order.tong_tien),reference,
   });
   assert.equal(Number(saved.so_tien_thanh_toan),Number(order.tong_tien));
  });
 }
 assert.equal(new Set(totals).size,3,'Local QR checks must cover three different order totals');
});
test('local payment configuration enables VietQR independently of webhook configuration',async()=>{
 const configuration=paymentConfiguration({
  QR_PROVIDER:'sepay',SEPAY_BANK:'970422',SEPAY_ACCOUNT_NUMBER:'0333101167',
  SEPAY_ACCOUNT_NAME:'NGUYEN THANH SANG',
 });
 assert.equal(configuration.qrMode,'live');
 assert.equal(configuration.sepay,undefined);
 const qr=await configuration.gateway.create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'ME0123456789abcdef0123456789abcdef',
 });
 const fields=parseTlv(qr.qrContent!);
 const merchant=parseTlv(fields.get('38')??'');
 const beneficiary=parseTlv(merchant.get('01')??'');
 assert.equal(fields.get('54'),'25000');
 assert.equal(merchant.get('00'),'A000000727');
 assert.equal(beneficiary.get('00'),'970422');
 assert.equal(beneficiary.get('01'),'0333101167');
 assert.equal(merchant.get('02'),'QRIBFTTA');
 assert.equal(parseTlv(fields.get('62')??'').get('08'),'ME0123456789abcdef0123456789abcdef');
 assert.ok(qr.qrImageUrl?.startsWith('data:image/png;base64,'));
 const demoConfiguration=paymentConfiguration({
  SEPAY_BANK:'970422',SEPAY_ACCOUNT_NUMBER:'0333101167',SEPAY_ACCOUNT_NAME:'NGUYEN THANH SANG',
 });
 assert.equal(demoConfiguration.qrMode,'disabled');
 const demoQr=await demoConfiguration.vietQrGateway.create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'DEMO-0123456789abcdef0123456789abcdef',
 });
 assert.equal(parseTlv(demoQr.qrContent!).get('54'),'25000');
 assert.equal(parseTlv(parseTlv(demoQr.qrContent!).get('62')??'').get('08'),'DEMO-0123456789abcdef0123456789abcdef');
 const incomplete=paymentConfiguration({
  QR_PROVIDER:'sepay',SEPAY_BANK:'970422',SEPAY_ACCOUNT_NUMBER:'0333101167',
 });
 assert.equal(incomplete.qrMode,'live');
 await assert.rejects(incomplete.gateway.create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'ME0123456789abcdef0123456789abcdef',
 }),(error:any)=>error.code==='PAYMENT_NOT_CONFIGURED');
 assert.equal(incomplete.sepay,undefined);
 await assert.rejects(incomplete.vietQrGateway.create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'DEMO-0123',
 }),(error:any)=>error.code==='PAYMENT_NOT_CONFIGURED');
 const disabled=paymentConfiguration({QR_PROVIDER:'disabled'});
 assert.equal(disabled.qrMode,'disabled');
 await assert.rejects(disabled.gateway.create({
  paymentId:randomUUID(),orderCode:'ME-000001',amount:25000,reference:'ME0123456789abcdef0123456789abcdef',
 }),(error:any)=>error.code==='PAYMENT_NOT_CONFIGURED');
});
test('authenticated payment mode endpoint exposes only the active QR mode',async()=>{
 assert.equal((await request(app).get('/api/payments/mode')).status,401);
 const liveSession=request.agent(app);
 assert.equal((await liveSession.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'})).status,200);
 const live=await liveSession.get('/api/payments/mode');
 assert.deepEqual(live.body.data,{mode:'live'});
 assert.deepEqual(Object.keys(live.body.data),['mode']);
 const demoApp=createApp({db,origins:[origin],gateway,demoQr:true,qrMode:'live'});
 const demoSession=request.agent(demoApp);
 assert.equal((await demoSession.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'})).status,200);
 assert.deepEqual((await demoSession.get('/api/payments/mode')).body.data,{mode:'demo'});
 const disabledApp=createApp({db,origins:[origin],gateway,qrMode:'disabled'});
 const disabledSession=request.agent(disabledApp);
 assert.equal((await disabledSession.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'})).status,200);
 assert.deepEqual((await disabledSession.get('/api/payments/mode')).body.data,{mode:'disabled'});
});
test('HTTP authentication, role boundaries, CSRF and immediate account locking',async()=>{
 assert.equal((await request(app).get('/api/users')).status,401);
 assert.equal((await request(app).get('/api/auth/me').set('Cookie','me_session=j%3A%7B%22bad%22%3Atrue%7D')).status,401);
 const session=request.agent(app);const login=await session.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'});
 assert.equal(login.status,200);assert.equal(login.body.data.vai_tro,'Nhân viên');assert.ok(!('mat_khau_bam' in login.body.data));
 assert.equal((await session.get('/api/reports/revenue').query({date:'2026-11-09'})).status,403);
 assert.equal((await session.get('/api/users')).status,403);
 assert.equal((await session.post('/api/auth/logout')).status,403);
 await usersService(db).status(employee.id,'Đã khóa');
 const locked=await session.get('/api/auth/me');
 assert.equal(locked.status,401);
 assert.equal(locked.body.error.code,'ACCOUNT_LOCKED');
 const denied=await session.get('/api/menu');
 assert.equal(denied.status,401);
 assert.equal(denied.body.error.code,'ACCOUNT_LOCKED');
 const attempt=(password:string)=>session.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:password});
 assert.equal((await attempt('wrong')).body.error.code,'INVALID_CREDENTIALS');
 assert.equal((await attempt('test-password')).body.error.code,'ACCOUNT_LOCKED');
 await usersService(db).status(employee.id,'Đang hoạt động');
 const revoked=await session.get('/api/auth/me');
 assert.equal(revoked.status,401);
 assert.equal(revoked.body.error.code,'UNAUTHENTICATED');
});
test('the refresh stream delivers the lock reason and closes after session revocation',async()=>{
 const login=await request(app).post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'});
 const cookie=(login.headers['set-cookie'] as unknown as string[]).map(v=>v.split(';')[0]).join('; ');
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number};
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),8000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
   const response=await fetch(`http://127.0.0.1:${address.port}/api/events`,{headers:{Cookie:cookie,Origin:origin},signal:abort.signal});assert.equal(response.status,200);
   reader=response.body!.getReader();let text=new TextDecoder().decode((await reader.read()).value);assert.ok(text.includes('event: ready'));
   await usersService(db).status(employee.id,'Đã khóa');
   while(!text.includes('event: session-ended')){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}
   assert.ok(text.includes('event: session-ended\ndata: {"reason":"locked"}'));
 }finally{clearTimeout(timeout);await reader?.cancel();abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('local app shutdown closes SSE streams before closing the HTTP server',async()=>{
 const login=await request(app).post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'});
 const cookie=(login.headers['set-cookie'] as unknown as string[]).map(v=>v.split(';')[0]).join('; ');
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number};
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),5000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
   const response=await fetch(`http://127.0.0.1:${address.port}/api/events`,{headers:{Cookie:cookie,Origin:origin},signal:abort.signal});assert.equal(response.status,200);
   reader=response.body!.getReader();assert.ok(new TextDecoder().decode((await reader.read()).value).includes('event: ready'));
   const closeStreams=app.closeEventStreams();
   const closeServer=new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
   await closeStreams;
   let ended=false;
   while(true){const chunk=await reader.read();if(chunk.done){ended=true;break;}}
   assert.equal(ended,true);
   await closeServer;
 }finally{clearTimeout(timeout);await reader?.cancel();abort.abort();server.closeAllConnections();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('logout revokes the server session and bad passwords are rejected',async()=>{
 const agent=request.agent(app);assert.equal((await agent.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'manager',mat_khau:'wrong'})).status,401);
 assert.equal((await agent.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'manager',mat_khau:'test-password'})).status,200);
 assert.equal((await agent.post('/api/auth/logout').set('Origin',origin)).status,200);
 assert.equal((await agent.get('/api/auth/me')).status,401);
 await assert.rejects(usersService(db).status(manager.id,'Đã khóa'),(e:any)=>e.code==='LAST_MANAGER');
});
test('concurrent orders cannot reserve the same remaining stock twice',async()=>{
 const result=await Promise.allSettled([ordersService(db).create(employee,items(6),true),ordersService(db).create(employee,items(6),true)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 assert.equal(Number((await one('SELECT sum(so_luong_giu) AS total FROM giu_ton_don_hang')).total),6);
});
test('HTTP creates an order once for an idempotency key and rejects changed payload',async()=>{
 const agent=request.agent(app);await agent.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'});
 const key=randomUUID();const create=()=>agent.post('/api/orders').set('Origin',origin).set('Idempotency-Key',key).send(items(2));
 const first=await create(),second=await create();assert.equal(first.status,201);assert.equal(second.status,201);assert.equal(first.body.data.ma_don,second.body.data.ma_don);
 assert.equal((await db.query('SELECT * FROM don_hang')).rows.length,1);
 assert.equal((await agent.post('/api/orders').set('Origin',origin).set('Idempotency-Key',key).send(items(3))).status,409);
});
test('an import retry never increases stock a second time',async()=>{
 const inventory=inventoryService(db),key=randomUUID();const input={ten_nha_cung_cap:'Nhà cung cấp thử',ngay_nhap:new Date(Date.now()+7*3600000).toISOString().slice(0,10),trang_thai_thanh_toan:'Công nợ' as const,items:[{ma_nguyen_lieu:material,so_luong_dat:5,so_luong_nhan:5,don_gia:1000}]};
 const first=await inventory.import(manager,input,key);const second=await inventory.import(manager,input,key);assert.equal(first.ma_po,second.ma_po);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),15);
});
test('draft cancellation releases stock and leaves no order history',async()=>{
 const order=await ordersService(db).create(employee,items(10),false);assert.equal(order.da_xac_nhan,false);
 await ordersService(db).cancel(employee,order.ma_don);
 assert.equal((await db.query('SELECT * FROM giu_ton_don_hang')).rows.length,0);
 assert.equal((await ordersService(db).list(manager,{page:1,limit:20},true)).length,0);
 await ordersService(db).create(employee,items(10),true);
});
test('price snapshots, insufficient cash, one payment, and preparation state order',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);const order=await orders.create(employee,items(2),true);
 await db.query('UPDATE mon SET don_gia_hien_tai=30000 WHERE ma_mon=$1',[menu]);
 await assert.rejects(payments.cash(employee,order.ma_don,49000),(e:any)=>e.code==='INSUFFICIENT_CASH');
 await assert.rejects(orders.phase(employee,order.ma_don,'Bắt đầu pha chế'),(e:any)=>e.code==='UNPAID_ORDER');
 const paid=await payments.cash(employee,order.ma_don,60000);assert.equal(paid.tien_thua,10000);
 if(process.platform==='win32'){const invoice=await orders.invoice(employee,order.ma_don);assert.equal(invoice.subarray(0,4).toString(),'%PDF');}
 assert.equal((await orders.ticket(employee,order.ma_don)).items[0].so_luong,2);
 await payments.cash(employee,order.ma_don,60000);
 assert.equal((await db.query('SELECT * FROM giao_dich_thanh_toan')).rows.length,1);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),8);
 await assert.rejects(orders.cancel(employee,order.ma_don),(e:any)=>e.code==='CANNOT_CANCEL');
 await assert.rejects(orders.phase(employee,order.ma_don,'Hoàn tất pha chế'));
 await orders.phase(employee,order.ma_don,'Bắt đầu pha chế');await orders.phase(employee,order.ma_don,'Hoàn tất pha chế');
 assert.equal(Number((await orders.list(manager,{page:1,limit:20},true))[0].tong_tien),50000);
});
test('QR requires a signed matching successful event and is reconciled only once',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);const order=await orders.create(employee,items(),true);
 const qr=await payments.qr(employee,order.ma_don);
 await assert.rejects(payments.reconcile(employee,qr.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 const event={eventId:'event-1',paymentId:qr.ma_giao_dich,orderCode:order.ma_don_hien_thi,reference:qr.ma_tham_chieu_qr,amount:25000,status:'success'};
 const raw=Buffer.from(JSON.stringify(event));const signature=createHmac('sha256',secret).update(raw).digest('hex');
 await assert.rejects(payments.webhook(raw,'bad'),(e:any)=>e.code==='INVALID_SIGNATURE');
 const received=await request(app).post('/api/payments/webhook').set('Content-Type','application/json').set('X-Webhook-Signature',signature).send(raw.toString());assert.equal(received.status,200);
 await payments.webhook(raw,signature);await payments.reconcile(employee,qr.ma_giao_dich);await payments.reconcile(employee,qr.ma_giao_dich);
 assert.equal((await db.query('SELECT * FROM su_kien_thanh_toan')).rows.length,1);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),9);
});
test('demo QR reconciles only in demo mode and consumes held stock once without a webhook',async()=>{
 const order=await ordersService(db).create(employee,items(),true);
 const realPayment=await paymentsService(db,gateway,secret).qr(employee,order.ma_don);
 assert.ok(realPayment.ma_tham_chieu_qr?.startsWith('ME'));
 const demoGateway=sepayGateway('970422','0333101167','NGUYEN THANH SANG');
 const demoApp=createApp({db,origins:[origin],gateway:demoGateway,demoQr:true});
 const session=request.agent(demoApp);
 assert.equal((await session.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:'employee',mat_khau:'test-password'})).status,200);
 assert.deepEqual((await session.get('/api/payments/mode')).body.data,{mode:'demo'});
 const created=await session.post('/api/payments/qr').set('Origin',origin).send({ma_don:order.ma_don});
 assert.equal(created.status,201);
 const demoPayment=created.body.data;
 assert.equal(demoPayment.qr_mo_phong,true);
 assert.ok(demoPayment.qrContent);
 assert.match(demoPayment.ma_tham_chieu_qr,/^DEMO[A-Z0-9]+$/);
 const demoFields=parseTlv(decodeQrImage(demoPayment.qrImageUrl));
 assert.equal(demoFields.get('54'),String(order.tong_tien));
 assert.equal(parseTlv(demoFields.get('62')??'').get('08'),demoPayment.ma_tham_chieu_qr);
 assert.equal(demoFields.get('63'),emvCrc16(demoPayment.qrContent.slice(0,-4)));
 const pendingOrder=await session.get(`/api/orders/${order.ma_don}`);
 assert.equal(pendingOrder.body.data.da_thanh_toan,false);
 assert.equal(pendingOrder.body.data.payments.find((p:any)=>p.ma_giao_dich===demoPayment.ma_giao_dich).qr_mo_phong,true);
 const savedRealPayment=pendingOrder.body.data.payments.find((p:any)=>p.ma_giao_dich===realPayment.ma_giao_dich);
 assert.ok(savedRealPayment);
 assert.equal(savedRealPayment.qr_mo_phong,false);
 assert.equal(savedRealPayment.trang_thai,'Chờ xác nhận');
 assert.equal(demoPayment.trang_thai,'Chờ xác nhận');
 assert.notEqual(realPayment.ma_giao_dich,demoPayment.ma_giao_dich);
 await assert.rejects(paymentsService(db,gateway,secret,true).reconcile(employee,realPayment.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 await assert.rejects(paymentsService(db,gateway,secret,false).reconcile(employee,demoPayment.ma_giao_dich),(e:any)=>e.code==='DEMO_QR_DISABLED');
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),10);
 const reconcilePath=`/api/payments/${demoPayment.ma_giao_dich}/reconcile`;
 assert.equal((await session.post(reconcilePath).set('Origin',origin)).status,200);
 assert.equal((await session.post(reconcilePath).set('Origin',origin)).status,200);
 assert.equal((await session.get(`/api/orders/${order.ma_don}`)).body.data.da_thanh_toan,true);
 assert.equal((await db.query("SELECT * FROM giao_dich_thanh_toan WHERE ma_don=$1 AND trang_thai='Thành công'",[order.ma_don])).rows.length,1);
 assert.equal((await db.query('SELECT * FROM su_kien_thanh_toan')).rows.length,0);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),9);
});
test('legacy hyphenated demo QR remains marked and reconcilable without weakening live reconciliation',async()=>{
 const orders=ordersService(db),order=await orders.create(employee,items(),true);
 const id=randomUUID();
 await db.query(`INSERT INTO giao_dich_thanh_toan(ma_giao_dich,ma_don,phuong_thuc,so_tien_thanh_toan,ma_tham_chieu_qr,trang_thai)
  VALUES($1,$2,'Chuyển khoản qua QR',25000,'DEMO-01234567-89ab-cdef-0123-456789abcdef','Chờ xác nhận')`,[id,order.ma_don]);
 const details=await orders.get(employee,order.ma_don);
 assert.equal(details.payments[0].qr_mo_phong,true);
 await assert.rejects(paymentsService(db,gateway,secret,false).reconcile(employee,id),(error:any)=>error.code==='DEMO_QR_DISABLED');
 await paymentsService(db,gateway,secret,true).reconcile(employee,id);
 assert.equal((await orders.get(employee,order.ma_don)).da_thanh_toan,true);
 const listed=await orders.list(employee,{page:1,limit:20},false);
 assert.equal(listed.find((item:any)=>item.ma_don===order.ma_don).qr_mo_phong,true);
 await orders.phase(employee,order.ma_don,'Bắt đầu pha chế');
 await orders.phase(employee,order.ma_don,'Hoàn tất pha chế');
 const history=await orders.list(manager,{page:1,limit:20},true);
 assert.equal(history.find((item:any)=>item.ma_don===order.ma_don).qr_mo_phong,true);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),9);

 const liveOrder=await orders.create(employee,items(),true);
 const live=await paymentsService(db,gateway,secret).qr(employee,liveOrder.ma_don);
 await assert.rejects(paymentsService(db,gateway,secret,true).reconcile(employee,live.ma_giao_dich),(error:any)=>error.code==='PAYMENT_UNCONFIRMED');
 assert.equal((await orders.get(employee,liveOrder.ma_don)).da_thanh_toan,false);
});
test('pending or underpaid QR events do not count as paid',async()=>{
 const order=await ordersService(db).create(employee,items(),true);const payments=paymentsService(db,gateway,secret);const qr=await payments.qr(employee,order.ma_don);
 for(const [eventId,status,amount] of [['pending','pending',25000],['underpaid','success',24000]] as const){const raw=Buffer.from(JSON.stringify({eventId,status,amount,paymentId:qr.ma_giao_dich,orderCode:order.ma_don_hien_thi,reference:qr.ma_tham_chieu_qr}));
 await payments.webhook(raw,createHmac('sha256',secret).update(raw).digest('hex'));}
 await assert.rejects(payments.reconcile(employee,qr.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),10);
});
test('recurring shift creation is atomic when a later date overlaps',async()=>{
 const service=shiftsService(db);const day='2099-02-02';
 await service.create({ngay_lam:'2099-02-09',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2});
 await assert.rejects(service.create({ngay_lam:day,gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2,lap:{so_tuan:3}}));
 assert.equal((await db.query('SELECT * FROM ca_lam WHERE ngay_lam=$1',[day])).rows.length,0);
});
test('weekly calendar projects active assignment state for each registration',async()=>{
 const service=shiftsService(db);const day='2099-04-01';
 const scheduled=(await service.create({ngay_lam:day,gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2}))[0];
 await service.register(employee,{ngay:day,gio_bat_dau:'07:00',gio_ket_thuc:'12:00',loai_dang_ky:'Mong muốn'});
 await service.register(colleague,{ngay:day,gio_bat_dau:'12:00',gio_ket_thuc:'17:00',loai_dang_ky:'Rảnh'});
 await service.assign(scheduled.ma_ca,[employee.id]);
 const calendar=await service.calendar(manager,day,day);
 const assigned=calendar.registrations.find(item=>item.ma_nhan_vien===employee.id);
 const available=calendar.registrations.find(item=>item.ma_nhan_vien===colleague.id);
 assert.equal(assigned?.da_phan_cong,true);
 assert.equal(available?.da_phan_cong,false);
 assert.equal('da_chot' in (assigned??{}),false);
});
test('shift exchange needs colleague agreement and manager approval',async()=>{
 const service=shiftsService(db);const a=(await service.create({ngay_lam:'2099-03-01',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2}))[0];
 const b=(await service.create({ngay_lam:'2099-03-02',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2}))[0];
 await service.register(employee,{ngay:'2099-03-01',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',loai_dang_ky:'Mong muốn'});
 await service.register(colleague,{ngay:'2099-03-02',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',loai_dang_ky:'Rảnh'});
 await service.assign(a.ma_ca,[employee.id]);await service.assign(b.ma_ca,[colleague.id]);
 const change=await service.request(employee,{ma_ca:a.ma_ca,loai_yeu_cau:'Đổi ca hai chiều',ma_nhan_vien_duoc_de_nghi:colleague.id,ma_ca_cua_dong_nghiep:b.ma_ca,ly_do:'Lịch học'});
 await assert.rejects(service.decide(change.ma_yeu_cau,true));
 await assert.rejects(service.respond(employee,change.ma_yeu_cau,true));
 await service.respond(colleague,change.ma_yeu_cau,true);await service.decide(change.ma_yeu_cau,true);
 const assignment=await one('SELECT * FROM phan_cong_ca WHERE ma_ca=$1 AND dang_hieu_luc',[a.ma_ca]);assert.equal(assignment.ma_nhan_vien,colleague.id);
});
test('manager approval revalidates conflicts introduced while a request waited',async()=>{
 const service=shiftsService(db);const a=(await service.create({ngay_lam:'2099-03-10',gio_bat_dau:'07:00',gio_ket_thuc:'12:00',so_nhan_vien_toi_thieu:1,so_nhan_vien_toi_da:2}))[0];
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[a.ma_ca,employee.id]);
 const change=await service.request(employee,{ma_ca:a.ma_ca,loai_yeu_cau:'Nhờ nhân viên khác làm thay',ma_nhan_vien_duoc_de_nghi:colleague.id,ly_do:'Bận học'});await service.respond(colleague,change.ma_yeu_cau,true);
 // Simulate a competing existing assignment outside this request.
 const other=await one(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES('2099-03-10','08:00','10:00',1,2) RETURNING *`);
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[other.ma_ca,colleague.id]);
 await assert.rejects(service.decide(change.ma_yeu_cau,true));
 assert.equal((await one('SELECT trang_thai FROM yeu_cau_thay_doi_ca WHERE ma_yeu_cau=$1',[change.ma_yeu_cau])).trang_thai,'Chờ xử lý');
 assert.equal((await one('SELECT ma_nhan_vien FROM phan_cong_ca WHERE ma_ca=$1 AND dang_hieu_luc',[a.ma_ca])).ma_nhan_vien,employee.id);
});
test('stock thresholds, discrepancy reasons, sequential closing, and immutable counts',async()=>{
 await endShift();const inventory=inventoryService(db);await db.query('UPDATE nguyen_lieu SET nguong_chenh_lech=1 WHERE ma_nguyen_lieu=$1',[material]);
 await assert.rejects(inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:8}]}),(e:any)=>e.code==='MISSING_STOCK_REASON');
 const count=await inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:9}]});
 await assert.rejects(inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:9}]}),(e:any)=>e.code==='COUNT_EXISTS');
 const report=await inventory.createReport(employee,count.ma_phieu);await inventory.send(employee,report.ma_bao_cao);await inventory.confirm(manager,report.ma_bao_cao);await inventory.confirm(manager,report.ma_bao_cao);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),9);
 assert.equal((await db.query(`SELECT * FROM bien_dong_kho WHERE loai='Kiểm kê'`)).rows.length,1);
 const detail=await inventory.report(manager,report.ma_bao_cao);
 assert.equal(detail.ho_ten_nguoi_lap,'employee');
 assert.equal(detail.ho_ten_nguoi_xac_nhan,'manager');
 assert.equal(detail.gio_bat_dau,'00:00:00');
 assert.equal((await inventory.reports(manager))[0].ho_ten_nguoi_lap,'employee');
});
test('count retries reuse the committed count and reject altered or cross-user requests',async()=>{
 await endShift();const inventory=inventoryService(db);const key=randomUUID();
 const payload={ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:10}]};
 const first=await inventory.count(employee,payload,key);
 const repeated=await inventory.count(employee,payload,key);
 assert.equal(repeated.ma_phieu,first.ma_phieu);
 assert.equal((await db.query('SELECT * FROM phieu_kiem_kho')).rows.length,1);
 await assert.rejects(inventory.count(employee,{...payload,tien_mat_thuc_thu:1},key),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(inventory.count(colleague,payload,key),(error:any)=>error.code==='IDEMPOTENCY_CONFLICT');
});

test('late closing preserves stock movements after counting',async()=>{
 await endShift();const inventory=inventoryService(db);const count=await inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:8,ly_do_chenh_lech:'Hao hụt'}]});
 const report=await inventory.createReport(employee,count.ma_phieu);await inventory.send(employee,report.ma_bao_cao);
 const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 await inventory.import(manager,{ten_nha_cung_cap:'Nhà cung cấp thử',ngay_nhap:today,trang_thai_thanh_toan:'Đã thanh toán',hinh_thuc_thanh_toan:'Tiền mặt',items:[{ma_nguyen_lieu:material,so_luong_dat:5,so_luong_nhan:5,don_gia:1000}]});
 await inventory.confirm(manager,report.ma_bao_cao);
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),13);
 assert.equal((await inventory.losses(20,0)).length,1);
});
test('closing is rolled back entirely when one material cannot be reconciled',async()=>{
 await endShift();const second=(await one(`INSERT INTO nguyen_lieu(ten_nguyen_lieu,don_vi_tinh,ton_ly_thuyet) VALUES('Nguyên liệu thứ hai','ly',10) RETURNING *`)).ma_nguyen_lieu;
 const inventory=inventoryService(db);const count=await inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:8,ly_do_chenh_lech:'Hao hụt'},{ma_nguyen_lieu:second,ton_ly_thuyet:10,ton_thuc_te:5,ly_do_chenh_lech:'Hao hụt'}]});
 const report=await inventory.createReport(employee,count.ma_phieu);await inventory.send(employee,report.ma_bao_cao);
 await db.query('UPDATE nguyen_lieu SET ton_ly_thuyet=2 WHERE ma_nguyen_lieu=$1',[second]);
 await assert.rejects(inventory.confirm(manager,report.ma_bao_cao),(e:any)=>e.code==='STOCK_RECONCILIATION_CONFLICT');
 assert.equal(Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet),10);
 assert.equal((await one('SELECT trang_thai FROM bao_cao_cuoi_ca WHERE ma_bao_cao=$1',[report.ma_bao_cao])).trang_thai,'Chờ xác nhận');
 assert.equal((await db.query(`SELECT * FROM bien_dong_kho WHERE loai='Kiểm kê'`)).rows.length,0);
});
test('revenue distinguishes paid and closed totals and exports actual Excel/PDF',async()=>{
 const order=await ordersService(db).create(employee,items(2),true);await paymentsService(db,gateway,secret).cash(employee,order.ma_don,50000);
 const reports=reportsService(db);const date=new Date(Date.now()+7*3600000).toISOString().slice(0,10);const filters={date,period:'day' as const};
 const result=await reports.revenue(filters);assert.equal(result.doanh_thu,'50000');assert.equal(result.so_ly,'2');assert.equal(result.doanh_thu_da_chot,'0');
 const excel=await reports.export(filters,'xlsx');assert.equal(excel.subarray(0,2).toString(),'PK');
 if(process.platform==='win32'){const pdf=await reports.export(filters,'pdf');assert.equal(pdf.subarray(0,4).toString(),'%PDF');}
 await assert.rejects(reports.export({date:'2000-01-01',period:'day'},'xlsx'),(e:any)=>e.code==='NO_REPORT_DATA');
 await ordersService(db).phase(employee,order.ma_don,'Bắt đầu pha chế');await ordersService(db).phase(employee,order.ma_don,'Hoàn tất pha chế');await endShift();
 const inventory=inventoryService(db);const count=await inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:50000,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:8,ton_thuc_te:8}]});
 const report=await inventory.createReport(employee,count.ma_phieu);await inventory.send(employee,report.ma_bao_cao);await inventory.confirm(manager,report.ma_bao_cao);
 assert.equal((await reports.revenue(filters)).doanh_thu_da_chot,'50000');
});
