import { z } from 'zod';
import { lock, type Database } from '../../shared/database.js';
import { AppError, check } from '../../shared/errors.js';
import { text, role } from '../../shared/validation.js';
import { hashPassword } from '../auth/auth.service.js';
import { usersRepository as repo } from './users.repository.js';
export const userInput=z.object({ten_dang_nhap:z.string().regex(/^[a-zA-Z0-9_.-]{3,50}$/),ho_ten:text(100),
 so_dien_thoai:z.string().regex(/^\+?[0-9]{9,15}$/),vai_tro:role}).strict();
export const createUserInput=userInput.extend({mat_khau:z.string().min(8).max(128),xac_nhan_mat_khau:z.string()})
 .refine(v=>v.mat_khau===v.xac_nhan_mat_khau,{message:'Mật khẩu xác nhận không khớp.',path:['xac_nhan_mat_khau']});
export const updateUserInput=userInput.extend({trang_thai:z.enum(['Đang hoạt động','Đã khóa']).optional()});
export function usersService(db:Database) {
 const accountWrite=async<T>(work:()=>Promise<T>):Promise<T>=>{
   try{return await work();}catch(error){
     const conflict=error as {code?:string;constraint?:string};
     if(conflict.code==='23505'){
       if(conflict.constraint==='uq_ten_dang_nhap')throw new AppError(409,'DUPLICATE_USERNAME','Tên đăng nhập đã tồn tại. Vui lòng kiểm tra lại');
       if(conflict.constraint==='nguoi_dung_so_dien_thoai_key')throw new AppError(409,'DUPLICATE_PHONE','Số điện thoại đã tồn tại. Vui lòng kiểm tra lại');
     }
     throw error;
   }
 };
 const protectLastManager=async(tx:Database,user:any,role:string,status:string)=>{
   if(user.vai_tro==='Quản lý' && user.trang_thai==='Đang hoạt động' && (role!=='Quản lý'||status!=='Đang hoạt động'))
     check((await repo.managers(tx)).length>1,'Không thể vô hiệu hóa quản lý cuối cùng.','LAST_MANAGER');
 };
 return {
  list:(search:string,limit:number,offset:number)=>repo.list(db,search,limit,offset),
  get:async(id:string)=>{const user=await repo.get(db,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);return user;},
  create:async(v:z.infer<typeof createUserInput>)=>{const mat_khau_bam=await hashPassword(v.mat_khau);return accountWrite(()=>repo.create(db,{...v,mat_khau_bam}));},
  update:(id:string,v:z.infer<typeof updateUserInput>)=>accountWrite(()=>db.transaction(async tx=>{
    await lock(tx,'tai_khoan');const user=await repo.get(tx,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);
    const status=v.trang_thai??user.trang_thai;
    await protectLastManager(tx,user,v.vai_tro,status);let result=await repo.update(tx,id,v);
    if(status!==user.trang_thai)result=await repo.status(tx,id,status);
    if(user.vai_tro!==v.vai_tro||status==='Đã khóa')await repo.revokeAll(tx,id);return result;
  })),
  status:(id:string,status:string)=>db.transaction(async tx=>{
    await lock(tx,'tai_khoan');const user=await repo.get(tx,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);
    check(user.trang_thai!==status,'Tài khoản đã có trạng thái này.');await protectLastManager(tx,user,user.vai_tro,status);
    const result=await repo.status(tx,id,status);if(status==='Đã khóa')await repo.revokeAll(tx,id);return result;
  }),
 };
}
