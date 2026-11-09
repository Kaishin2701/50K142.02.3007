import screens from './screens.json';

export type Screen = (typeof screens)[number];
export type Navigate = (prefix: string) => void;

export const initialScreen = '261:28311';
export const screenFor = (prefix: string) => screens.find(screen =>
  screen.id === prefix || screen.name.startsWith(prefix + ' -'));

/** Navigation between the existing Figma frames; no additional product screens. */
export function actionFor(label: string, screen: Screen, manager: boolean): string | undefined {
  const name = screen.name;
  const group = name.split('-')[0];
  const text = label.replace(/\s+/g, ' ').trim();
  const is = (prefix: string) => name.startsWith(prefix);

  const menu: Record<string, string> = {
    'Bán hàng': 'GD1.3-2-1', 'Tổng quan': 'GD5.1-7-1',
    'Quản lý tài khoản': 'GD2.4-4-1', 'Danh sách tài khoản': 'GD2.4-4-1',
    'Quản lý ca': 'GD3.1-2-1', 'Quản lý ca làm': 'GD3.1-2-1',
    'Lịch làm việc của tôi': 'GD6.1-3-1',
    'Quản lý đơn hàng': manager ? 'GD1.1-2-1' : 'GD1.2-2-1',
    'Lịch sử đơn hàng': 'GD1.1-2-1', 'Tra cứu lịch sử đơn hàng': 'GD1.1-2-1',
    'Theo dõi trạng thái đơn hàng': 'GD1.2-2-1', 'Theo dõi trạng thái': 'GD1.2-2-1',
    'Kho': manager ? 'GD4.1-2-1' : 'GD4.4-2-1',
    'Quản lý kho': 'GD4.1-2-1', 'Tổng hợp tồn kho': 'GD4.1-2-1',
    'Lịch sử nhập hàng': 'GD4.2-2-1', 'Lịch sử hao hụt': 'GD4.3-2-1',
    'Kiểm kê nguyên liệu': 'GD4.4-2-1', 'Báo cáo cuối ca': 'GD4.5-2-1',
  };
  if (text === 'Đăng xuất') return manager ? 'GD7-3-2' : 'GD7-3-1';
  if (text === '×' || text === 'Đóng' || text === 'Quay lại' || text === 'Hủy' || text === 'Không') {
    if (is('GD7')) return manager ? 'GD5.1-7-1' : 'GD6.1-3-1';
    if (is('GD2')) return 'GD2.4-4-1';
    if (is('GD3')) return 'GD3.1-2-1';
    if (is('GD6')) return 'GD6.1-3-1';
    if (is('GD5')) return 'GD5.1-7-1';
    if (is('GD1.1')) return 'GD1.1-2-1';
    if (is('GD1.2')) return 'GD1.2-2-1';
    if (is('GD4.2')) return 'GD4.2-2-1';
    if (is('GD4.5')) return 'GD4.5-6-1';
  }
  if (text === 'Tải lại' || text === 'Thử lại') {
    return ({ 'GD2.4': 'GD2.4-4-1', 'GD4.1': 'GD4.1-2-1', 'GD4.2': 'GD4.2-2-1',
      'GD4.3': 'GD4.3-2-1', 'GD5.1': 'GD5.1-7-1', 'GD5.2': 'GD5.2-8-1' } as Record<string, string>)[group];
  }
  if (text === 'Xác nhận') {
    if (is('GD7')) return 'GD7-8-1';
    if (is('GD2.1')) return 'GD2.1-9-1';
    if (is('GD2.2')) return 'GD2.2-9-1';
    if (is('GD2.3-4a')) return 'GD2.3-4a5-1';
    if (is('GD2.3')) return 'GD2.3-8-1';
    if (is('GD3.3')) return 'GD3.3-11-1';
    if (is('GD4.5')) return 'GD4.5-9-1';
    if (is('GD5.3')) return 'GD5.3-8-1';
    if (is('GD6.3')) return 'GD6.3-10-1';
  }
  if (text === 'Tạo tài khoản') return is('GD2.1') ? 'GD2.1-5a1-1' : 'GD2.1-3-1';
  if (text === 'Tìm kiếm' && is('GD2')) return 'GD2.4-4-1';
  if (text === 'Chỉnh sửa') return is('GD3') ? 'GD3.3-3-1' : 'GD2.2-3-1';
  if (text === 'Chi tiết') return 'GD2.4-5a2-1';
  if (text === 'Khóa') return 'GD2.3-5-1';
  if (text === 'Kích hoạt') return 'GD2.3-4a2-1';
  if (text === 'Lưu' || text === 'Lưu thay đổi') {
    if (is('GD2.2')) return 'GD2.2-5a1-1';
    if (is('GD3.3')) return 'GD3.3-6-1';
    if (is('GD3.4')) return 'GD3.4-9-1';
    if (is('GD3.2')) return 'GD3.2-8-1';
  }
  if (text === 'Tạo ca mới' || text === '+ Tạo ca mới') return 'GD3.2-2-1';
  if (text === 'Phân công') return 'GD3.4-2-1';
  if (text === 'Ca diễn ra một lần') return 'GD3.2-2-1';
  if (text === 'Ca lặp lại hằng tuần' || text === 'Ca lặp hằng tuần') return 'GD3.2-3a2-1';
  if (text === 'Theo ngày' || text === 'Kết thúc theo ngày') return 'GD3.2-3a2-1';
  if (text === 'Theo số tuần' || text === 'Kết thúc theo số tuần') return 'GD3.2-3a2-2';
  if (text === 'Yêu cầu' || text.includes('Xử lý yêu cầu đổi')) return manager ? 'GD3.5-2-1' : 'GD6.5-2-1';
  if (text === 'Đồng ý' || text === 'Chấp thuận') return manager ? 'GD3.5-9-1' : 'GD6.5-8-1';
  if (text === 'Từ chối') return manager ? 'GD3.5-7a2-1' : 'GD6.5-6a3-1';
  if (text === 'Đổi hoặc xoay ca') return 'GD6.4-5-1';
  if (text === 'Đổi ca hai chiều') return manager ? 'GD3.5-4-1' : is('GD6.4') ? 'GD6.4-5-1' : 'GD6.5-4-1';
  if (text === 'Nhờ nhân viên khác làm thay' || text === 'Nhờ nhân viên làm thay') return manager ? 'GD3.5-3a2-1' : 'GD6.4-6a1-1';
  if (text === 'Gửi yêu cầu') return 'GD6.4-13-1';
  if (text === 'Gửi đăng ký') return 'GD6.2-8-1';
  if (text === 'Hủy đăng ký') return 'GD6.3-6-1';
  if (text === 'Rảnh') return 'GD6.2-4-1';
  if (text === 'Mong muốn') return 'GD6.2-2-1';
  if (text === '+') return is('GD1') ? 'GD1.3-3-1' : manager ? 'GD3.2-2-1' : 'GD6.2-2-1';
  if (['‹', '›', '❮', '❯', '←', '→'].includes(text)) return manager ? 'GD3.1-3a2-1' : 'GD6.1-3a2-1';
  if (text === 'Hôm nay') return manager ? 'GD3.1-2-1' : 'GD6.1-3b2-1';
  if (text === 'Đối chiếu') return 'GD4.4-7-1';
  if (text === 'Lưu phiếu kiểm kho') return 'GD4.5-2-2';
  if (text === 'Lập báo cáo cuối ca') return 'GD4.5-2-1';
  if (text === 'Gửi báo cáo') return 'GD4.5-4-1';
  if (text === 'Xác nhận báo cáo') return 'GD4.5-7-1';
  if (text === 'Gửi thông tin nguyên liệu cần nhập') return 'GD4.5-4a3-1';
  if (text === 'Kiểm tra báo cáo' || text === 'Xem báo cáo cuối ca') return 'GD4.5-6-1';
  if (is('GD4.2') && (/^PO/.test(text) || text === 'Đã thanh toán')) return 'GD4.2-4-1';
  if (is('GD4.2') && text === 'Công nợ') return 'GD4.2-4a1-1';
  if (text === 'Trang sau' || (text === '2' && /^GD4\.[23]/.test(name))) return is('GD4.2') ? 'GD4.2-2a2-1' : 'GD4.3-3a2-1';
  if (text === 'Trang trước' || (text === '1' && /^GD4\.[23]/.test(name))) return is('GD4.2') ? 'GD4.2-2-1' : 'GD4.3-2-1';
  if (text === 'Ngày') return 'GD5.1-7-1';
  if (text === 'Tháng') return 'GD5.1-11-1';
  if (text === 'Năm') return 'GD5.1-11-2';
  if (text === 'Xem báo cáo') return is('GD5.1-11-2') ? 'GD5.1-11-2' : is('GD5.1-11-1') ? 'GD5.1-11-1' : 'GD5.1-7-1';
  if (text === 'Xuất báo cáo') return 'GD5.3-4a1-1';
  if (text === 'Excel') return 'GD5.3-4a1-1';
  if (text === 'PDF') return 'GD5.3-4b1-1';
  if (is('GD5') && text === 'Tiền mặt') return 'GD5.2-8-1';
  if (is('GD5') && text === 'Chuyển khoản') return 'GD5.2-8-2';
  if (is('GD1')) {
    if (text === 'Tra cứu' || text === 'Tìm kiếm') return is('GD1.1') ? 'GD1.1-5-1' : 'GD1.2-4-1';
    if (text === '#ME-0141' || text === 'ME-0141') return 'GD1.1-7-1';
    if (text === 'Cà phê') return 'GD1.3-2-1';
    if (text === 'Mê Soda') return 'GD1.3-2-2';
    if (text === 'Trà sữa') return 'GD1.3-2-3';
    if (text === 'Matcha') return 'GD1.3-2-4';
    if (text === 'Tiếp tục lập hóa đơn') return 'GD1.3-4-1';
    if (text === 'Kiểm tra đơn') return 'GD1.3-6-1';
    if (text === 'Xác nhận đơn') return 'GD1.3-9-1';
    if (text === 'QR' || text === 'Chuyển khoản QR') return 'GD1.3-11-1';
    if (text === 'Tiền mặt') return 'GD1.3-10a5-1';
    if (text === 'Đối soát thành công') return 'GD1.3-15-1';
    if (text === 'Đối soát chưa thành công') return 'GD1.3-14a1-1';
    if (text === 'Xác nhận số tiền') return 'GD1.3-15-2';
    if (text === 'Xuất hóa đơn') return 'GD1.3-19-1';
    if (text === 'Hoàn tất pha chế') return 'GD1.3-21-1';
    if (text === 'Hủy đơn') return 'GD1.4-2-1';
    if (text === 'Dừng đặt hàng') return 'GD1.3-5a5-1';
    if (text === 'Chọn lại phương thức' || text === 'Chọn lại phương thức thanh toán') return 'GD1.3-9-1';
  }
  return menu[text];
}
