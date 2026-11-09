import { first,rows,type Database } from '../../shared/database.js';
export const inventoryRepository={
 list:(db:Database,active=false)=>rows(db,`SELECT n.*,n.ton_ly_thuyet-coalesce((SELECT sum(g.so_luong_giu) FROM giu_ton_don_hang g WHERE g.ma_nguyen_lieu=n.ma_nguyen_lieu AND NOT g.da_tieu_hao),0) AS ton_kha_dung,
 CASE WHEN n.ton_ly_thuyet<n.muc_ton_toi_thieu THEN 'Sắp hết' ELSE 'Đủ tồn' END AS trang_thai FROM nguyen_lieu n WHERE ($1=FALSE OR n.dang_hoat_dong)
 ORDER BY (n.ton_ly_thuyet<n.muc_ton_toi_thieu) DESC,n.ten_nguyen_lieu`,[active]),
 get:(db:Database,id:string)=>first(db,'SELECT * FROM nguyen_lieu WHERE ma_nguyen_lieu=$1',[id]),
 held:(db:Database,id:string)=>first(db,`SELECT ma_don FROM giu_ton_don_hang WHERE ma_nguyen_lieu=$1 AND NOT da_tieu_hao LIMIT 1`,[id]),
 save:(db:Database,id:string|null,v:any)=>id?first(db,`UPDATE nguyen_lieu SET ten_nguyen_lieu=$2,don_vi_tinh=$3,muc_ton_toi_thieu=$4,nguong_chenh_lech=$5,dang_hoat_dong=$6 WHERE ma_nguyen_lieu=$1 RETURNING *`,[id,v.ten_nguyen_lieu,v.don_vi_tinh,v.muc_ton_toi_thieu,v.nguong_chenh_lech,v.dang_hoat_dong]):first(db,`INSERT INTO nguyen_lieu(ten_nguyen_lieu,don_vi_tinh,muc_ton_toi_thieu,nguong_chenh_lech,dang_hoat_dong) VALUES($1,$2,$3,$4,$5) RETURNING *`,[v.ten_nguyen_lieu,v.don_vi_tinh,v.muc_ton_toi_thieu,v.nguong_chenh_lech,v.dang_hoat_dong]),
 receipt:(db:Database,id:string)=>first(db,`SELECT p.*,u.ho_ten AS nguoi_xac_nhan,(SELECT sum(so_luong_nhan*don_gia) FROM chi_tiet_nhap_hang WHERE ma_po=p.ma_po) AS tong_tien FROM don_nhap_hang p JOIN nguoi_dung u ON u.ma_nguoi_dung=p.ma_nguoi_xac_nhan WHERE ma_po=$1`,[id]),
 receiptLines:(db:Database,id:string)=>rows(db,`SELECT c.*,n.ten_nguyen_lieu,n.don_vi_tinh,c.so_luong_nhan*c.don_gia AS thanh_tien FROM chi_tiet_nhap_hang c JOIN nguyen_lieu n USING(ma_nguyen_lieu) WHERE ma_po=$1`,[id]),
 receipts:(db:Database,limit:number,offset:number)=>rows(db,`SELECT p.*,count(*) OVER()::int AS total,(SELECT sum(so_luong_nhan*don_gia) FROM chi_tiet_nhap_hang c WHERE c.ma_po=p.ma_po) AS tong_tien FROM don_nhap_hang p ORDER BY p.thoi_gian_xac_nhan DESC LIMIT $1 OFFSET $2`,[limit,offset]),
 importHeader:(db:Database,user:string,v:any)=>first(db,`INSERT INTO don_nhap_hang(ten_nha_cung_cap,ngay_nhap,ma_ca,ma_nguoi_xac_nhan,trang_thai_thanh_toan,hinh_thuc_thanh_toan) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[v.ten_nha_cung_cap,v.ngay_nhap,v.ma_ca??null,user,v.trang_thai_thanh_toan,v.hinh_thuc_thanh_toan??null]),
 importLine:async(db:Database,receipt:string,v:any)=>{
   await db.query('INSERT INTO chi_tiet_nhap_hang VALUES($1,$2,$3,$4,$5)',[receipt,v.ma_nguyen_lieu,v.so_luong_dat,v.so_luong_nhan,v.don_gia]);
   await db.query('UPDATE nguyen_lieu SET ton_ly_thuyet=ton_ly_thuyet+$2 WHERE ma_nguyen_lieu=$1',[v.ma_nguyen_lieu,v.so_luong_nhan]);
   await db.query(`INSERT INTO bien_dong_kho(ma_nguyen_lieu,so_luong,loai,ma_tham_chieu) VALUES($1,$2,'Nhập hàng',$3)`,[v.ma_nguyen_lieu,v.so_luong_nhan,receipt]);
 },
 pendingCount:(db:Database)=>first(db,`SELECT k.ma_ca FROM phieu_kiem_kho k LEFT JOIN bao_cao_cuoi_ca b USING(ma_phieu) WHERE b.trang_thai IS DISTINCT FROM 'Đã xác nhận' LIMIT 1`),
 countForShift:(db:Database,id:string)=>first(db,'SELECT * FROM phieu_kiem_kho WHERE ma_ca=$1',[id]),
 unfinished:(db:Database,id:string)=>first(db,`SELECT ma_don FROM don_hang WHERE ma_ca=$1 AND trang_thai_pha_che<>'Hoàn tất pha chế' LIMIT 1`,[id]),
 shiftRevenue:(db:Database,id:string)=>first(db,`SELECT coalesce(sum(t.so_tien_thanh_toan),0) AS doanh_thu FROM giao_dich_thanh_toan t JOIN don_hang d USING(ma_don) WHERE d.ma_ca=$1 AND t.trang_thai='Thành công'`,[id]),
 insertCount:(db:Database,user:string,v:any,revenue:unknown)=>first(db,`INSERT INTO phieu_kiem_kho(ma_ca,ma_nguoi_kiem_ke,ngay_kiem_ke,doanh_thu_ca_luc_doi_chieu,tien_mat_thuc_thu,chuyen_khoan_thuc_thu,ly_do_chenh_lech_tien)
 VALUES($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,$3,$4,$5,$6) RETURNING *`,[v.ma_ca,user,revenue,v.tien_mat_thuc_thu,v.chuyen_khoan_thuc_thu,v.ly_do_chenh_lech_tien??null]),
 insertCountLine:(db:Database,id:string,material:any,line:any)=>db.query(`INSERT INTO chi_tiet_phieu_kiem_kho VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,line.ma_nguyen_lieu,material.ton_ly_thuyet,line.ton_thuc_te,material.nguong_chenh_lech,line.ly_do_chenh_lech??null,line.ghi_chu??null]),
 countLines:(db:Database,id:string)=>rows(db,`SELECT c.*,n.ten_nguyen_lieu,n.don_vi_tinh,n.muc_ton_toi_thieu,c.ton_thuc_te-c.ton_ly_thuyet_luc_kiem_ke AS chenh_lech FROM chi_tiet_phieu_kiem_kho c JOIN nguyen_lieu n USING(ma_nguyen_lieu) WHERE ma_phieu=$1 ORDER BY n.ten_nguyen_lieu`,[id]),
 count:(db:Database,id:string)=>first(db,'SELECT * FROM phieu_kiem_kho WHERE ma_phieu=$1',[id]),
 report:(db:Database,id:string)=>first(db,`SELECT b.*,k.ma_nguoi_kiem_ke,k.ngay_kiem_ke,k.doanh_thu_ca_luc_doi_chieu,
 k.tien_mat_thuc_thu,k.chuyen_khoan_thuc_thu,k.ly_do_chenh_lech_tien,u.ho_ten AS ho_ten_nguoi_lap,c.ngay_lam,c.gio_bat_dau,c.gio_ket_thuc,x.ho_ten AS ho_ten_nguoi_xac_nhan
 FROM bao_cao_cuoi_ca b JOIN phieu_kiem_kho k USING(ma_phieu)
 JOIN nguoi_dung u ON u.ma_nguoi_dung=k.ma_nguoi_kiem_ke JOIN ca_lam c ON c.ma_ca=b.ma_ca
 LEFT JOIN nguoi_dung x ON x.ma_nguoi_dung=b.ma_nguoi_xac_nhan WHERE ma_bao_cao=$1`,[id]),
 reportForCount:(db:Database,id:string)=>first(db,'SELECT * FROM bao_cao_cuoi_ca WHERE ma_phieu=$1',[id]),
 createReport:(db:Database,count:any)=>first(db,'INSERT INTO bao_cao_cuoi_ca(ma_phieu,ma_ca) VALUES($1,$2) RETURNING *',[count.ma_phieu,count.ma_ca]),
 reports:(db:Database,user:string|null)=>rows(db,`SELECT b.*,k.ngay_kiem_ke,k.doanh_thu_ca_luc_doi_chieu,k.ma_nguoi_kiem_ke,u.ho_ten AS ho_ten_nguoi_lap
 FROM bao_cao_cuoi_ca b JOIN phieu_kiem_kho k USING(ma_phieu) JOIN nguoi_dung u ON u.ma_nguoi_dung=k.ma_nguoi_kiem_ke
 WHERE ($1::uuid IS NULL OR k.ma_nguoi_kiem_ke=$1) ORDER BY k.thoi_gian_kiem_ke DESC`,[user]),
 sendReport:(db:Database,id:string)=>first(db,`UPDATE bao_cao_cuoi_ca SET trang_thai='Chờ xác nhận',thoi_gian_gui=now() WHERE ma_bao_cao=$1 RETURNING *`,[id]),
 confirmReport:(db:Database,id:string,user:string)=>first(db,`UPDATE bao_cao_cuoi_ca SET trang_thai='Đã xác nhận',ma_nguoi_xac_nhan=$2,thoi_gian_xac_nhan=now() WHERE ma_bao_cao=$1 RETURNING *`,[id,user]),
 applyCount:async(db:Database,line:any,report:string)=>{
   const updated=await first(db,`UPDATE nguyen_lieu n SET ton_ly_thuyet=n.ton_ly_thuyet+($2::numeric-$3::numeric),ton_thuc_te_gan_nhat=$2
 WHERE ma_nguyen_lieu=$1 AND n.ton_ly_thuyet+($2::numeric-$3::numeric)>=coalesce((SELECT sum(g.so_luong_giu) FROM giu_ton_don_hang g WHERE g.ma_nguyen_lieu=n.ma_nguyen_lieu AND NOT g.da_tieu_hao),0) RETURNING n.*`,[line.ma_nguyen_lieu,line.ton_thuc_te,line.ton_ly_thuyet_luc_kiem_ke]);
   if(updated)await db.query(`INSERT INTO bien_dong_kho(ma_nguyen_lieu,so_luong,loai,ma_tham_chieu) VALUES($1,$2::numeric-$3::numeric,'Kiểm kê',$4)`,[line.ma_nguyen_lieu,line.ton_thuc_te,line.ton_ly_thuyet_luc_kiem_ke,report]);return updated;
 },
 lossHistory:(db:Database,limit:number,offset:number)=>rows(db,`SELECT c.*,n.ten_nguyen_lieu,n.don_vi_tinh,k.ngay_kiem_ke,k.ma_ca,u.ho_ten AS nguoi_ghi_nhan,c.ton_thuc_te-c.ton_ly_thuyet_luc_kiem_ke AS chenh_lech,count(*) OVER()::int AS total
 FROM chi_tiet_phieu_kiem_kho c JOIN phieu_kiem_kho k USING(ma_phieu) JOIN bao_cao_cuoi_ca b USING(ma_phieu) JOIN nguyen_lieu n USING(ma_nguyen_lieu) JOIN nguoi_dung u ON u.ma_nguoi_dung=k.ma_nguoi_kiem_ke
 WHERE b.trang_thai='Đã xác nhận' AND c.ly_do_chenh_lech IS NOT NULL ORDER BY k.thoi_gian_kiem_ke DESC LIMIT $1 OFFSET $2`,[limit,offset]),
};
