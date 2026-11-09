import { loadEnv } from '../src/config/env.js';
import { connectDatabase,lock } from '../src/shared/database.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { createUserInput } from '../src/modules/users/users.service.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
const env=loadEnv();
const input=createUserInput.parse({ten_dang_nhap:process.env.ADMIN_USERNAME,mat_khau:process.env.ADMIN_PASSWORD,
 xac_nhan_mat_khau:process.env.ADMIN_PASSWORD,ho_ten:process.env.ADMIN_FULL_NAME,so_dien_thoai:process.env.ADMIN_PHONE,vai_tro:'Quản lý'});
const db=connectDatabase(env.DATABASE_URL,env.PG_SSL==='true');
try{await db.transaction(async tx=>{await lock(tx,'tai_khoan');
 if((await usersRepository.managers(tx)).length)throw new Error('Đã có tài khoản quản lý. Bootstrap không thay đổi tài khoản hiện có.');
 await usersRepository.create(tx,{...input,mat_khau_bam:await hashPassword(input.mat_khau)});
});console.log('Đã tạo tài khoản quản lý ban đầu.');}finally{await db.close();}
