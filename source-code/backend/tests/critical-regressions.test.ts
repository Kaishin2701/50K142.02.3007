import { test,before,after,beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { migrate } from '../src/shared/migrations.js';
import type { Database,Row } from '../src/shared/database.js';
import { hashPassword,type Actor } from '../src/modules/auth/auth.service.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { usersService } from '../src/modules/users/users.service.js';
import { ordersService } from '../src/modules/orders/orders.service.js';
import { paymentsService,type Gateway } from '../src/modules/payments/payments.service.js';
import { inventoryService } from '../src/modules/inventory/inventory.service.js';
import { createApp } from '../src/app.js';

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

async function qrEvent(service:ReturnType<typeof paymentsService>,order:any,payment:any,amount:number,status='success'){
 const raw=Buffer.from(JSON.stringify({eventId:randomUUID(),paymentId:payment.ma_giao_dich,orderCode:order.ma_don_hien_thi,reference:payment.ma_tham_chieu_qr,amount,status}));
 return service.webhook(raw,createHmac('sha256',secret).update(raw).digest('hex'));
}
async function stock(){return Number((await one('SELECT ton_ly_thuyet FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[material])).ton_ly_thuyet);}

async function login(name:string){
 const session=request.agent(app);
 assert.equal((await session.post('/api/auth/login').set('Origin',origin).send({ten_dang_nhap:name,mat_khau:'test-password'})).status,200);
 return session;
}

const countPayload=()=>({ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:9,ly_do_chenh_lech:'Hao hụt' as const}]});

test('P1-04: a legacy stranded count is recovered by saving the existing locked account without reactivation',async()=>{
 await endShift();const inventory=inventoryService(db),users=usersService(db),count:Row=await inventory.count(employee,countPayload());
 await db.query("UPDATE nguoi_dung SET trang_thai='Đã khóa' WHERE ma_nguoi_dung=$1",[employee.id]);
 const user=await users.get(employee.id);
 const saved=await users.update(employee.id,{ten_dang_nhap:user.ten_dang_nhap,ho_ten:user.ho_ten,so_dien_thoai:user.so_dien_thoai,vai_tro:'Nhân viên'});
 assert.equal(saved.trang_thai,'Đã khóa');
 const reports=await inventory.reports(manager);assert.equal(reports.length,1);assert.equal(reports[0].ma_phieu,count.ma_phieu);assert.equal(reports[0].trang_thai,'Chờ xác nhận');
 await inventory.confirm(manager,reports[0].ma_bao_cao);assert.equal(await stock(),9);
});

test('P1-04: locking the count owner preserves data and leaves an actionable report for manager approval',async()=>{
 await endShift();const staff=await login('employee'),admin=await login('manager');
 const saved=await staff.post('/api/inventory/counts').set('Origin',origin).set('Idempotency-Key',randomUUID()).send(countPayload());
 assert.equal(saved.status,201);const count=saved.body.data;
 assert.equal((await admin.patch('/api/users/'+employee.id+'/status').set('Origin',origin).send({trang_thai:'Đã khóa'})).status,200);
 assert.equal((await staff.get('/api/auth/me')).status,401);
 const reports=await admin.get('/api/inventory/close-reports');assert.equal(reports.status,200);assert.equal(reports.body.data.length,1);
 const report=reports.body.data[0];assert.equal(report.ma_phieu,count.ma_phieu);assert.equal(report.ma_nguoi_kiem_ke,employee.id);assert.equal(report.trang_thai,'Chờ xác nhận');
 assert.equal(await stock(),10);
 const detail=(await admin.get('/api/inventory/close-reports/'+report.ma_bao_cao)).body.data;
 assert.equal(Number(detail.items[0].ton_thuc_te),9);assert.equal(detail.items[0].ly_do_chenh_lech,'Hao hụt');
 for(let i=0;i<2;i++)assert.equal((await admin.post('/api/inventory/close-reports/'+report.ma_bao_cao+'/confirm').set('Origin',origin)).status,200);
 assert.equal(await stock(),9);assert.equal((await one("SELECT count(*)::int AS n FROM bien_dong_kho WHERE loai='Kiểm kê'")).n,1);
 const next=(await one(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-2,'00:00','23:59',1,3) RETURNING *`)).ma_ca;
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[next,colleague.id]);
 const later:Row=await inventoryService(db).count(colleague,{...countPayload(),ma_ca:next,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:9,ton_thuc_te:9}]});
 assert.ok(later.ma_phieu);
});

test('P1-04: role change forwards an existing draft once, without changing ownership or applying stock',async()=>{
 await endShift();const inventory=inventoryService(db),count:Row=await inventory.count(employee,countPayload());
 const draft=await inventory.createReport(employee,count.ma_phieu);
 const user=await usersService(db).get(employee.id);
 const update={ten_dang_nhap:user.ten_dang_nhap,ho_ten:user.ho_ten,so_dien_thoai:user.so_dien_thoai,vai_tro:'Quản lý' as const};
 await usersService(db).update(employee.id,update);
 const report:Row=await inventory.report(manager,draft.ma_bao_cao);assert.equal(report.trang_thai,'Chờ xác nhận');
 assert.equal(report.ma_nguoi_kiem_ke,employee.id);assert.equal(report.ma_nguoi_xac_nhan,null);assert.equal(await stock(),10);
 const notified=(await one("SELECT count(*)::int AS n FROM thong_bao WHERE loai='BAO_CAO_CUOI_CA'")).n;
 await usersService(db).update(employee.id,update);await usersService(db).status(employee.id,'Đã khóa');
 assert.equal((await one('SELECT count(*)::int AS n FROM bao_cao_cuoi_ca')).n,1);
 assert.equal((await one("SELECT count(*)::int AS n FROM thong_bao WHERE loai='BAO_CAO_CUOI_CA'")).n,notified);
 await inventory.confirm(manager,report.ma_bao_cao);assert.equal(await stock(),9);
});

test('P1-04: count and account lock serialize in either order without leaving an unreachable draft',async()=>{
 await endShift();const inventory=inventoryService(db),users=usersService(db);
 const results=await Promise.allSettled([inventory.count(employee,countPayload()),users.status(employee.id,'Đã khóa')]);
 assert.equal(results[1].status,'fulfilled');
 const counts=(await db.query('SELECT * FROM phieu_kiem_kho')).rows;
 const reports=await inventory.reports(manager);
 if(counts.length){assert.equal(reports.length,1);assert.equal(reports[0].trang_thai,'Chờ xác nhận');}
 else assert.equal(results[0].status,'rejected');
 assert.equal(await stock(),10);
});

test('P1-04: a request authenticated before locking or role change cannot create a late stranded count',async()=>{
 await endShift();await usersService(db).status(employee.id,'Đã khóa');
 await assert.rejects(inventoryService(db).count(employee,countPayload()),(e:any)=>e.code==='FORBIDDEN');
 assert.equal((await one('SELECT count(*)::int AS n FROM phieu_kiem_kho')).n,0);
 await usersService(db).status(employee.id,'Đang hoạt động');
 const user=await usersService(db).get(employee.id);
 await usersService(db).update(employee.id,{ten_dang_nhap:user.ten_dang_nhap,ho_ten:user.ho_ten,so_dien_thoai:user.so_dien_thoai,vai_tro:'Quản lý'});
 await assert.rejects(inventoryService(db).count(employee,countPayload()),(e:any)=>e.code==='FORBIDDEN');
 assert.equal((await one('SELECT count(*)::int AS n FROM phieu_kiem_kho')).n,0);
});

test('P1-04: ordinary edits keep the draft workflow and completed reports remain untouched',async()=>{
 await endShift();const inventory=inventoryService(db),users=usersService(db),count:Row=await inventory.count(employee,countPayload());
 const user=await users.get(employee.id);
 await users.update(employee.id,{ten_dang_nhap:user.ten_dang_nhap,ho_ten:'Tên mới',so_dien_thoai:user.so_dien_thoai,vai_tro:'Nhân viên'});
 assert.equal((await inventory.reports(manager)).length,0);
 const draft=await inventory.createReport(employee,count.ma_phieu);assert.equal(draft.trang_thai,'Nháp');
 await inventory.send(employee,draft.ma_bao_cao);const sent:Row=await inventory.report(manager,draft.ma_bao_cao);
 await users.status(employee.id,'Đã khóa');assert.equal(String((await inventory.report(manager,draft.ma_bao_cao) as Row).thoi_gian_gui),String(sent.thoi_gian_gui));
 await inventory.confirm(manager,draft.ma_bao_cao);const confirmed=await inventory.report(manager,draft.ma_bao_cao);
 await users.status(employee.id,'Đang hoạt động');await users.status(employee.id,'Đã khóa');
 assert.deepEqual(await inventory.report(manager,draft.ma_bao_cao),confirmed);assert.equal(await stock(),9);
});

test('P1-03: active draft can be rediscovered and cancelled without releasing another live draft',async()=>{
 const orders=ordersService(db),draft=await orders.create(employee,items(10),false);
 const staff=await login('employee');const listed=await staff.get('/api/orders');
 assert.equal(listed.status,200);assert.equal(listed.body.data.length,1);
 assert.equal(listed.body.data[0].ma_don,draft.ma_don);assert.equal(listed.body.data[0].da_xac_nhan,false);
 await assert.rejects(orders.create(employee,items(),false),(e:any)=>e.code==='INSUFFICIENT_STOCK');
 assert.equal((await orders.get(employee,draft.ma_don) as Row).da_xac_nhan,false);
 assert.equal((await orders.list(manager,{page:1,limit:20},true)).length,0);
 assert.equal((await staff.delete('/api/orders/'+draft.ma_don).set('Origin',origin)).status,200);
 assert.equal((await orders.create(employee,items(10),true)).da_xac_nhan,true);
 assert.equal(await stock(),10);
});

test('P1-03: ended-shift draft cannot strand stock in the next shift; old idempotency key cannot resurrect it',async()=>{
 const orders=ordersService(db),key=randomUUID(),oldInput=items(10),draft=await orders.create(employee,oldInput,false,key);
 await endShift();
 const next=(await one(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'00:00','23:59:59.999999',1,3) RETURNING *`)).ma_ca;
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[next,employee.id]);
 const fresh=await orders.create(employee,{...items(10),ma_ca:next},false);
 assert.ok(fresh.ma_don);await assert.rejects(orders.get(employee,draft.ma_don),(e:any)=>e.code==='NOT_FOUND');
 await assert.rejects(orders.create(employee,oldInput,false,key),(e:any)=>e.code==='ORIGINAL_ORDER_REMOVED');
 assert.equal((await one('SELECT count(*)::int AS n FROM giu_ton_don_hang')).n,1);
 assert.equal(await stock(),10);
});

test('P1-03: closing releases only abandoned ended drafts and never a confirmed order',async()=>{
 const orders=ordersService(db),inventory=inventoryService(db),draft=await orders.create(employee,items(9),false);
 const confirmed=await orders.create(employee,items(),true);await endShift();
 const input={ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:10}]};
 await assert.rejects(inventory.count(employee,input),(e:any)=>e.code==='UNFINISHED_ORDERS');
 assert.equal((await orders.get(employee,confirmed.ma_don) as Row).da_xac_nhan,true);
 await orders.cancel(employee,confirmed.ma_don);
 const count:Row=await inventory.count(employee,input);assert.ok(count.ma_phieu);
 await assert.rejects(orders.get(employee,draft.ma_don),(e:any)=>e.code==='NOT_FOUND');
 assert.equal((await db.query('SELECT * FROM giu_ton_don_hang')).rows.length,0);
 assert.equal(await stock(),10);
});

