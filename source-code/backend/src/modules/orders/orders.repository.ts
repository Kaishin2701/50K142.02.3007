import { first,rows,type Database } from '../../shared/database.js';
export const ordersRepository={
 shift:(db:Database,id:string,user:string)=>first(db,`SELECT c.*,(c.ngay_lam+c.gio_bat_dau) AT TIME ZONE 'Asia/Ho_Chi_Minh'<=now()
 AND (c.ngay_lam+c.gio_ket_thuc) AT TIME ZONE 'Asia/Ho_Chi_Minh'>now() AS dang_dien_ra,
 EXISTS(SELECT 1 FROM phan_cong_ca p WHERE p.ma_ca=c.ma_ca AND p.ma_nhan_vien=$2 AND p.dang_hieu_luc) AS duoc_phan_cong,
 EXISTS(SELECT 1 FROM phieu_kiem_kho k WHERE k.ma_ca=c.ma_ca) AS da_kiem_ke FROM ca_lam c WHERE c.ma_ca=$1`,[id,user]),
 menu:(db:Database,ids:string[])=>rows(db,'SELECT * FROM mon WHERE ma_mon=ANY($1::uuid[]) AND dang_hoat_dong',[ids]),
 requirements:(db:Database,items:any[])=>rows(db,`WITH chosen AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(ma_mon uuid,so_luong int))
 SELECT n.ma_nguyen_lieu,n.ten_nguyen_lieu,n.dang_hoat_dong,sum(d.dinh_luong*c.so_luong) AS can_dung,
 n.ton_ly_thuyet-coalesce((SELECT sum(g.so_luong_giu) FROM giu_ton_don_hang g WHERE g.ma_nguyen_lieu=n.ma_nguyen_lieu AND NOT g.da_tieu_hao),0) AS kha_dung
 FROM chosen c JOIN dinh_muc_nguyen_lieu d USING(ma_mon) JOIN nguyen_lieu n USING(ma_nguyen_lieu)
 GROUP BY n.ma_nguyen_lieu`,[JSON.stringify(items)]),
 recipeCount:(db:Database,ids:string[])=>rows(db,'SELECT DISTINCT ma_mon FROM dinh_muc_nguyen_lieu WHERE ma_mon=ANY($1::uuid[])',[ids]),
 create:(db:Database,user:string,shift:string,total:number)=>first(db,'INSERT INTO don_hang(ma_nhan_vien_lap,ma_ca,tong_tien) VALUES($1,$2,$3) RETURNING *',[user,shift,total]),
 addLine:(db:Database,order:string,item:any,menu:any)=>db.query('INSERT INTO chi_tiet_don_hang VALUES($1,$2,$3,$4,$5)',[order,item.ma_mon,menu.ten_mon,item.so_luong,menu.don_gia_hien_tai]),
 hold:(db:Database,order:string,item:any)=>db.query('INSERT INTO giu_ton_don_hang(ma_don,ma_nguyen_lieu,so_luong_giu) VALUES($1,$2,$3)',[order,item.ma_nguyen_lieu,item.can_dung]),
 get:(db:Database,id:string)=>first(db,`SELECT d.*,u.ho_ten AS nhan_vien_lap,EXISTS(SELECT 1 FROM giao_dich_thanh_toan t WHERE t.ma_don=d.ma_don AND t.trang_thai='Thành công') AS da_thanh_toan FROM don_hang d JOIN nguoi_dung u ON u.ma_nguoi_dung=d.ma_nhan_vien_lap WHERE ma_don=$1`,[id]),
 lines:(db:Database,id:string)=>rows(db,'SELECT *,so_luong*don_gia_luc_lap AS thanh_tien FROM chi_tiet_don_hang WHERE ma_don=$1 ORDER BY ten_mon_luc_lap',[id]),
 payments:(db:Database,id:string)=>rows(db,'SELECT * FROM giao_dich_thanh_toan WHERE ma_don=$1',[id]),
 confirm:(db:Database,id:string)=>first(db,`UPDATE don_hang SET da_xac_nhan=TRUE,ma_don_hien_thi='ME-'||lpad(x.so::text,greatest(6,length(x.so::text)),'0') FROM (SELECT nextval('so_don_hang') AS so) x WHERE ma_don=$1 RETURNING don_hang.*`,[id]),
 remove:(db:Database,id:string)=>db.query('DELETE FROM don_hang WHERE ma_don=$1',[id]),
 phase:(db:Database,id:string,phase:string)=>first(db,'UPDATE don_hang SET trang_thai_pha_che=$2 WHERE ma_don=$1 RETURNING *',[id,phase]),
 list:(db:Database,v:any,history:boolean)=>rows(db,`SELECT d.*,u.ho_ten AS nhan_vien_lap,t.phuong_thuc,count(*) OVER()::int AS total FROM don_hang d
 JOIN nguoi_dung u ON u.ma_nguoi_dung=d.ma_nhan_vien_lap LEFT JOIN giao_dich_thanh_toan t ON t.ma_don=d.ma_don AND t.trang_thai='Thành công'
 WHERE d.da_xac_nhan AND (($1 AND d.trang_thai_pha_che='Hoàn tất pha chế') OR (NOT $1 AND d.trang_thai_pha_che<>'Hoàn tất pha chế'))
 AND ($2::text IS NULL OR d.ma_don_hien_thi ILIKE '%'||$2||'%')
 AND ($3::date IS NULL OR d.thoi_gian_lap >= $3::date AT TIME ZONE 'Asia/Ho_Chi_Minh')
 AND ($4::date IS NULL OR d.thoi_gian_lap < ($4::date+1) AT TIME ZONE 'Asia/Ho_Chi_Minh')
 AND ($5::text IS NULL OR t.phuong_thuc=$5) AND ($6::text IS NULL OR d.trang_thai_pha_che=$6)
 ORDER BY d.thoi_gian_lap DESC LIMIT $7 OFFSET $8`,[history,v.code??null,v.from??null,v.to??null,v.method??null,v.status??null,v.limit,(v.page-1)*v.limit]),
};
