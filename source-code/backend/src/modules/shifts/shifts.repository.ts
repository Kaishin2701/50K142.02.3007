import { first,rows,type Database } from '../../shared/database.js';
export const shiftsRepository={
 coWorkers:(db:Database,user:string,from:string,to:string)=>rows(db,`SELECT u.ma_nguoi_dung,u.ho_ten,coalesce(jsonb_agg(jsonb_build_object('ma_ca',c.ma_ca,'ngay_lam',c.ngay_lam,'gio_bat_dau',c.gio_bat_dau,'gio_ket_thuc',c.gio_ket_thuc)) FILTER(WHERE c.ma_ca IS NOT NULL),'[]') AS shifts
 FROM nguoi_dung u LEFT JOIN phan_cong_ca p ON p.ma_nhan_vien=u.ma_nguoi_dung AND p.dang_hieu_luc
 LEFT JOIN ca_lam c ON c.ma_ca=p.ma_ca AND c.ngay_lam BETWEEN $2 AND $3 AND (c.ngay_lam+c.gio_bat_dau) AT TIME ZONE 'Asia/Ho_Chi_Minh'>now()
 WHERE u.vai_tro='Nhân viên' AND u.trang_thai='Đang hoạt động' AND u.ma_nguoi_dung<>$1 GROUP BY u.ma_nguoi_dung ORDER BY u.ho_ten`,[user,from,to]),
 get:(db:Database,id:string)=>first(db,`SELECT *,(ngay_lam+gio_bat_dau) AT TIME ZONE 'Asia/Ho_Chi_Minh'>now() AS chua_bat_dau,
 (ngay_lam+gio_ket_thuc) AT TIME ZONE 'Asia/Ho_Chi_Minh'<=now() AS da_ket_thuc FROM ca_lam WHERE ma_ca=$1`,[id]),
 overlap:(db:Database,v:any,except:string|null=null)=>first(db,`SELECT ma_ca FROM ca_lam WHERE ngay_lam=$1 AND gio_bat_dau<$3::time AND gio_ket_thuc>$2::time AND ($4::uuid IS NULL OR ma_ca<>$4)`,[v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc,except]),
 series:(db:Database,end:string|null,weeks:number|null)=>first(db,'INSERT INTO chuoi_ca_lap(ngay_ket_thuc_lap,so_tuan_lap) VALUES($1,$2) RETURNING *',[end,weeks]),
 create:(db:Database,v:any,series:string|null)=>first(db,`INSERT INTO ca_lam(ngay_lam,gio_bat_dau,gio_ket_thuc,so_nhan_vien_toi_thieu,so_nhan_vien_toi_da,ma_chuoi_lap)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc,v.so_nhan_vien_toi_thieu,v.so_nhan_vien_toi_da,series]),
 update:(db:Database,id:string,v:any)=>first(db,`UPDATE ca_lam SET ngay_lam=$2,gio_bat_dau=$3,gio_ket_thuc=$4,so_nhan_vien_toi_thieu=$5,so_nhan_vien_toi_da=$6 WHERE ma_ca=$1 RETURNING *`,[id,v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc,v.so_nhan_vien_toi_thieu,v.so_nhan_vien_toi_da]),
 assignments:(db:Database,id:string)=>rows(db,`SELECT p.*,u.ho_ten FROM phan_cong_ca p JOIN nguoi_dung u ON u.ma_nguoi_dung=p.ma_nhan_vien WHERE ma_ca=$1 AND dang_hieu_luc`,[id]),
 conflict:(db:Database,user:string,v:any,except:string[]=[])=>first(db,`SELECT c.ma_ca FROM phan_cong_ca p JOIN ca_lam c USING(ma_ca)
 WHERE p.ma_nhan_vien=$1 AND p.dang_hieu_luc AND c.ngay_lam=$2 AND c.gio_bat_dau<$4::time AND c.gio_ket_thuc>$3::time AND NOT(c.ma_ca=ANY($5::uuid[]))`,[user,v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc,except]),
 employee:(db:Database,id:string)=>first(db,`SELECT ma_nguoi_dung FROM nguoi_dung WHERE ma_nguoi_dung=$1 AND vai_tro='Nhân viên' AND trang_thai='Đang hoạt động'`,[id]),
 available:(db:Database,user:string,v:any)=>first(db,`SELECT * FROM dang_ky_lich_lam_viec WHERE ma_nhan_vien=$1 AND ngay=$2 AND gio_bat_dau<=$3::time AND gio_ket_thuc>=$4::time AND thoi_diem_huy_dang_ky IS NULL ORDER BY CASE WHEN loai_dang_ky='Mong muốn' THEN 0 ELSE 1 END LIMIT 1`,[user,v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc]),
 candidates:(db:Database,v:any)=>rows(db,`SELECT DISTINCT ON(u.ma_nguoi_dung) u.ma_nguoi_dung,u.ho_ten,d.loai_dang_ky FROM nguoi_dung u JOIN dang_ky_lich_lam_viec d ON d.ma_nhan_vien=u.ma_nguoi_dung
 WHERE u.vai_tro='Nhân viên' AND u.trang_thai='Đang hoạt động' AND d.ngay=$1 AND d.gio_bat_dau<=$2::time AND d.gio_ket_thuc>=$3::time AND d.thoi_diem_huy_dang_ky IS NULL
 AND NOT EXISTS(SELECT 1 FROM phan_cong_ca p JOIN ca_lam c USING(ma_ca) WHERE p.ma_nhan_vien=u.ma_nguoi_dung AND p.dang_hieu_luc AND c.ma_ca<>$4 AND c.ngay_lam=$1 AND c.gio_bat_dau<$3::time AND c.gio_ket_thuc>$2::time)
 ORDER BY u.ma_nguoi_dung,CASE WHEN d.loai_dang_ky='Mong muốn' THEN 0 ELSE 1 END`,[v.ngay_lam,v.gio_bat_dau,v.gio_ket_thuc,v.ma_ca]),
 clearAssignments:(db:Database,id:string)=>db.query('UPDATE phan_cong_ca SET dang_hieu_luc=FALSE WHERE ma_ca=$1',[id]),
 assign:(db:Database,id:string,user:string,source:string|null)=>first(db,`INSERT INTO phan_cong_ca(ma_ca,ma_nhan_vien,ma_dang_ky_nguon) VALUES($1,$2,$3) RETURNING *`,[id,user,source]),
 calendar:(db:Database,from:string,to:string,user:string|null)=>rows(db,`SELECT c.*,coalesce(jsonb_agg(jsonb_build_object('ma_phan_cong',p.ma_phan_cong,'ma_nhan_vien',p.ma_nhan_vien,'ho_ten',u.ho_ten)) FILTER(WHERE p.ma_phan_cong IS NOT NULL),'[]') AS nhan_vien,
 count(p.ma_phan_cong)<c.so_nhan_vien_toi_thieu AS thieu_nhan_vien FROM ca_lam c LEFT JOIN phan_cong_ca p ON p.ma_ca=c.ma_ca AND p.dang_hieu_luc
 LEFT JOIN nguoi_dung u ON u.ma_nguoi_dung=p.ma_nhan_vien WHERE c.ngay_lam BETWEEN $1 AND $2
 AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM phan_cong_ca p2 WHERE p2.ma_ca=c.ma_ca AND p2.ma_nhan_vien=$3 AND p2.dang_hieu_luc))
 GROUP BY c.ma_ca ORDER BY c.ngay_lam,c.gio_bat_dau`,[from,to,user]),
 availabilityList:(db:Database,from:string,to:string,user:string|null)=>rows(db,`SELECT d.*,u.ho_ten FROM dang_ky_lich_lam_viec d JOIN nguoi_dung u ON u.ma_nguoi_dung=d.ma_nhan_vien WHERE d.ngay BETWEEN $1 AND $2 AND d.thoi_diem_huy_dang_ky IS NULL AND ($3::uuid IS NULL OR d.ma_nhan_vien=$3) ORDER BY d.ngay,d.gio_bat_dau`,[from,to,user]),
 register:(db:Database,user:string,v:any)=>first(db,`INSERT INTO dang_ky_lich_lam_viec(ma_nhan_vien,ngay,gio_bat_dau,gio_ket_thuc,loai_dang_ky) VALUES($1,$2,$3,$4,$5) RETURNING *`,[user,v.ngay,v.gio_bat_dau,v.gio_ket_thuc,v.loai_dang_ky]),
 registration:(db:Database,id:string)=>first(db,`SELECT d.*,EXISTS(SELECT 1 FROM phan_cong_ca p WHERE p.ma_dang_ky_nguon=d.ma_dang_ky AND p.dang_hieu_luc) AS da_phan_cong FROM dang_ky_lich_lam_viec d WHERE ma_dang_ky=$1`,[id]),
 cancelRegistration:(db:Database,id:string)=>db.query('UPDATE dang_ky_lich_lam_viec SET thoi_diem_huy_dang_ky=now() WHERE ma_dang_ky=$1',[id]),
 pending:(db:Database,ids:string[])=>first(db,`SELECT ma_yeu_cau FROM yeu_cau_thay_doi_ca WHERE trang_thai IN ('Chờ đồng nghiệp','Chờ xử lý') AND (ma_ca=ANY($1::uuid[]) OR ma_ca_cua_dong_nghiep=ANY($1::uuid[]))`,[ids]),
 createRequest:(db:Database,assignment:any,v:any)=>first(db,`INSERT INTO yeu_cau_thay_doi_ca(ma_ca,ma_phan_cong_can_thay_doi,ma_nhan_vien_duoc_de_nghi,ma_ca_cua_dong_nghiep,loai_yeu_cau,ly_do) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[assignment.ma_ca,assignment.ma_phan_cong,v.ma_nhan_vien_duoc_de_nghi,v.ma_ca_cua_dong_nghiep??null,v.loai_yeu_cau,v.ly_do]),
 request:(db:Database,id:string)=>first(db,`SELECT y.*,p.ma_nhan_vien AS nguoi_gui,p.dang_hieu_luc FROM yeu_cau_thay_doi_ca y JOIN phan_cong_ca p ON p.ma_phan_cong=y.ma_phan_cong_can_thay_doi WHERE ma_yeu_cau=$1`,[id]),
 requests:(db:Database,user:string|null)=>rows(db,`SELECT y.*,p.ma_nhan_vien AS nguoi_gui,u.ho_ten AS ho_ten_nguoi_gui,v.ho_ten AS ho_ten_nguoi_nhan,
 jsonb_build_object('ma_ca',c.ma_ca,'ngay_lam',c.ngay_lam,'gio_bat_dau',c.gio_bat_dau,'gio_ket_thuc',c.gio_ket_thuc) AS ca_hien_tai,
 CASE WHEN c2.ma_ca IS NULL THEN NULL ELSE jsonb_build_object('ma_ca',c2.ma_ca,'ngay_lam',c2.ngay_lam,'gio_bat_dau',c2.gio_bat_dau,'gio_ket_thuc',c2.gio_ket_thuc) END AS ca_dong_nghiep
 FROM yeu_cau_thay_doi_ca y JOIN phan_cong_ca p ON p.ma_phan_cong=y.ma_phan_cong_can_thay_doi JOIN nguoi_dung u ON u.ma_nguoi_dung=p.ma_nhan_vien
 JOIN nguoi_dung v ON v.ma_nguoi_dung=y.ma_nhan_vien_duoc_de_nghi JOIN ca_lam c ON c.ma_ca=y.ma_ca LEFT JOIN ca_lam c2 ON c2.ma_ca=y.ma_ca_cua_dong_nghiep
 WHERE ($1::uuid IS NULL AND y.trang_thai='Chờ xử lý') OR ($1::uuid IS NOT NULL AND (p.ma_nhan_vien=$1 OR y.ma_nhan_vien_duoc_de_nghi=$1)) ORDER BY thoi_gian_gui DESC`,[user]),
 respond:(db:Database,id:string,accept:boolean)=>first(db,`UPDATE yeu_cau_thay_doi_ca SET trang_thai=$2,thoi_gian_phan_hoi=now() WHERE ma_yeu_cau=$1 RETURNING *`,[id,accept?'Chờ xử lý':'Bị từ chối']),
 decide:(db:Database,id:string,accept:boolean)=>first(db,`UPDATE yeu_cau_thay_doi_ca SET trang_thai=$2,thoi_gian_xu_ly=now() WHERE ma_yeu_cau=$1 RETURNING *`,[id,accept?'Đã chấp thuận':'Bị từ chối']),
 deactivate:(db:Database,id:string)=>db.query('UPDATE phan_cong_ca SET dang_hieu_luc=FALSE WHERE ma_phan_cong=$1',[id]),
};