test('P1-03: defensive cleanup preserves any draft with a payment record',async()=>{
 const orders=ordersService(db),draft=await orders.create(employee,items(),false);
 // Legacy/inconsistent fixture: drafts normally cannot have payments.
 await db.query(`INSERT INTO giao_dich_thanh_toan(ma_don,phuong_thuc,so_tien_thanh_toan,ma_tham_chieu_qr,trang_thai) VALUES($1,'Chuyển khoản qua QR',25000,'legacy-reference','Chờ xác nhận')`,[draft.ma_don]);
 await endShift();
 await assert.rejects(inventoryService(db).count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:0,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:10,ton_thuc_te:10}]}),(e:any)=>e.code==='UNFINISHED_ORDERS');
 assert.ok(await orders.get(employee,draft.ma_don));
 assert.equal((await one('SELECT count(*)::int AS n FROM giao_dich_thanh_toan')).n,1);
});

test('P1-05: HTTP list and count expose only assigned orders; history remains manager-only',async()=>{
 const orders=ordersService(db),own=await orders.create(employee,items(),true);
 const otherShift=(await one(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'00:00:00.000001','23:59:59.999999',1,3) RETURNING *`)).ma_ca;
 await db.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[otherShift,colleague.id]);
 const other=await orders.create(colleague,{...items(),ma_ca:otherShift},true);
 const staff=await login('employee'),admin=await login('manager');
 const listed=await staff.get('/api/orders').query({limit:1});assert.equal(listed.status,200);
 assert.equal(listed.body.data.length,1);assert.equal(listed.body.data[0].ma_don,own.ma_don);assert.equal(listed.body.data[0].total,1);
 assert.deepEqual((await staff.get('/api/orders').query({code:other.ma_don_hien_thi})).body.data,[]);
 assert.equal((await staff.get('/api/orders/'+other.ma_don)).status,403);
 assert.equal((await staff.get('/api/orders/history')).status,403);
 assert.equal((await admin.get('/api/orders')).body.data.length,2);
 await db.query('UPDATE phan_cong_ca SET dang_hieu_luc=false WHERE ma_ca=$1 AND ma_nhan_vien=$2',[shift,employee.id]);
 assert.deepEqual((await staff.get('/api/orders')).body.data,[]);
 assert.equal((await staff.get('/api/orders/'+own.ma_don)).status,403);
 assert.equal((await admin.get('/api/orders/'+own.ma_don)).status,200);
});

test('P1-02: received transfers survive cancellation and reconcile after shift end, then closing succeeds',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);
 const order=await orders.create(employee,items(),true),payment:Row=await payments.qr(employee,order.ma_don);
 await qrEvent(payments,order,payment,25000);await endShift();
 await assert.rejects(orders.cancel(employee,order.ma_don),(e:any)=>e.code==='CANNOT_CANCEL');
 assert.equal((await one('SELECT ma_giao_dich FROM su_kien_thanh_toan')).ma_giao_dich,payment.ma_giao_dich);
 const result=await payments.reconcile(employee,payment.ma_giao_dich);
 assert.equal(result.trang_thai,'Thành công');
 await payments.reconcile(employee,payment.ma_giao_dich);assert.equal(await stock(),9);
 await orders.phase(employee,order.ma_don,'Bắt đầu pha chế');await orders.phase(employee,order.ma_don,'Hoàn tất pha chế');
 const inventory=inventoryService(db),count:Row=await inventory.count(employee,{ma_ca:shift,tien_mat_thuc_thu:0,chuyen_khoan_thuc_thu:25000,items:[{ma_nguyen_lieu:material,ton_ly_thuyet:9,ton_thuc_te:9}]});
 const report:Row=await inventory.createReport(employee,count.ma_phieu);await inventory.send(employee,report.ma_bao_cao);await inventory.confirm(manager,report.ma_bao_cao);
 assert.equal((await inventory.report(manager,report.ma_bao_cao) as Row).trang_thai,'Đã xác nhận');
 assert.equal(await stock(),9);
});

test('P1-02: partial transfer is not cancelable but unpaid QR remains cancelable',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);
 const order=await orders.create(employee,items(),true),payment:Row=await payments.qr(employee,order.ma_don);
 await qrEvent(payments,order,payment,1);await endShift();
 await assert.rejects(orders.cancel(employee,order.ma_don),(e:any)=>e.code==='CANNOT_CANCEL');
 await assert.rejects(payments.reconcile(employee,payment.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 assert.equal((await orders.get(employee,order.ma_don) as Row).da_thanh_toan,false);
 assert.equal(await stock(),10);
 await db.query('DELETE FROM su_kien_thanh_toan'); // Independent no-receipt fixture.
 assert.equal((await orders.cancel(employee,order.ma_don)).da_huy,true);
 assert.equal((await db.query('SELECT * FROM giu_ton_don_hang')).rows.length,0);
});

test('P1-02: late live reconciliation still requires verified funds and current assignment; demo does not bypass ended shift',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);
 const order=await orders.create(employee,items(),true),payment:Row=await payments.qr(employee,order.ma_don);
 const demo=paymentsService(db,gateway,secret,true),demoPayment:Row=await demo.qr(employee,order.ma_don);
 await endShift();
 await assert.rejects(payments.reconcile(employee,payment.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 await qrEvent(payments,order,payment,25000);
 await assert.rejects(payments.reconcile(colleague,payment.ma_giao_dich),(e:any)=>e.code==='FORBIDDEN');
 await assert.rejects(demo.reconcile(employee,demoPayment.ma_giao_dich));
 // Simulate a legacy/inconsistent checked shift: no new stock or revenue may be applied.
 await db.query(`INSERT INTO phieu_kiem_kho(ma_ca,ma_nguoi_kiem_ke,ngay_kiem_ke,doanh_thu_ca_luc_doi_chieu,tien_mat_thuc_thu,chuyen_khoan_thuc_thu) VALUES($1,$2,current_date,0,0,0)`,[shift,employee.id]);
 await assert.rejects(payments.reconcile(employee,payment.ma_giao_dich),(e:any)=>e.code==='SHIFT_ALREADY_COUNTED');
 assert.equal(await stock(),10);
});

test('P1-01: received QR funds block cash across all payment attempts, including underpayment',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);
 const order=await orders.create(employee,items(),true);
 const first:Row=await payments.qr(employee,order.ma_don);
 await payments.qr(employee,order.ma_don);
 await qrEvent(payments,order,first,1000);
 await assert.rejects(payments.cash(employee,order.ma_don,25000),(e:any)=>e.code==='QR_FUNDS_RECEIVED');
 assert.equal((await one("SELECT count(*)::int AS n FROM giao_dich_thanh_toan WHERE phuong_thuc='Tiền mặt'")).n,0);
 assert.equal(await stock(),10);
 await assert.rejects(payments.reconcile(employee,first.ma_giao_dich),(e:any)=>e.code==='PAYMENT_UNCONFIRMED');
 await qrEvent(payments,order,first,25000);
 const paid:Row=await payments.reconcile(employee,first.ma_giao_dich);
 assert.equal(paid.trang_thai,'Thành công');
 await assert.rejects(payments.cash(employee,order.ma_don,25000),(e:any)=>e.code==='ALREADY_PAID');
 assert.equal(await stock(),9);
});

test('P1-01: SePay incoming event blocks cash and racing cash cannot bypass a committed receipt',async()=>{
 const orders=ordersService(db),payments=paymentsService(db,gateway,secret);
 const order=await orders.create(employee,items(),true),payment:Row=await payments.qr(employee,order.ma_don);
 const raw=Buffer.from(JSON.stringify({id:1,accountNumber:'123456789',transferType:'in',transferAmount:25000,content:payment.ma_tham_chieu_qr}));
 await payments.sepayWebhook(raw,'Apikey '+secret,{secret,account:'123456789'});
 const results=await Promise.allSettled([payments.cash(employee,order.ma_don,25000),payments.reconcile(employee,payment.ma_giao_dich),payments.reconcile(employee,payment.ma_giao_dich)]);
 assert.equal(results[0].status,'rejected');
 assert.equal(results[1].status,'fulfilled');assert.equal(results[2].status,'fulfilled');
 assert.equal((await one("SELECT count(*)::int AS n FROM giao_dich_thanh_toan WHERE trang_thai='Thành công'")).n,1);
 assert.equal(await stock(),9);
});

test('P1-01: pending, failed, zero, wrong-account and outgoing events do not prevent cash or its retry',async()=>{
 const payments=paymentsService(db,gateway,secret),order=await ordersService(db).create(employee,items(),true);
 const payment:Row=await payments.qr(employee,order.ma_don);
 for(const status of ['pending','failed'])await qrEvent(payments,order,payment,25000,status);
 await qrEvent(payments,order,payment,0);
 for(const [accountNumber,transferType] of [['other','in'],['123456789','out']]){
  const raw=Buffer.from(JSON.stringify({id:randomUUID(),accountNumber,transferType,transferAmount:25000,content:payment.ma_tham_chieu_qr}));
  await payments.sepayWebhook(raw,'Apikey '+secret,{secret,account:'123456789'});
 }
 const paid:Row=await payments.cash(employee,order.ma_don,30000);
 assert.equal(paid.tien_thua,5000);
 assert.equal((await payments.cash(employee,order.ma_don,30000) as Row).ma_giao_dich,paid.ma_giao_dich);
 assert.equal(await stock(),9);
});
