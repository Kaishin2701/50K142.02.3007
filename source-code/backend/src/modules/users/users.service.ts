import { z } from 'zod';
import { lock, type Database } from '../../shared/database.js';
import { check } from '../../shared/errors.js';
import { text, role } from '../../shared/validation.js';
import { hashPassword } from '../auth/auth.service.js';
import { usersRepository as repo } from './users.repository.js';
import { notifyManagers } from '../../shared/notifications.js';
export const userInput=z.object({ten_dang_nhap:z.string().regex(/^[a-zA-Z0-9_.-]{3,50}$/),ho_ten:text(100),
 so_dien_thoai:z.string().regex(/^\+?[0-9]{9,15}$/),vai_tro:role}).strict();
export const createUserInput=userInput.extend({mat_khau:z.string().min(8).max(128),xac_nhan_mat_khau:z.string()})
 .refine(v=>v.mat_khau===v.xac_nhan_mat_khau,{message:'Mật khẩu xác nhận không khớp.',path:['xac_nhan_mat_khau']});
export function usersService(db:Database) {
 const protectLastManager=async(tx:Database,user:any,role:string,status:string)=>{
   if(user.vai_tro==='Quản lý' && user.trang_thai==='Đang hoạt động' && (role!=='Quản lý'||status!=='Đang hoạt động'))
     check((await repo.managers(tx)).length>1,'Không thể vô hiệu hóa quản lý cuối cùng.','LAST_MANAGER');
 };
 const forwardCounts=async(tx:Database,id:string)=>{
   for(const report of await repo.forwardPendingCounts(tx,id))
     await notifyManagers(tx,'BAO_CAO_CUOI_CA','Phiếu kiểm kê đã lưu được chuyển chờ quản lý xác nhận vì người lập bị khóa hoặc đổi vai trò.',{ma_bao_cao:report.ma_bao_cao});
 };
 return {
  list:(search:string,limit:number,offset:number)=>repo.list(db,search,limit,offset),
  get:async(id:string)=>{const user=await repo.get(db,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);return user;},
  create:async(v:z.infer<typeof createUserInput>)=>repo.create(db,{...v,mat_khau_bam:await hashPassword(v.mat_khau)}),
  update:(id:string,v:z.infer<typeof userInput>)=>db.transaction(async tx=>{
    await lock(tx,'kho');await lock(tx,'tai_khoan');const user=await repo.get(tx,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);
    await protectLastManager(tx,user,v.vai_tro,user.trang_thai);const result=await repo.update(tx,id,v);
    if(user.vai_tro!==v.vai_tro)await repo.revokeAll(tx,id);
    if(v.vai_tro!=='Nhân viên'||user.trang_thai==='Đã khóa')await forwardCounts(tx,id);return result;
  }),
  status:(id:string,status:string)=>db.transaction(async tx=>{
    await lock(tx,'kho');await lock(tx,'tai_khoan');const user=await repo.get(tx,id);check(user,'Không tìm thấy tài khoản.','NOT_FOUND',404);
    check(user.trang_thai!==status,'Tài khoản đã có trạng thái này.');await protectLastManager(tx,user,user.vai_tro,status);
    const result=await repo.status(tx,id,status);
    if(status==='Đã khóa'){await repo.revokeAll(tx,id);await forwardCounts(tx,id);}return result;
  }),
 };
}
