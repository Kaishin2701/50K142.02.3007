CREATE TABLE khoa_nghiep_vu (ten TEXT PRIMARY KEY);
INSERT INTO khoa_nghiep_vu VALUES ('kho'), ('ca_lam'), ('tai_khoan');
CREATE TABLE nguoi_dung (
 ma_nguoi_dung UUID PRIMARY KEY DEFAULT gen_random_uuid(), ten_dang_nhap VARCHAR(50) NOT NULL,
 mat_khau_bam TEXT NOT NULL, ho_ten VARCHAR(100) NOT NULL, so_dien_thoai VARCHAR(20) NOT NULL UNIQUE,
 vai_tro TEXT NOT NULL CHECK(vai_tro IN ('Quản lý','Nhân viên')),
 trang_thai TEXT NOT NULL DEFAULT 'Đang hoạt động' CHECK(trang_thai IN ('Đang hoạt động','Đã khóa')),
 tao_luc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ten_dang_nhap ON nguoi_dung(lower(ten_dang_nhap));
CREATE TABLE phien_dang_nhap (
 ma_phien UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_nguoi_dung UUID NOT NULL REFERENCES nguoi_dung,
 token_bam TEXT NOT NULL UNIQUE, het_han_luc TIMESTAMPTZ NOT NULL, thu_hoi_luc TIMESTAMPTZ,
 tao_luc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_phien_nguoi_dung ON phien_dang_nhap(ma_nguoi_dung);
CREATE TABLE mon (
 ma_mon UUID PRIMARY KEY DEFAULT gen_random_uuid(), ten_mon VARCHAR(100) NOT NULL,
 danh_muc VARCHAR(100) NOT NULL, don_gia_hien_tai NUMERIC(14,0) NOT NULL CHECK(don_gia_hien_tai>=0),
 dang_hoat_dong BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE nguyen_lieu (
 ma_nguyen_lieu UUID PRIMARY KEY DEFAULT gen_random_uuid(), ten_nguyen_lieu VARCHAR(100) NOT NULL,
 don_vi_tinh VARCHAR(20) NOT NULL, muc_ton_toi_thieu NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(muc_ton_toi_thieu>=0),
 nguong_chenh_lech NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(nguong_chenh_lech>=0),
 dang_hoat_dong BOOLEAN NOT NULL DEFAULT TRUE,
 ton_ly_thuyet NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(ton_ly_thuyet>=0),
 ton_thuc_te_gan_nhat NUMERIC(14,3), CHECK(ton_thuc_te_gan_nhat>=0)
);
CREATE TABLE dinh_muc_nguyen_lieu (
 ma_mon UUID NOT NULL REFERENCES mon, ma_nguyen_lieu UUID NOT NULL REFERENCES nguyen_lieu,
 dinh_luong NUMERIC(14,3) NOT NULL CHECK(dinh_luong>0), PRIMARY KEY(ma_mon,ma_nguyen_lieu)
);
CREATE TABLE chuoi_ca_lap (
 ma_chuoi_lap UUID PRIMARY KEY DEFAULT gen_random_uuid(), ngay_ket_thuc_lap DATE, so_tuan_lap INTEGER,
 CHECK((ngay_ket_thuc_lap IS NULL)<>(so_tuan_lap IS NULL)), CHECK(so_tuan_lap>0)
);
CREATE TABLE ca_lam (
 ma_ca UUID PRIMARY KEY DEFAULT gen_random_uuid(), ngay_lam DATE NOT NULL,
 gio_bat_dau TIME NOT NULL, gio_ket_thuc TIME NOT NULL, CHECK(gio_ket_thuc>gio_bat_dau),
 so_nhan_vien_toi_thieu INTEGER NOT NULL CHECK(so_nhan_vien_toi_thieu>=1),
 so_nhan_vien_toi_da INTEGER NOT NULL CHECK(so_nhan_vien_toi_da>=so_nhan_vien_toi_thieu),
 ma_chuoi_lap UUID REFERENCES chuoi_ca_lap,
 UNIQUE(ngay_lam,gio_bat_dau,gio_ket_thuc)
);
CREATE INDEX idx_ca_ngay ON ca_lam(ngay_lam);
CREATE TABLE dang_ky_lich_lam_viec (
 ma_dang_ky UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_nhan_vien UUID NOT NULL REFERENCES nguoi_dung,
 ngay DATE NOT NULL, gio_bat_dau TIME NOT NULL, gio_ket_thuc TIME NOT NULL,
 loai_dang_ky TEXT NOT NULL CHECK(loai_dang_ky IN ('Rảnh','Mong muốn')),
 thoi_diem_huy_dang_ky TIMESTAMPTZ, CHECK(gio_ket_thuc>gio_bat_dau)
);
CREATE INDEX idx_dang_ky_nhan_vien_ngay ON dang_ky_lich_lam_viec(ma_nhan_vien,ngay);
CREATE TABLE phan_cong_ca (
 ma_phan_cong UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_ca UUID NOT NULL REFERENCES ca_lam,
 ma_nhan_vien UUID NOT NULL REFERENCES nguoi_dung, ma_dang_ky_nguon UUID REFERENCES dang_ky_lich_lam_viec,
 dang_hieu_luc BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX uq_phan_cong ON phan_cong_ca(ma_ca,ma_nhan_vien) WHERE dang_hieu_luc;
CREATE TABLE yeu_cau_thay_doi_ca (
 ma_yeu_cau UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_ca UUID NOT NULL REFERENCES ca_lam,
 ma_phan_cong_can_thay_doi UUID NOT NULL REFERENCES phan_cong_ca,
 ma_nhan_vien_duoc_de_nghi UUID NOT NULL REFERENCES nguoi_dung, ma_ca_cua_dong_nghiep UUID REFERENCES ca_lam,
 loai_yeu_cau TEXT NOT NULL, ly_do VARCHAR(500) NOT NULL CHECK(btrim(ly_do)<>''),
 trang_thai TEXT NOT NULL DEFAULT 'Chờ đồng nghiệp' CHECK(trang_thai IN ('Chờ đồng nghiệp','Chờ xử lý','Đã chấp thuận','Bị từ chối')),
 thoi_gian_gui TIMESTAMPTZ NOT NULL DEFAULT now(), thoi_gian_phan_hoi TIMESTAMPTZ, thoi_gian_xu_ly TIMESTAMPTZ,
 CHECK((loai_yeu_cau='Đổi ca hai chiều' AND ma_ca_cua_dong_nghiep IS NOT NULL AND ma_ca<>ma_ca_cua_dong_nghiep) OR
 (loai_yeu_cau='Nhờ nhân viên khác làm thay' AND ma_ca_cua_dong_nghiep IS NULL))
);
CREATE UNIQUE INDEX uq_yeu_cau_dang_cho ON yeu_cau_thay_doi_ca(ma_ca) WHERE trang_thai IN ('Chờ đồng nghiệp','Chờ xử lý');
CREATE SEQUENCE so_don_hang;
CREATE TABLE don_hang (
 ma_don UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_don_hien_thi VARCHAR(30) UNIQUE,
 ma_nhan_vien_lap UUID NOT NULL REFERENCES nguoi_dung, ma_ca UUID NOT NULL REFERENCES ca_lam,
 thoi_gian_lap TIMESTAMPTZ NOT NULL DEFAULT now(), tong_tien NUMERIC(14,0) NOT NULL CHECK(tong_tien>=0),
 trang_thai_pha_che TEXT NOT NULL DEFAULT 'Chưa pha chế' CHECK(trang_thai_pha_che IN ('Chưa pha chế','Bắt đầu pha chế','Hoàn tất pha chế')),
 da_xac_nhan BOOLEAN NOT NULL DEFAULT FALSE, CHECK(da_xac_nhan=(ma_don_hien_thi IS NOT NULL))
);
CREATE INDEX idx_don_ca_thoi_gian ON don_hang(ma_ca,thoi_gian_lap DESC);
CREATE TABLE chi_tiet_don_hang (
 ma_don UUID NOT NULL REFERENCES don_hang ON DELETE CASCADE, ma_mon UUID NOT NULL REFERENCES mon,
 ten_mon_luc_lap VARCHAR(100) NOT NULL, so_luong INTEGER NOT NULL CHECK(so_luong>0),
 don_gia_luc_lap NUMERIC(14,0) NOT NULL CHECK(don_gia_luc_lap>=0), PRIMARY KEY(ma_don,ma_mon)
);
CREATE TABLE giu_ton_don_hang (
 ma_don UUID NOT NULL REFERENCES don_hang ON DELETE CASCADE, ma_nguyen_lieu UUID NOT NULL REFERENCES nguyen_lieu,
 so_luong_giu NUMERIC(14,3) NOT NULL CHECK(so_luong_giu>0), da_tieu_hao BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(ma_don,ma_nguyen_lieu)
);
CREATE TABLE giao_dich_thanh_toan (
 ma_giao_dich UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_don UUID NOT NULL REFERENCES don_hang ON DELETE CASCADE,
 phuong_thuc TEXT NOT NULL CHECK(phuong_thuc IN ('Tiền mặt','Chuyển khoản qua QR')),
 so_tien_thanh_toan NUMERIC(14,0) NOT NULL CHECK(so_tien_thanh_toan>=0),
 so_tien_nhan NUMERIC(14,0) CHECK(so_tien_nhan>=0), ma_tham_chieu_qr TEXT UNIQUE,
 trang_thai TEXT NOT NULL CHECK(trang_thai IN ('Chờ xác nhận','Thành công','Không thành công')),
 thoi_gian_xac_nhan TIMESTAMPTZ,
 CHECK(trang_thai<>'Thành công' OR thoi_gian_xac_nhan IS NOT NULL)
);
CREATE UNIQUE INDEX uq_thanh_toan_thanh_cong ON giao_dich_thanh_toan(ma_don) WHERE trang_thai='Thành công';
CREATE TABLE su_kien_thanh_toan (
 ma_su_kien TEXT PRIMARY KEY, ma_giao_dich UUID REFERENCES giao_dich_thanh_toan ON DELETE SET NULL,
 noi_dung JSONB NOT NULL, noi_dung_bam TEXT NOT NULL, nhan_luc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE don_nhap_hang (
 ma_po UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_ca UUID REFERENCES ca_lam, ten_nha_cung_cap VARCHAR(150) NOT NULL,
 ngay_nhap DATE NOT NULL, ma_nguoi_xac_nhan UUID NOT NULL REFERENCES nguoi_dung,
 thoi_gian_xac_nhan TIMESTAMPTZ NOT NULL DEFAULT now(), trang_thai_thanh_toan TEXT NOT NULL,
 hinh_thuc_thanh_toan TEXT,
 CHECK((trang_thai_thanh_toan='Công nợ' AND hinh_thuc_thanh_toan IS NULL) OR
 (trang_thai_thanh_toan='Đã thanh toán' AND hinh_thuc_thanh_toan IS NOT NULL AND hinh_thuc_thanh_toan IN ('Tiền mặt','Chuyển khoản')))
);
CREATE TABLE chi_tiet_nhap_hang (
 ma_po UUID NOT NULL REFERENCES don_nhap_hang, ma_nguyen_lieu UUID NOT NULL REFERENCES nguyen_lieu,
 so_luong_dat NUMERIC(14,3) NOT NULL CHECK(so_luong_dat>0), so_luong_nhan NUMERIC(14,3) NOT NULL CHECK(so_luong_nhan>=0),
 don_gia NUMERIC(16,4) NOT NULL CHECK(don_gia>=0), PRIMARY KEY(ma_po,ma_nguyen_lieu)
);
CREATE TABLE phieu_kiem_kho (
 ma_phieu UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_ca UUID NOT NULL UNIQUE REFERENCES ca_lam,
 ma_nguoi_kiem_ke UUID NOT NULL REFERENCES nguoi_dung, ngay_kiem_ke DATE NOT NULL,
 doanh_thu_ca_luc_doi_chieu NUMERIC(14,0) NOT NULL CHECK(doanh_thu_ca_luc_doi_chieu>=0),
 tien_mat_thuc_thu NUMERIC(14,0) NOT NULL CHECK(tien_mat_thuc_thu>=0), chuyen_khoan_thuc_thu NUMERIC(14,0) NOT NULL CHECK(chuyen_khoan_thuc_thu>=0),
 ly_do_chenh_lech_tien VARCHAR(500), trang_thai TEXT NOT NULL DEFAULT 'Đã kiểm kê' CHECK(trang_thai='Đã kiểm kê'),
 thoi_gian_kiem_ke TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(tien_mat_thuc_thu+chuyen_khoan_thuc_thu=doanh_thu_ca_luc_doi_chieu OR nullif(btrim(ly_do_chenh_lech_tien),'') IS NOT NULL)
);
CREATE TABLE chi_tiet_phieu_kiem_kho (
 ma_phieu UUID NOT NULL REFERENCES phieu_kiem_kho, ma_nguyen_lieu UUID NOT NULL REFERENCES nguyen_lieu,
 ton_ly_thuyet_luc_kiem_ke NUMERIC(14,3) NOT NULL, ton_thuc_te NUMERIC(14,3) NOT NULL CHECK(ton_thuc_te>=0),
 nguong_luc_kiem_ke NUMERIC(14,3) NOT NULL CHECK(nguong_luc_kiem_ke>=0),
 ly_do_chenh_lech TEXT CHECK(ly_do_chenh_lech IN ('Hao hụt','Đổ vỡ','Hết hạn','Khác')), ghi_chu VARCHAR(500),
 PRIMARY KEY(ma_phieu,ma_nguyen_lieu),
 CHECK(abs(ton_thuc_te-ton_ly_thuyet_luc_kiem_ke)<=nguong_luc_kiem_ke OR ly_do_chenh_lech IS NOT NULL),
 CHECK(ly_do_chenh_lech IS DISTINCT FROM 'Khác' OR nullif(btrim(ghi_chu),'') IS NOT NULL)
);
CREATE TABLE bao_cao_cuoi_ca (
 ma_bao_cao UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_phieu UUID NOT NULL UNIQUE REFERENCES phieu_kiem_kho,
 ma_ca UUID NOT NULL UNIQUE REFERENCES ca_lam, trang_thai TEXT NOT NULL DEFAULT 'Nháp' CHECK(trang_thai IN ('Nháp','Chờ xác nhận','Đã xác nhận')),
 thoi_gian_gui TIMESTAMPTZ, ma_nguoi_xac_nhan UUID REFERENCES nguoi_dung, thoi_gian_xac_nhan TIMESTAMPTZ,
 CHECK((trang_thai='Nháp') OR thoi_gian_gui IS NOT NULL),
 CHECK(trang_thai<>'Đã xác nhận' OR (ma_nguoi_xac_nhan IS NOT NULL AND thoi_gian_xac_nhan IS NOT NULL))
);
CREATE TABLE bien_dong_kho (
 ma_bien_dong BIGSERIAL PRIMARY KEY, ma_nguyen_lieu UUID NOT NULL REFERENCES nguyen_lieu,
 so_luong NUMERIC(14,3) NOT NULL, loai TEXT NOT NULL CHECK(loai IN ('Nhập hàng','Bán hàng','Kiểm kê')),
 ma_tham_chieu UUID NOT NULL, thoi_gian TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(ma_nguyen_lieu,loai,ma_tham_chieu)
);
CREATE INDEX idx_bien_dong ON bien_dong_kho(ma_nguyen_lieu,thoi_gian);
CREATE TABLE thong_bao (
 ma_thong_bao UUID PRIMARY KEY DEFAULT gen_random_uuid(), ma_nguoi_dung UUID NOT NULL REFERENCES nguoi_dung,
 loai TEXT NOT NULL, noi_dung TEXT NOT NULL, du_lieu JSONB NOT NULL DEFAULT '{}',
 tao_luc TIMESTAMPTZ NOT NULL DEFAULT now(), doc_luc TIMESTAMPTZ
);
CREATE INDEX idx_thong_bao ON thong_bao(ma_nguoi_dung,tao_luc DESC);
