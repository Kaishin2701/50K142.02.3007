import { rows, first, type Database } from '../../shared/database.js';
export const menuRepository={
 list:(db:Database,all=false)=>rows(db,`SELECT * FROM mon WHERE ($1 OR dang_hoat_dong) ORDER BY danh_muc,ten_mon`,[all]),
 get:(db:Database,id:string)=>first(db,'SELECT * FROM mon WHERE ma_mon=$1',[id]),
 recipe:(db:Database,id:string)=>rows(db,`SELECT d.*,n.ten_nguyen_lieu,n.don_vi_tinh FROM dinh_muc_nguyen_lieu d JOIN nguyen_lieu n USING(ma_nguyen_lieu) WHERE ma_mon=$1`,[id]),
 save:(db:Database,id:string|null,v:any)=>id?first(db,`UPDATE mon SET ten_mon=$2,danh_muc=$3,don_gia_hien_tai=$4,dang_hoat_dong=$5 WHERE ma_mon=$1 RETURNING *`,
 [id,v.ten_mon,v.danh_muc,v.don_gia_hien_tai,v.dang_hoat_dong]):first(db,`INSERT INTO mon(ten_mon,danh_muc,don_gia_hien_tai,dang_hoat_dong) VALUES($1,$2,$3,$4) RETURNING *`,[v.ten_mon,v.danh_muc,v.don_gia_hien_tai,v.dang_hoat_dong]),
 replaceRecipe:async(db:Database,id:string,items:any[])=>{await db.query('DELETE FROM dinh_muc_nguyen_lieu WHERE ma_mon=$1',[id]);
 for(const item of items)await db.query('INSERT INTO dinh_muc_nguyen_lieu VALUES($1,$2,$3)',[id,item.ma_nguyen_lieu,item.dinh_luong]);},
};
