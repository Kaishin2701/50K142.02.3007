import { rows,type Database } from '../../shared/database.js';
export const reportsRepository={
 revenue:(db:Database,v:any)=>rows(db,`WITH bounds AS(SELECT date_trunc($1,$2::date::timestamp) AS start_at), cups AS(SELECT ma_don,sum(so_luong) AS so_ly FROM chi_tiet_don_hang GROUP BY ma_don)
 SELECT to_char(t.thoi_gian_xac_nhan AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS ngay,t.phuong_thuc,
 sum(t.so_tien_thanh_toan) AS doanh_thu,sum(c.so_ly) AS so_ly,
 sum(CASE WHEN b.trang_thai='Đã xác nhận' THEN t.so_tien_thanh_toan ELSE 0 END) AS doanh_thu_da_chot
 FROM giao_dich_thanh_toan t JOIN don_hang d USING(ma_don) JOIN cups c USING(ma_don)
 LEFT JOIN bao_cao_cuoi_ca b ON b.ma_ca=d.ma_ca CROSS JOIN bounds x
 WHERE t.trang_thai='Thành công' AND t.thoi_gian_xac_nhan>=x.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
 AND t.thoi_gian_xac_nhan<(x.start_at+CASE $1 WHEN 'day' THEN interval '1 day' WHEN 'month' THEN interval '1 month' ELSE interval '1 year' END) AT TIME ZONE 'Asia/Ho_Chi_Minh'
 AND ($3::text IS NULL OR t.phuong_thuc=$3)
 GROUP BY ngay,t.phuong_thuc ORDER BY ngay,t.phuong_thuc`,[v.period,v.date,v.method??null]),
};
