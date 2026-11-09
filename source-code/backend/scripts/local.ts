import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { embeddedDatabase } from '../src/shared/embedded.js';
import { migrate } from '../src/shared/migrations.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { createApp } from '../src/app.js';
import { httpGateway } from '../src/modules/payments/payments.service.js';
const directory=fileURLToPath(new URL(process.argv.includes('--qa')?'../.local/qa/':'../.local/',import.meta.url));await mkdir(directory,{recursive:true});
const db=await embeddedDatabase(directory+'postgres');await migrate(db,fileURLToPath(new URL('../../database/',import.meta.url)));
const credentialFile=directory+'access.json';
if(!(await usersRepository.managers(db)).length){
 const password=randomBytes(12).toString('base64url');const employeePassword=randomBytes(12).toString('base64url');
 await db.transaction(async tx=>{
   const admin=await usersRepository.create(tx,{ten_dang_nhap:'quanly',ho_ten:'Quản lý thử nghiệm',so_dien_thoai:'0900000001',vai_tro:'Quản lý',mat_khau_bam:await hashPassword(password)});
   const employee=await usersRepository.create(tx,{ten_dang_nhap:'nhanvien',ho_ten:'Nhân viên thử nghiệm',so_dien_thoai:'0900000002',vai_tro:'Nhân viên',mat_khau_bam:await hashPassword(employeePassword)});
   if(process.argv.includes('--demo')){
     const ingredient=(await tx.query(`INSERT INTO nguyen_lieu(ten_nguyen_lieu,don_vi_tinh,ton_ly_thuyet,muc_ton_toi_thieu) VALUES('Nguyên liệu thử nghiệm','ly',100,10) RETURNING *`)).rows[0];
     for(const [name,price] of [['Cà phê muối',29000],['Cà phê sữa',25000],['Cà phê đen',20000]] as const){const menu=(await tx.query(`INSERT INTO mon(ten_mon,danh_muc,don_gia_hien_tai) VALUES($1,'Cà phê',$2) RETURNING *`,[name,price])).rows[0];await tx.query('INSERT INTO dinh_muc_nguyen_lieu VALUES($1,$2,1)',[menu.ma_mon,ingredient.ma_nguyen_lieu]);}
     const shift=(await tx.query(`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da) VALUES((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,'00:00','23:59:59',1,3) RETURNING *`)).rows[0];
     await tx.query('INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien) VALUES($1,$2)',[shift.ma_ca,employee.ma_nguoi_dung]);
   }
   await writeFile(credentialFile,JSON.stringify({localOnly:true,manager:{username:'quanly',password},employee:{username:'nhanvien',password:employeePassword}},null,2),{mode:0o600});
 });
}
const app=createApp({db,origins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3000'],gateway:httpGateway(),logErrors:true,
 staticDir:fileURLToPath(new URL('../../frontend/dist/',import.meta.url))});
const server=app.listen(3000,'127.0.0.1',()=>{console.log('Local app: http://127.0.0.1:3000/');console.log('Local credentials are saved in backend/.local/access.json (not a production account).');});
const stop=()=>{server.close(()=>{void db.close().then(()=>process.exit(0));});setTimeout(()=>process.exit(1),10000).unref();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
