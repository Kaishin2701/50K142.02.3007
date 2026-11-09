import { first, rows, type Database } from '../../shared/database.js';
import { publicColumns } from '../auth/auth.repository.js';
export const usersRepository = {
 list: (db:Database,search:string,limit:number,offset:number) => rows(db,`SELECT ${publicColumns},count(*) OVER()::int AS total
   FROM nguoi_dung WHERE ten_dang_nhap ILIKE $1 OR ho_ten ILIKE $1 OR so_dien_thoai ILIKE $1 ORDER BY tao_luc,ma_nguoi_dung LIMIT $2 OFFSET $3`, [`%${search}%`,limit,offset]),
 get: (db:Database,id:string) => first(db,`SELECT ${publicColumns} FROM nguoi_dung WHERE ma_nguoi_dung=$1`,[id]),
 managers: (db:Database) => rows(db,`SELECT ma_nguoi_dung FROM nguoi_dung WHERE vai_tro='Quản lý' AND trang_thai='Đang hoạt động'`),
 create: (db:Database,v:any) => first(db,`INSERT INTO nguoi_dung(ten_dang_nhap,mat_khau_bam,ho_ten,so_dien_thoai,vai_tro)
   VALUES($1,$2,$3,$4,$5) RETURNING ${publicColumns}`, [v.ten_dang_nhap,v.mat_khau_bam,v.ho_ten,v.so_dien_thoai,v.vai_tro]),
 update: (db:Database,id:string,v:any) => first(db,`UPDATE nguoi_dung SET ten_dang_nhap=$2,ho_ten=$3,so_dien_thoai=$4,vai_tro=$5 WHERE ma_nguoi_dung=$1 RETURNING ${publicColumns}`,
   [id,v.ten_dang_nhap,v.ho_ten,v.so_dien_thoai,v.vai_tro]),
 status: (db:Database,id:string,status:string) => first(db,`UPDATE nguoi_dung SET trang_thai=$2 WHERE ma_nguoi_dung=$1 RETURNING ${publicColumns}`,[id,status]),
 revokeAll: (db:Database,id:string) => db.query('UPDATE phien_dang_nhap SET thu_hoi_luc=now() WHERE ma_nguoi_dung=$1 AND thu_hoi_luc IS NULL',[id]),
};
