export type Numeric = number | string;
export type User = {
  ma_nguoi_dung: string;
  ten_dang_nhap: string;
  ho_ten: string;
  so_dien_thoai: string;
  vai_tro: 'Quản lý' | 'Nhân viên';
  trang_thai: 'Đang hoạt động' | 'Đã khóa';
};
export type MenuItem = {
  ma_mon: string;
  ten_mon: string;
  danh_muc: string;
  don_gia_hien_tai: Numeric;
};
export type CartLine = MenuItem & { so_luong: string };
export type OrderLine = {
  ma_mon: string;
  ten_mon_luc_lap: string;
  so_luong: Numeric;
  don_gia_luc_lap: Numeric;
  thanh_tien?: Numeric;
};
export type Payment = {
  ma_giao_dich: string;
  ma_don: string;
  phuong_thuc: string;
  trang_thai: string;
  so_tien_thanh_toan: Numeric;
  so_tien_nhan?: Numeric;
  tien_thua?: Numeric;
  ma_tham_chieu_qr?: string;
  qrImageUrl?: string;
};
export type Order = {
  ma_don: string;
  ma_don_hien_thi?: string;
  ma_ca: string;
  thoi_gian_lap: string;
  tong_tien: Numeric;
  da_xac_nhan: boolean;
  da_thanh_toan: boolean;
  trang_thai_pha_che: 'Chưa pha chế' | 'Bắt đầu pha chế' | 'Hoàn tất pha chế';
  nhan_vien_lap?: string;
  phuong_thuc?: string;
  items: OrderLine[];
  payments?: Payment[];
  total?: number;
};
export type Assignment = { ma_nhan_vien: string; ho_ten: string };
export type Shift = {
  ma_ca: string;
  ngay_lam: string;
  gio_bat_dau: string;
  gio_ket_thuc: string;
  so_nhan_vien_toi_thieu: number;
  so_nhan_vien_toi_da: number;
  nhan_vien: Assignment[];
  thieu_nhan_vien: boolean;
};
export type Registration = {
  ma_dang_ky: string;
  ngay: string;
  gio_bat_dau: string;
  gio_ket_thuc: string;
  loai_dang_ky: 'Rảnh' | 'Mong muốn';
  ho_ten?: string;
};
export type CalendarData = { shifts: Shift[]; registrations: Registration[] };
export type Candidate = {
  ma_nguoi_dung: string;
  ho_ten: string;
  loai_dang_ky: string;
};
export type ShiftRequest = {
  ma_yeu_cau: string;
  ma_ca: string;
  nguoi_gui: string;
  ma_nhan_vien_duoc_de_nghi: string;
  ho_ten_nguoi_gui: string;
  ho_ten_nguoi_nhan: string;
  loai_yeu_cau: string;
  trang_thai: string;
  ly_do: string;
  ca_hien_tai: Shift;
  ca_dong_nghiep?: Shift;
};
export type Material = {
  ma_nguyen_lieu: string;
  ten_nguyen_lieu: string;
  don_vi_tinh: string;
  ton_ly_thuyet: Numeric;
  ton_thuc_te_gan_nhat?: Numeric;
  muc_ton_toi_thieu: Numeric;
  nguong_chenh_lech: Numeric;
  trang_thai: string;
};
export type CountPreview = {
  ma_ca: string;
  doanh_thu: Numeric;
  items: Material[];
};
export type CountLine = {
  ma_nguyen_lieu: string;
  ten_nguyen_lieu: string;
  don_vi_tinh: string;
  ton_thuc_te: Numeric;
  chenh_lech: Numeric;
  ly_do_chenh_lech?: string;
  ghi_chu?: string;
};
export type ClosingReport = {
  ma_bao_cao: string;
  ma_phieu: string;
  ma_ca: string;
  ngay_kiem_ke: string;
  ngay_lam?: string;
  gio_bat_dau?: string;
  gio_ket_thuc?: string;
  ho_ten_nguoi_lap: string;
  ho_ten_nguoi_xac_nhan?: string;
  thoi_gian_xac_nhan?: string;
  doanh_thu_ca_luc_doi_chieu: Numeric;
  tien_mat_thuc_thu: Numeric;
  chuyen_khoan_thuc_thu: Numeric;
  ly_do_chenh_lech_tien?: string;
  trang_thai: 'Nháp' | 'Chờ xác nhận' | 'Đã xác nhận';
  items: CountLine[];
};
