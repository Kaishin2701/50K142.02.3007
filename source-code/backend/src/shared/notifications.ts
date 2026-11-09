import { rows, type Database } from './database.js';
export async function notify(db:Database,user:string,type:string,message:string,data:unknown={}) {
 await db.query('INSERT INTO thong_bao(ma_nguoi_dung,loai,noi_dung,du_lieu) VALUES($1,$2,$3,$4)',[user,type,message,JSON.stringify(data)]);
}
export async function notifyManagers(db:Database,type:string,message:string,data:unknown={}) {
 const users=await rows(db,`SELECT ma_nguoi_dung FROM nguoi_dung WHERE vai_tro='Quản lý' AND trang_thai='Đang hoạt động'`);
 for(const user of users)await notify(db,user.ma_nguoi_dung,type,message,data);
}
export async function notifyShift(db:Database,shift:string,type:string,message:string,data:unknown={}) {
 const users=await rows(db,'SELECT ma_nhan_vien FROM phan_cong_ca WHERE ma_ca=$1 AND dang_hieu_luc',[shift]);
 for(const user of users)await notify(db,user.ma_nhan_vien,type,message,data);
}
export const notificationList=async(db:Database,user:string,limit:number,offset:number)=>(await db.query('SELECT * FROM thong_bao WHERE ma_nguoi_dung=$1 ORDER BY tao_luc DESC LIMIT $2 OFFSET $3',[user,limit,offset])).rows;
export const notificationRead=async(db:Database,user:string,id:string)=>(await db.query('UPDATE thong_bao SET doc_luc=coalesce(doc_luc,now()) WHERE ma_thong_bao=$1 AND ma_nguoi_dung=$2 RETURNING *',[id,user])).rows[0];
