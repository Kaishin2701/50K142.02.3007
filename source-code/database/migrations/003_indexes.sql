CREATE INDEX idx_giu_ton_kha_dung ON giu_ton_don_hang(ma_nguyen_lieu) WHERE NOT da_tieu_hao;
CREATE INDEX idx_thanh_toan_bao_cao ON giao_dich_thanh_toan(thoi_gian_xac_nhan,phuong_thuc,ma_don) WHERE trang_thai='Thành công';
CREATE INDEX idx_phan_cong_nhan_vien ON phan_cong_ca(ma_nhan_vien,ma_ca) WHERE dang_hieu_luc;
CREATE INDEX idx_yeu_cau_nguoi_nhan ON yeu_cau_thay_doi_ca(ma_nhan_vien_duoc_de_nghi,trang_thai);
CREATE INDEX idx_kiem_kho_thoi_gian ON phieu_kiem_kho(thoi_gian_kiem_ke DESC);
CREATE INDEX idx_bao_cao_trang_thai ON bao_cao_cuoi_ca(trang_thai,ma_ca);
