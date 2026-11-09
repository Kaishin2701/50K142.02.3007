import { first,rows,type Database } from '../../shared/database.js';
export const paymentsRepository={
 byReference:(db:Database,reference:string)=>first(db,`SELECT t.*,d.ma_don_hien_thi,d.ma_ca FROM giao_dich_thanh_toan t JOIN don_hang d USING(ma_don) WHERE upper(t.ma_tham_chieu_qr)=upper($1)`,[reference]),
 get:(db:Database,id:string)=>first(db,'SELECT * FROM giao_dich_thanh_toan WHERE ma_giao_dich=$1',[id]),
 successful:(db:Database,order:string)=>first(db,`SELECT * FROM giao_dich_thanh_toan WHERE ma_don=$1 AND trang_thai='Thành công'`,[order]),
 create:(db:Database,id:string,order:string,method:string,total:unknown,reference:string|null)=>first(db,`INSERT INTO giao_dich_thanh_toan(ma_giao_dich,ma_don,phuong_thuc,so_tien_thanh_toan,ma_tham_chieu_qr,trang_thai)
 VALUES($1,$2,$3,$4,$5,'Chờ xác nhận') RETURNING *`,[id,order,method,total,reference]),
 succeed:(db:Database,id:string,received:unknown)=>first(db,`UPDATE giao_dich_thanh_toan SET trang_thai='Thành công',so_tien_nhan=$2,thoi_gian_xac_nhan=now() WHERE ma_giao_dich=$1 RETURNING *`,[id,received]),
 holds:(db:Database,order:string)=>rows(db,'SELECT * FROM giu_ton_don_hang WHERE ma_don=$1 AND NOT da_tieu_hao',[order]),
 consume:async(db:Database,order:string)=>{
   await db.query(`INSERT INTO bien_dong_kho(ma_nguyen_lieu,so_luong,loai,ma_tham_chieu) SELECT ma_nguyen_lieu,-so_luong_giu,'Bán hàng',ma_don FROM giu_ton_don_hang WHERE ma_don=$1 AND NOT da_tieu_hao`,[order]);
   await db.query(`UPDATE nguyen_lieu n SET ton_ly_thuyet=n.ton_ly_thuyet-g.so_luong_giu FROM giu_ton_don_hang g WHERE g.ma_don=$1 AND g.ma_nguyen_lieu=n.ma_nguyen_lieu AND NOT g.da_tieu_hao`,[order]);
   await db.query('UPDATE giu_ton_don_hang SET da_tieu_hao=TRUE WHERE ma_don=$1',[order]);
 },
 event:(db:Database,id:string)=>first(db,'SELECT * FROM su_kien_thanh_toan WHERE ma_su_kien=$1',[id]),
 storeEvent:(db:Database,v:any,hash:string)=>db.query('INSERT INTO su_kien_thanh_toan(ma_su_kien,ma_giao_dich,noi_dung,noi_dung_bam) VALUES($1,$2,$3,$4)',[v.eventId,v.paymentId,JSON.stringify(v),hash]),
 events:(db:Database,payment:string)=>rows(db,'SELECT noi_dung FROM su_kien_thanh_toan WHERE ma_giao_dich=$1 ORDER BY nhan_luc DESC',[payment]),
};
