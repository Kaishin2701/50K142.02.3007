import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  act,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';
import { addDays, today } from '../src/app/format';
import type { User } from '../src/services/models';

const manager: User = {
  ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
  ten_dang_nhap: 'quanly',
  ho_ten: 'Quản lý từ DB',
  so_dien_thoai: '0900000001',
  vai_tro: 'Quản lý',
  trang_thai: 'Đang hoạt động',
};
const employee: User = {
  ...manager,
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên từ DB',
  vai_tro: 'Nhân viên',
};
const menu = [
  {
    ma_mon: '33333333-3333-4333-8333-333333333333',
    ten_mon: 'Cà phê từ DB',
    danh_muc: 'Cà phê',
    don_gia_hien_tai: 25000,
  },
];
const material = {
  ma_nguyen_lieu: '66666666-6666-4666-8666-666666666666',
  ten_nguyen_lieu: 'Cà phê kiểm kê',
  don_vi_tinh: 'kg',
  ton_ly_thuyet: 10,
  ton_thuc_te_gan_nhat: 9,
  muc_ton_toi_thieu: 2,
  nguong_chenh_lech: 0.1,
  trang_thai: 'Bình thường',
};
let activeUser: User | null;
let users: User[];
let shifts: any[];
let registrations: any[];
let reports: any[];
let order: any;
let calls: { path: string; method: string; body: any; key?: string }[];
let errors: Map<string, { status: number; message: string; code?: string }>;
let savedCount: any;
let qrEnabled: boolean;
let notifications: any[];
let emptyRevenue: boolean;

function response(data: unknown, status = 200, code = 'TEST_ERROR') {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code, message: data } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
function installApi() {
  const draftRequests = new Map<string, { body: string; order: any }>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(String(options.body)) : undefined;
      calls.push({
        path,
        method,
        body,
        key: (options.headers as any)?.['Idempotency-Key'],
      });
      const failure = errors.get(method + ' ' + path);
      if (failure) {
        errors.delete(method + ' ' + path);
        return response(failure.message, failure.status, failure.code);
      }
      if (path === '/auth/me')
        return activeUser
          ? response(activeUser)
          : response('Vui lòng đăng nhập.', 401);
      if (path === '/auth/login') {
        activeUser = body.ten_dang_nhap === 'nhanvien' ? employee : manager;
        return response(activeUser);
      }
      if (path === '/auth/logout') {
        activeUser = null;
        return response({ da_dang_xuat: true });
      }
      if (path === '/menu') return response(menu);
      if (path === '/notifications') return response(notifications);
      if (path.startsWith('/notifications/')) return response({});
      if (path === '/reports/revenue' && emptyRevenue) return response({ doanh_thu: '0', so_ly: '0', tien_mat: '0', chuyen_khoan: '0' });
      if (path === '/reports/revenue')
        return response({
          doanh_thu: '50000',
          so_ly: '2',
          tien_mat: '50000',
          chuyen_khoan: '0',
        });
      if (path === '/users' && method === 'GET')
        return response(
          users.filter(
            (user) =>
              user.ho_ten.includes(url.searchParams.get('search') ?? '') ||
              user.ten_dang_nhap.includes(url.searchParams.get('search') ?? ''),
          ),
        );
      if (path === '/users' && method === 'POST') {
        const created = {
          ...body,
          ma_nguoi_dung: crypto.randomUUID(),
          trang_thai: 'Đang hoạt động',
        };
        users.push(created);
        return response(created);
      }
      if (path.startsWith('/users/') && method === 'PATCH') {
        const id = path.split('/')[2];
        users = users.map((user) =>
          user.ma_nguoi_dung === id ? { ...user, ...body } : user,
        );
        return response(users.find((user) => user.ma_nguoi_dung === id));
      }
      if (path === '/shifts' && method === 'GET')
        return response({ shifts, registrations });
      if (path === '/shifts' && method === 'POST') {
        const created = {
          ...body,
          ma_ca: crypto.randomUUID(),
          nhan_vien: [],
          thieu_nhan_vien: true,
        };
        shifts.push(created);
        return response([created]);
      }
      if (path.endsWith('/candidates'))
        return response([
          {
            ma_nguoi_dung: employee.ma_nguoi_dung,
            ho_ten: employee.ho_ten,
            loai_dang_ky: 'Mong muốn',
          },
        ]);
      if (path.endsWith('/assignments')) {
        const people = body.ma_nhan_vien.map((id: string) => ({
          ma_nhan_vien: id,
          ho_ten: employee.ho_ten,
        }));
        shifts = shifts.map((shift) =>
          shift.ma_ca === path.split('/')[2]
            ? { ...shift, nhan_vien: people, thieu_nhan_vien: false }
            : shift,
        );
        return response(people);
      }
      if (path === '/shifts/requests' || path === '/shifts/co-workers')
        return response([]);
      if (path === '/shifts/availability' && method === 'POST') {
        const saved = { ...body, ma_dang_ky: crypto.randomUUID() };
        registrations.push(saved);
        return response(saved);
      }
      if (path === '/orders/drafts') {
        const key = (options.headers as any)?.['Idempotency-Key'];
        const previous = draftRequests.get(key);
        if (previous) return previous.body === JSON.stringify(body)
          ? response(previous.order)
          : response('Idempotency-Key đã được dùng cho yêu cầu khác.', 409, 'IDEMPOTENCY_CONFLICT');
        order = {
          ma_don: crypto.randomUUID(),
          ma_ca: body.ma_ca,
          da_xac_nhan: false,
          da_thanh_toan: false,
          trang_thai_pha_che: 'Chưa pha chế',
          tong_tien: body.items.reduce(
            (sum: number, item: any) => sum + item.so_luong * 25000,
            0,
          ),
          thoi_gian_lap: new Date().toISOString(),
          nhan_vien_lap: employee.ho_ten,
          items: body.items.map((item: any) => ({
            ...item,
            ten_mon_luc_lap: menu.find(option => option.ma_mon === item.ma_mon)!.ten_mon,
            don_gia_luc_lap: menu.find(option => option.ma_mon === item.ma_mon)!.don_gia_hien_tai,
          })),
          payments: [],
        };
        draftRequests.set(key, { body: JSON.stringify(body), order });
        return response(order);
      }
      if (path === '/orders' || path === '/orders/history') {
        if (path === '/orders/history' && activeUser?.vai_tro !== 'Quản lý') return response('Bạn không có quyền truy cập.', 403);
        const status = url.searchParams.get('status');
        return response(order && order.da_xac_nhan
          && (path !== '/orders/history' || order.trang_thai_pha_che === 'Hoàn tất pha chế')
          && (!status || order.trang_thai_pha_che === status) ? [order] : []);
      }
      if (path.startsWith('/orders/')) {
        if (!order) return response('Không tìm thấy đơn.', 404);
        if (path.endsWith('/confirm')) {
          order.da_xac_nhan = true;
          order.ma_don_hien_thi = 'ME-000001';
        }
        if (path.endsWith('/start-preparing'))
          order.trang_thai_pha_che = 'Bắt đầu pha chế';
        if (path.endsWith('/complete'))
          order.trang_thai_pha_che = 'Hoàn tất pha chế';
        if (method === 'DELETE') {
          order = null;
          return response({ da_huy: true });
        }
        if (path.endsWith('/invoice.pdf'))
          return new Response('%PDF-test', { status: 200 });
        return response(order);
      }
      if (path === '/payments/cash') {
        if (body.so_tien_nhan < order.tong_tien)
          return response('Số tiền nhận được nhỏ hơn tổng tiền đơn hàng.', 422);
        const payment = {
          ma_giao_dich: crypto.randomUUID(),
          ma_don: order.ma_don,
          phuong_thuc: 'Tiền mặt',
          trang_thai: 'Thành công',
          so_tien_thanh_toan: order.tong_tien,
          so_tien_nhan: body.so_tien_nhan,
          tien_thua: body.so_tien_nhan - order.tong_tien,
        };
        order.da_thanh_toan = true;
        order.payments = [payment];
        return response(payment);
      }
      if (path === '/payments/qr') {
        if (!qrEnabled)
          return response('Chưa cấu hình cổng thanh toán QR.', 503);
        const payment = {
          ma_giao_dich: crypto.randomUUID(),
          ma_don: order.ma_don,
          phuong_thuc: 'Chuyển khoản qua QR',
          trang_thai: 'Chờ xác nhận',
          so_tien_thanh_toan: order.tong_tien,
          ma_tham_chieu_qr: 'ME' + 'a'.repeat(32),
          qrImageUrl: 'https://vietqr.app/img?acc=0123456789&bank=MBBank',
          autoConfirm: true,
        };
        order.payments = [payment];
        return response(payment);
      }
      if (/^\/payments\/[^/]+\/confirm$/.test(path) && method === 'POST') {
        const payment = order.payments.find((p: any) => p.ma_giao_dich === path.split('/')[2]);
        payment.trang_thai = 'Thành công';
        payment.so_tien_nhan = order.tong_tien;
        order.da_thanh_toan = true;
        return response(payment);
      }
      if (path === '/inventory/materials') return response([material]);
      if (path === '/inventory/receipts' || path === '/inventory/losses')
        return response([]);
      if (path === '/inventory/counts/preview')
        return response({
          ma_ca: url.searchParams.get('ma_ca'),
          doanh_thu: 0,
          items: [material],
        });
      if (path === '/inventory/counts') {
        savedCount = {
          ...body,
          ma_phieu: '77777777-7777-4777-8777-777777777777',
        };
        return response(savedCount);
      }
      if (path === '/inventory/close-reports' && method === 'GET')
        return response(reports);
      if (path === '/inventory/close-reports' && method === 'POST') {
        const report = {
          ma_bao_cao: '88888888-8888-4888-8888-888888888888',
          ma_phieu: body.ma_phieu,
          ma_ca: savedCount.ma_ca,
          ngay_kiem_ke: today(),
          ngay_lam: addDays(today(), -1),
          gio_bat_dau: '07:00',
          gio_ket_thuc: '12:00',
          ho_ten_nguoi_lap: employee.ho_ten,
          doanh_thu_ca_luc_doi_chieu: 0,
          tien_mat_thuc_thu: savedCount.tien_mat_thuc_thu,
          chuyen_khoan_thuc_thu: savedCount.chuyen_khoan_thuc_thu,
          trang_thai: 'Nháp',
          items: [
            {
              ...material,
              ton_thuc_te: savedCount.items[0].ton_thuc_te,
              chenh_lech: savedCount.items[0].ton_thuc_te - 10,
            },
          ],
        };
        reports.push(report);
        return response(report);
      }
      if (path.startsWith('/inventory/close-reports/')) {
        const report = reports.find(
          (item) => item.ma_bao_cao === path.split('/')[3],
        );
        if (!report) return response('Không tìm thấy báo cáo.', 404);
        if (path.endsWith('/send')) report.trang_thai = 'Chờ xác nhận';
        if (path.endsWith('/confirm')) {
          report.trang_thai = 'Đã xác nhận';
          report.ho_ten_nguoi_xac_nhan = manager.ho_ten;
          report.thoi_gian_xac_nhan = new Date().toISOString();
        }
        return response(report);
      }
      return response([]);
    }),
  );
}
beforeEach(() => {
  notifications = []; emptyRevenue = false;
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T07:00:00Z'));
  sessionStorage.clear();
  location.hash = '/reports';
  activeUser = manager;
  users = [employee];
  order = null;
  reports = [];
  registrations = [];
  calls = [];
  errors = new Map();
  savedCount = null;
  qrEnabled = false;
  material.ton_ly_thuyet = 10;
  material.trang_thai = 'Bình thường';
  shifts = [
    {
      ma_ca: '44444444-4444-4444-8444-444444444444',
      ngay_lam: today(),
      gio_bat_dau: '00:00',
      gio_ket_thuc: '23:59:59',
      so_nhan_vien_toi_thieu: 1,
      so_nhan_vien_toi_da: 3,
      nhan_vien: [
        { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
      ],
      thieu_nhan_vien: false,
    },
    {
      ma_ca: '44444444-4444-4444-8444-444444444445',
      ngay_lam: addDays(today(), 1),
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
      so_nhan_vien_toi_thieu: 1,
      so_nhan_vien_toi_da: 3,
      nhan_vien: [],
      thieu_nhan_vien: true,
    },
  ];
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.removeAttribute('open');
    },
  });
  installApi();
});
afterEach(() => {
  cleanup();
  menu.splice(1);
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function startSale() {
  activeUser = employee;
  location.hash = '/sales';
  render(<App />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Thêm Cà phê từ DB' }),
  );
  return user;
}
async function checkSale(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Tiếp tục lập hóa đơn' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Kiểm tra đơn', exact: true }),
  );
  await waitFor(() => expect((screen.getByRole('button', { name: 'Xác nhận đơn', exact: true }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole('button', { name: 'Xác nhận đơn', exact: true }));
  await screen.findByRole('button', { name: 'Tiền mặt', exact: true });
}

describe('native application architecture', () => {
  it('highlights only low-stock records while retaining the actual status and STT headings', async () => {
    location.hash = '/stock';
    const previousFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => String(input).includes('/inventory/materials')
      ? response([{ ...material, trang_thai: 'Sắp hết' }, { ...material, ma_nguyen_lieu: 'normal-material', ten_nguyen_lieu: 'Sữa tươi', trang_thai: 'Bình thường' }])
      : previousFetch(input, options));
    render(<App />);
    await screen.findByText('Có 1 nguyên liệu dưới mức tồn tối thiểu');
    expect(screen.getByRole('columnheader', { name: 'STT', exact: true }).textContent).toBe('STT');
    const lowRow = screen.getByText(material.ten_nguyen_lieu).closest('tr')!;
    const normalRow = screen.getByText('Sữa tươi', { exact: true }).closest('tr')!;
    expect(lowRow.classList.contains('low-stock-row')).toBe(true);
    expect(normalRow.classList.contains('low-stock-row')).toBe(false);
    expect(within(lowRow).getByText('Sắp hết')).toBeTruthy();
    expect(within(normalRow).getByText('Bình thường')).toBeTruthy();
  });
  it('changes dishes through the bordered selector, merges duplicate rows and locks the checked snapshot', async () => {
    const alternative = { ...menu[0], ma_mon: '33333333-3333-4333-8333-333333333334', ten_mon: 'Cacao', don_gia_hien_tai: 30000 };
    menu.push(alternative);
    const user = await startSale();
    await user.click(screen.getByRole('button', { name: 'Thêm Cacao', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục lập hóa đơn', exact: true }));
    const quantity = screen.getByLabelText('Số lượng ' + menu[0].ten_mon);
    await user.clear(quantity); await user.type(quantity, '2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tên món dòng 1' }), alternative.ma_mon);
    expect(screen.queryByRole('combobox', { name: 'Tên món dòng 2' })).toBeNull();
    expect((screen.getByLabelText('Số lượng Cacao') as HTMLInputElement).value).toBe('3');
    await user.click(screen.getByRole('button', { name: 'Kiểm tra đơn', exact: true }));
    await waitFor(() => expect(calls.some(call => call.path === '/orders/drafts')).toBe(true));
    expect(calls.find(call => call.path === '/orders/drafts')!.body.items).toEqual([{ ma_mon: alternative.ma_mon, so_luong: 3 }]);
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Tên món dòng 1' }) as HTMLSelectElement).disabled).toBe(true));
    const snapshotQuantity = screen.getByLabelText('Số lượng Cacao') as HTMLInputElement;
    expect(snapshotQuantity.readOnly).toBe(true);
    await user.type(snapshotQuantity, '4');
    expect(snapshotQuantity.value).toBe('3');
  });
  it('shows the Figma forced sign-out dialog on a locked-account API response and acknowledges it once', async () => {
    activeUser = employee; location.hash = '/sales'; render(<App />);
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    const previousFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (String(input).includes('/orders')) return response('Tài khoản của bạn đã bị khóa.', 401, 'ACCOUNT_LOCKED');
      return previousFetch(input, options);
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Quản lý đơn hàng', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Bạn đã bị đăng xuất' });
    expect(within(dialog).getByText(/Tài khoản của bạn đã bị khóa/)).toBeTruthy();
    expect(within(dialog).getAllByRole('button').map(button => button.textContent)).toEqual(['Đã hiểu']);
    expect(screen.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Đã hiểu' }));
    await act(async () => window.dispatchEvent(new CustomEvent('me-session-expired', { detail: { code: 'ACCOUNT_LOCKED' } })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows the lock notice after a locked session is detected on initial page load', async () => {
    const previousFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => String(input).endsWith('/auth/me')
      ? response('Tài khoản của bạn đã bị khóa.', 401, 'ACCOUNT_LOCKED') : previousFetch(input, options));
    render(<App />);
    await screen.findByRole('dialog', { name: 'Bạn đã bị đăng xuất' });
    expect(screen.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeTruthy();
  });
  it('uses the account lock reason from realtime session termination but not from normal expiration', async () => {
    const listeners = new Map<string, (event: MessageEvent) => void>();
    vi.stubGlobal('EventSource', class {
      addEventListener(name: string, listener: (event: MessageEvent) => void) { listeners.set(name, listener); }
      close() {}
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Báo cáo doanh thu', exact: true });
    await act(async () => listeners.get('session-ended')!(new MessageEvent('session-ended', { data: '{"code":"ACCOUNT_LOCKED"}' })));
    await screen.findByRole('dialog', { name: 'Bạn đã bị đăng xuất' });
    cleanup(); listeners.clear();
    render(<App />);
    await screen.findByRole('heading', { name: 'Báo cáo doanh thu', exact: true });
    await act(async () => listeners.get('session-ended')!(new MessageEvent('session-ended', { data: '{"code":"UNAUTHENTICATED"}' })));
    await screen.findByRole('heading', { name: 'Đăng nhập', exact: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each(['Chưa pha chế', 'Hoàn tất pha chế'] as const)('keeps %s order details read-only with their actual status', async (status) => {
    const user = await startSale();
    await checkSale(user);
    order.da_thanh_toan = true;
    order.trang_thai_pha_che = status;
    if (status === 'Hoàn tất pha chế') {
      cleanup();
      activeUser = manager;
      location.hash = '/overview';
      render(<App />);
      await screen.findByRole('heading', { name: 'Báo cáo doanh thu', exact: true });
    }
    await user.click(screen.getByRole('link', { name: 'Quản lý đơn hàng', exact: true }));
    await user.click(await screen.findByRole('button', { name: '#' + order.ma_don_hien_thi, exact: true }));
    const detail = await screen.findByRole('dialog', { name: 'Chi tiết đơn hàng', exact: true });
    await within(detail).findByText('#' + order.ma_don_hien_thi);
    expect(within(detail).getByText(status === 'Hoàn tất pha chế'
      ? 'Đơn đã hoàn tất pha chế. Thông tin chỉ để xem.'
      : 'Thông tin chỉ để xem, không thay đổi trạng thái đơn hàng.')).toBeTruthy();
    expect(detail.querySelector('.order-detail-status')?.textContent).toBe(status);
    expect(within(detail).getByText('Đơn giá là giá tại thời điểm lập đơn.')).toBeTruthy();
    expect(detail.querySelector('.order-detail-summary')?.textContent).toContain(order.ma_don_hien_thi);
    expect(detail.querySelector('.order-detail-items table')).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Xuất hóa đơn', exact: true })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Bắt đầu pha chế', exact: true })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Hoàn tất pha chế', exact: true })).toBeNull();
    expect(within(detail).queryByRole('button', { name: 'Hủy đơn', exact: true })).toBeNull();
    await user.click(within(detail).getAllByRole('button', { name: 'Đóng', exact: true }).at(-1)!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter(c => /start-preparing|complete|invoice\.pdf/.test(c.path))).toEqual([]);
  });
  it('clears QR UI after cancelling an unpaid order and returning to an empty cart', async () => {
    qrEnabled = true;
    const user = await startSale(); await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByAltText('QR thanh toán');
    await user.click(screen.getByRole('button', { name: 'Hủy đơn', exact: true }));
    await user.click(within(screen.getByRole('dialog', { name: 'Hủy đơn' })).getByRole('button', { name: 'Xác nhận', exact: true }));
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    expect(screen.queryByRole('dialog', { name: 'Thanh toán QR' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đối soát thành công', exact: true })).toBeNull();
    expect(screen.queryByAltText('QR thanh toán')).toBeNull();
  });
  it('shows the empty revenue message after applying a period with no transactions', async () => {
    emptyRevenue = true;
    render(<App />);
    await screen.findByText('Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!');
    expect(screen.getAllByText('0 đ').length).toBeGreaterThan(0);
  });
  it('does not add a separate low-stock notification list to closing reports', async () => {
    notifications = [{ ma_thong_bao: 'notice-low-stock', loai: 'CAN_NHAP_HANG', noi_dung: 'Có nguyên liệu cần nhập thêm.', tao_luc: '2026-11-09T05:00:00Z', du_lieu: { ma_bao_cao: 'report-1', nguoi_gui: employee.ho_ten, items: [{ ...material, ton_thuc_te: 1 }] } }];
    location.hash = '/closing'; render(<App />);
    await screen.findByText('Chưa có báo cáo cuối ca.');
    expect(document.querySelector('.low-stock-messages')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xem thông tin' })).toBeNull();
    expect(calls.some(c => c.path === '/notifications/notice-low-stock/read')).toBe(false);
  });
  it('distinguishes stock-entry validation from discrepancies and never saves an invalid count', async () => {
    activeUser = employee; location.hash = '/count'; material.ton_ly_thuyet = 10;
    shifts[0].gio_ket_thuc = '12:00';
    render(<App />); const user = userEvent.setup();
    await user.type(await screen.findByRole('spinbutton', { name: 'Tiền mặt thực thu' }), '0');
    await user.type(screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }), '0');
    const actual = await screen.findByRole('spinbutton', { name: 'Tồn thực tế ' + material.ten_nguyen_lieu });
    await user.type(actual, '-1');
    await user.click(screen.getByRole('button', { name: 'Đối chiếu', exact: true }));
    expect(screen.getByText('Tồn thực tế phải là số không âm, tối đa 3 chữ số thập phân.')).toBeTruthy();
    expect(actual.getAttribute('aria-invalid')).toBe('true');
    await user.clear(actual); await user.type(actual, '9');
    await user.click(screen.getByRole('button', { name: 'Đối chiếu', exact: true }));
    expect(screen.getByText('Có 1 nguyên liệu lệch vượt ngưỡng cho phép.')).toBeTruthy();
    expect(actual.closest('tr')?.className).toBe('discrepancy-row');
    expect(calls.some(c => c.path === '/inventory/counts' && c.method === 'POST')).toBe(false);
  });
  it('shows inline login errors for both empty fields and never submits an incomplete login', async () => {
    activeUser = null;
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập', exact: true }));
    expect(screen.getByText('Vui lòng nhập tên tài khoản.')).toBeTruthy();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeTruthy();
    const username = screen.getByRole('textbox', { name: 'Tên tài khoản' });
    const password = screen.getByLabelText('Mật khẩu', { exact: true });
    expect(username.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    await user.type(username, 'quanly');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
    expect(screen.queryByText('Vui lòng nhập tên tài khoản.')).toBeNull();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeTruthy();
    expect(calls.some(c => c.path === '/auth/login')).toBe(false);
  });
  it('shows account details as read-only fields without changing the account', async () => {
    location.hash = '/accounts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Chi tiết', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Chi tiết tài khoản' });
    const fields = within(dialog).getAllByRole('textbox') as HTMLInputElement[];
    expect(fields).toHaveLength(5);
    expect(fields.every(field => field.readOnly)).toBe(true);
    expect((within(dialog).getByLabelText('Tên đăng nhập') as HTMLInputElement).value).toBe(employee.ten_dang_nhap);
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
  });
  it('marks missing account fields and mismatched passwords before requesting confirmation', async () => {
    location.hash = '/accounts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo tài khoản' });
    const submit = within(dialog).getByRole('button', { name: 'Tạo tài khoản', exact: true });
    await user.click(submit);
    expect(within(dialog).getByText('Vui lòng điền đầy đủ thông tin bắt buộc')).toBeTruthy();
    expect(dialog.querySelectorAll('[aria-invalid="true"]')).toHaveLength(6);
    await user.type(within(dialog).getByLabelText('Tên đăng nhập'), 'test_user');
    await user.type(within(dialog).getByLabelText('Họ và tên'), 'Tài khoản thử');
    await user.type(within(dialog).getByLabelText('Số điện thoại'), '0900000003');
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'Nhân viên');
    await user.type(within(dialog).getByLabelText('Mật khẩu', { exact: true }), 'safe-password');
    await user.type(within(dialog).getByLabelText('Xác nhận mật khẩu'), 'other-password');
    await user.click(submit);
    expect(within(dialog).getByText('Vui lòng xác nhận lại mật khẩu')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Xác nhận tạo tài khoản' })).toBeNull();
    expect(calls.some(c => c.path === '/users' && c.method === 'POST')).toBe(false);
  });
  it.each([
    ['DUPLICATE_USERNAME', 'Tên đăng nhập', 'Tên đăng nhập đã tồn tại. Vui lòng kiểm tra lại'],
    ['DUPLICATE_PHONE', 'Số điện thoại', 'Số điện thoại đã tồn tại. Vui lòng kiểm tra lại'],
  ])('returns %s from confirmation to the correct account field and allows correction', async (code, label, message) => {
    location.hash = '/accounts';
    errors.set('POST /users', { status: 409, code, message });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo tài khoản', exact: true }));
    const dialog = screen.getByRole('dialog', { name: 'Tạo tài khoản' });
    for (const [name, value] of [['Tên đăng nhập', 'new_employee'], ['Họ và tên', 'Tài khoản thử'], ['Số điện thoại', '0900000003'], ['Mật khẩu', 'safe-password'], ['Xác nhận mật khẩu', 'safe-password']])
      await user.type(within(dialog).getByLabelText(name, { exact: true }), value);
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'Nhân viên');
    const submit = within(dialog).getByRole('button', { name: 'Tạo tài khoản', exact: true });
    await user.click(submit);
    await user.click(within(screen.getByRole('dialog', { name: 'Xác nhận tạo tài khoản' })).getByRole('button', { name: 'Tạo tài khoản', exact: true }));
    await within(dialog).findByText(message);
    expect(screen.queryByRole('dialog', { name: 'Xác nhận tạo tài khoản' })).toBeNull();
    expect(within(dialog).getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    await user.type(within(dialog).getByLabelText(label), '4');
    expect(within(dialog).queryByText(message)).toBeNull();
    await user.click(submit);
    expect(screen.getByRole('dialog', { name: 'Xác nhận tạo tài khoản' })).toBeTruthy();
  });
  it('retains the shell and account list while creating an account in a dialog', async () => {
    render(<App />);
    const user = userEvent.setup();
    await screen.findAllByText('50.000 đ');
    const sidebar = screen.getByRole('complementary', {
      name: 'Thanh điều hướng',
    });
    await user.click(
      screen.getByRole('link', { name: 'Quản lý tài khoản', exact: true }),
    );
    await screen.findByText(employee.ten_dang_nhap);
    const table = screen.getByRole('table');
    const hash = location.hash;
    await user.click(
      screen.getByRole('button', { name: 'Tạo tài khoản', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo tài khoản' });
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'Nhân viên');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Tên đăng nhập' }),
      'new_employee',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Họ và tên' }),
      'Người dùng mới',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Số điện thoại' }),
      '0900000003',
    );
    await user.type(
      within(dialog).getByLabelText('Mật khẩu', { exact: true }),
      'safe-password',
    );
    await user.type(
      within(dialog).getByLabelText('Xác nhận mật khẩu'),
      'safe-password',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Tạo tài khoản',
        exact: true,
      }),
    );
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Xác nhận tạo tài khoản' }),
      ).getByRole('button', {
        name: 'Tạo tài khoản',
        exact: true,
      }),
    );
    await screen.findByText('new_employee');
    expect(
      screen.getByRole('complementary', { name: 'Thanh điều hướng' }),
    ).toBe(sidebar);
    expect(screen.getByRole('table')).toBe(table);
    expect(location.hash).toBe(hash);
  });
  it('keeps the sales page mounted while adding items and retains the cart across business pages', async () => {
    const user = await startSale();
    const main = screen.getByRole('main');
    const panel = screen
      .getByRole('heading', { name: 'Chọn món', exact: true })
      .closest('section');
    await user.click(screen.getByRole('button', { name: 'Thêm Cà phê từ DB' }));
    expect(location.hash).toBe('#/sales');
    expect(screen.getByRole('main')).toBe(main);
    expect(
      screen
        .getByRole('heading', { name: 'Chọn món', exact: true })
        .closest('section'),
    ).toBe(panel);
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Số lượng Cà phê từ DB',
        }) as HTMLInputElement
      ).value,
    ).toBe('2');
    await user.click(
      screen.getByRole('link', { name: 'Quản lý đơn hàng', exact: true }),
    );
    await screen.findByRole('heading', {
      name: 'Theo dõi trạng thái đơn hàng',
      exact: true,
    });
    await user.click(
      screen.getByRole('link', { name: 'Bán hàng', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Số lượng Cà phê từ DB',
        }) as HTMLInputElement
      ).value,
    ).toBe('2');
    expect(calls.filter((call) => call.path === '/orders/drafts')).toHaveLength(
      0,
    );
  });
  it('confirms and pays cash in place, preserving the order panel after a rejected amount', async () => {
    const user = await startSale();
    await checkSale(user);
    const main = screen.getByRole('main');
    await user.click(
      screen.getByRole('button', { name: 'Tiền mặt', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Thanh toán tiền mặt' });
    await user.type(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '1000',
    );
    const confirmCash = within(dialog).getByRole('button', { name: 'Xác nhận số tiền' }) as HTMLButtonElement;
    expect(confirmCash.disabled).toBe(true);
    expect(Array.from(dialog.querySelectorAll('.dialog-actions > button')).map(button => button.textContent)).toEqual(['Xác nhận số tiền', 'Chọn lại phương thức']);
    await user.click(
      within(dialog).getByRole('button', { name: 'Xác nhận số tiền' }),
    );
    await within(dialog).findByText(
      'Số tiền nhận được nhỏ hơn tổng tiền đơn hàng',
    );
    expect(calls.filter(call => call.path === '/payments/cash')).toHaveLength(0);
    expect(screen.getByRole('main')).toBe(main);
    await user.clear(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
    );
    await user.type(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '50000',
    );
    expect(confirmCash.disabled).toBe(false);
    await user.click(
      within(dialog).getByRole('button', { name: 'Xác nhận số tiền' }),
    );
    await screen.findByRole('button', { name: 'Xuất hóa đơn' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(location.hash).toBe('#/sales');
    expect(calls.filter((call) => call.path === '/orders/drafts')).toHaveLength(
      1,
    );
  });
  it('restores a checked order after reloading without creating a second draft', async () => {
    const user = await startSale();
    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục lập hóa đơn' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Kiểm tra đơn', exact: true }),
    );
    await screen.findByRole('button', { name: 'Xác nhận đơn', exact: true });
    cleanup();
    render(<App />);
    await screen.findByRole('button', { name: 'Xác nhận đơn', exact: true });
    expect(calls.filter((call) => call.path === '/orders/drafts')).toHaveLength(
      1,
    );
    expect(
      screen.queryByRole('spinbutton', { name: 'Số lượng Cà phê từ DB' }),
    ).toBeNull();
  });
  it('restores drafts saved by the previous frontend', async () => {
    activeUser = employee;
    location.hash = '261:51396';
    order = {
      ma_don: '55555555-5555-4555-8555-555555555555',
      ma_don_hien_thi: 'ME-000001',
      tong_tien: 25000,
      da_xac_nhan: true,
      da_thanh_toan: false,
      trang_thai_pha_che: 'Chưa pha chế',
      items: [
        {
          ma_mon: menu[0].ma_mon,
          ten_mon_luc_lap: menu[0].ten_mon,
          so_luong: 1,
          don_gia_luc_lap: 25000,
        },
      ],
      payments: [],
    };
    sessionStorage.setItem(
      'me-cafe-checkout:' + employee.ma_nguoi_dung,
      order.ma_don,
    );
    render(<App />);
    await screen.findByRole('button', { name: 'Tiền mặt', exact: true });
    expect(await screen.findByText('#ME-000001')).toBeTruthy();
    expect(calls.some((call) => call.path === '/orders/drafts')).toBe(false);
  });
  it('keeps QR configuration errors on the order instead of navigating to a sample QR screen', async () => {
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByText('Chưa cấu hình cổng thanh toán QR.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(location.hash).toBe('#/sales');
  });
  it('returns from insufficient cash to payment selection without recording payment or replacing the order', async () => {
    const user = await startSale(); await checkSale(user);
    const orderId = order.ma_don;
    await user.click(screen.getByRole('button', { name: 'Tiền mặt', exact: true }));
    const cashDialog = screen.getByRole('dialog', { name: 'Thanh toán tiền mặt' });
    await user.type(within(cashDialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }), '1000');
    await within(cashDialog).findByRole('alert');
    await user.click(within(cashDialog).getByRole('button', { name: 'Chọn lại phương thức', exact: true }));
    expect(screen.queryByRole('dialog', { name: 'Thanh toán tiền mặt' })).toBeNull();
    expect(screen.getByRole('button', { name: 'QR', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tiền mặt', exact: true })).toBeTruthy();
    expect(order.ma_don).toBe(orderId); expect(order.da_thanh_toan).toBe(false);
    expect(calls.filter(call => call.path === '/payments/cash')).toHaveLength(0);
  });
  it('reflects automatic QR success from server refresh without clicking reconciliation', async () => {
    qrEnabled = true;
    const user = await startSale();
    await checkSale(user);
    const main = screen.getByRole('main');
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByAltText('QR thanh toán');
    expect(order.da_thanh_toan).toBe(false);
    order.da_thanh_toan = true;
    order.payments[0].trang_thai = 'Thành công';
    window.dispatchEvent(new Event('me-data-changed'));
    await screen.findByRole('button', { name: 'Xuất hóa đơn' });
    expect(screen.queryByRole('dialog', { name: 'Thanh toán QR' })).toBeNull();
    expect(
      calls.filter((call) => /^\/payments\/[^/]+\/(confirm|reconcile)$/.test(call.path)),
    ).toHaveLength(0);
    expect(screen.getByRole('main')).toBe(main);
  });
  it('records a QR payment immediately when the employee confirms it without a bank event', async () => {
    qrEnabled = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByAltText('QR thanh toán');
    expect(order.da_thanh_toan).toBe(false);
    expect(screen.queryByText('Đang chờ ngân hàng xác nhận thanh toán…')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Đối soát thành công', exact: true }));
    await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true });
    expect(order.da_thanh_toan).toBe(true);
    expect(screen.queryByAltText('QR thanh toán')).toBeNull();
    expect(calls.filter(c => /^\/payments\/[^/]+\/confirm$/.test(c.path))).toHaveLength(1);
    expect(calls.filter(c => c.path.endsWith('/reconcile'))).toHaveLength(0);
    expect(calls.filter(c => c.path.endsWith('/start-preparing'))).toHaveLength(0);
  });
  it('polls pending automatic QR if the realtime notification is missed', async () => {
    qrEnabled = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByAltText('QR thanh toán');
    order.da_thanh_toan = true;
    order.payments[0].trang_thai = 'Thành công';
    await screen.findByRole(
      'button',
      { name: 'Xuất hóa đơn' },
      { timeout: 8000 },
    );
    expect(
      calls.filter((call) => /^\/payments\/[^/]+\/(confirm|reconcile)$/.test(call.path)),
    ).toHaveLength(0);
  }, 12000);
  it('assigns employees without replacing the weekly calendar', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    const date = dateTextForTest(addDays(today(), 1));
    await user.click(
      await screen.findByRole('button', { name: new RegExp(date + '.*07:00') }),
    );
    const grid = document.querySelector('.calendar-grid');
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: employee.ho_ten }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('.calendar-grid')).toBe(grid);
    expect(location.hash).toBe('#/shifts');
    expect(
      calls.find((call) => call.path.endsWith('/assignments'))?.body
        .ma_nhan_vien,
    ).toEqual([employee.ma_nguoi_dung]);
  });
  it('registers employee availability in a dialog without changing the schedule route', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `Đăng ký ngày ${today().split('-').reverse().join('/')}`,
        exact: true,
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
    });
    await user.clear(within(dialog).getByLabelText('Ngày', { exact: true }));
    await user.type(
      within(dialog).getByLabelText('Ngày', { exact: true }),
      addDays(today(), 2),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi đăng ký' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' && call.path === '/shifts/availability',
        ),
      ).toBe(true),
    );
    expect(location.hash).toBe('#/schedule');
  });
  it('keeps registration cancellation separate from requests that use actual assigned shifts', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    shifts = [{ ...shifts[0], ngay_lam: addDays(today(), 1), gio_bat_dau: '07:00', gio_ket_thuc: '12:00' }];
    registrations = [{ ma_dang_ky: 'registration-only', ngay: addDays(today(), 2), gio_bat_dau: '10:00', gio_ket_thuc: '14:00', loai_dang_ky: 'Rảnh' }];
    const previousFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (String(input).includes('/shifts/co-workers')) return response([{ ma_nguoi_dung: 'colleague', ho_ten: 'Partner', shifts: [] }]);
      return previousFetch(input, options);
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /10:00–14:00/ }));
    let detail = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });
    expect(within(detail).queryByRole('button', { name: 'Hủy đăng ký', exact: true })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Đổi hoặc xoay ca', exact: true }));
    const change = screen.getByRole('dialog', { name: 'Gửi yêu cầu đổi hoặc xoay ca' });
    expect(within(change).queryByRole('button', { name: 'Hủy', exact: true })).toBeNull();
    await within(change).findByRole('option', { name: 'Partner' });
    await user.selectOptions(within(change).getByLabelText('Loại yêu cầu'), 'Nhờ nhân viên khác làm thay');
    await user.selectOptions(within(change).getByLabelText('Đồng nghiệp'), 'colleague');
    await user.type(within(change).getByLabelText('Lý do'), 'Busy');
    await user.click(within(change).getByRole('button', { name: 'Gửi yêu cầu' }));
    await waitFor(() => expect(calls.some(c => c.path === '/shifts/requests' && c.method === 'POST')).toBe(true));
    expect(calls.find(c => c.path === '/shifts/requests' && c.method === 'POST')!.body.ma_ca).toBe(shifts[0].ma_ca);
    await user.click(screen.getByRole('button', { name: /10:00–14:00/ }));
    detail = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });
    await user.click(within(detail).getByRole('button', { name: 'Hủy', exact: true }));
    const cancellation = screen.getByRole('dialog', { name: 'Bạn có chắc chắn muốn hủy đăng ký này không?' });
    await user.click(within(cancellation).getByRole('button', { name: 'Không', exact: true }));
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Thông tin đăng ký' })).toBe(detail);
  });
  it('renders remaining employee availability chronologically and recomputes it with time and assignments', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-09T05:00:00Z'));
    const template = shifts[0];
    shifts = [
      { ...template, gio_bat_dau: '06:00', gio_ket_thuc: '12:00' },
      {
        ...template,
        ma_ca: '44444444-4444-4444-8444-444444444447',
        gio_bat_dau: '14:00',
        gio_ket_thuc: '18:00',
      },
    ];
    registrations = [
      {
        ma_dang_ky: 'registration-full-day',
        ngay: today(),
        gio_bat_dau: '00:00',
        gio_ket_thuc: '24:00',
        loai_dang_ky: 'Rảnh',
      },
      {
        ma_dang_ky: 'registration-past',
        ngay: addDays(today(), -1),
        gio_bat_dau: '00:00',
        gio_ket_thuc: '24:00',
        loai_dang_ky: 'Mong muốn',
      },
    ];
    render(<App />);
    await screen.findByRole('button', { name: /14:00–18:00/ });
    const cards = () =>
      Array.from(
        document.querySelectorAll(
          '.calendar-cards > button, .calendar-cards > article',
        ),
      );
    expect(
      cards().map((card) => card.querySelector('strong')?.textContent),
    ).toEqual(['12:00–14:00', '14:00–18:00', '18:00–24:00']);
    const user = userEvent.setup();
    await user.click(cards()[0]);
    const detail = screen.getByRole('dialog', {
      name: 'Thông tin đăng ký',
    });
    expect((within(detail).getByLabelText('Giờ bắt đầu') as HTMLInputElement).value).toBe('12:00');
    expect((within(detail).getByLabelText('Giờ kết thúc') as HTMLInputElement).value).toBe('14:00');
    expect((within(detail).getByLabelText('Ngày') as HTMLInputElement).readOnly).toBe(true);
    expect(within(detail).queryByRole('button', { name: 'Đóng', exact: true })).toBeNull();
    await act(async () => { detail.dispatchEvent(new Event('cancel', { cancelable: true })); });
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-09T05:01:00Z'));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() =>
      expect(
        cards().map((card) => card.querySelector('strong')?.textContent),
      ).toEqual(['14:00–18:00', '18:00–24:00']),
    );
    shifts.push({
      ...template,
      ma_ca: '44444444-4444-4444-8444-444444444448',
      gio_bat_dau: '18:00',
      gio_ket_thuc: '22:00',
    });
    window.dispatchEvent(new Event('me-data-changed'));
    await waitFor(() =>
      expect(
        cards().map((card) => card.querySelector('strong')?.textContent),
      ).toEqual(['14:00–18:00', '18:00–22:00', '22:00–24:00']),
    );
    expect(registrations[0].gio_bat_dau).toBe('00:00');
  });
  it('retains ended shifts on the manager calendar', async () => {
    location.hash = '/shifts';
    shifts = [{ ...shifts[0], gio_bat_dau: '06:00', gio_ket_thuc: '12:00' }];
    render(<App />);
    expect(
      await screen.findByRole('button', { name: /06:00–12:00/ }),
    ).toBeTruthy();
  });
  it('can register availability ending at 24:00', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `Đăng ký ngày ${addDays(today(), 1).split('-').reverse().join('/')}`,
        exact: true,
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
    });
    await user.clear(within(dialog).getByLabelText('Giờ kết thúc'));
    await user.type(within(dialog).getByLabelText('Giờ kết thúc'), '24:00');
    expect(
      (within(dialog).getByLabelText('Giờ kết thúc') as HTMLInputElement).value,
    ).toBe('24:00');
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi đăng ký' }),
    );
    await waitFor(() =>
      expect(
        calls.find(
          (call) =>
            call.method === 'POST' && call.path === '/shifts/availability',
        )?.body.gio_ket_thuc,
      ).toBe('24:00'),
    );
  });
  it('invalidates reconciliation when money changes and saves a real closing report', async () => {
    material.ton_ly_thuyet = 10.2;
    activeUser = employee;
    location.hash = '/count';
    shifts.push({
      ...shifts[0],
      ma_ca: '44444444-4444-4444-8444-444444444446',
      ngay_lam: addDays(today(), -1),
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
    });
    render(<App />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '0',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }),
      '0',
    );
    await user.type(
      await screen.findByRole('spinbutton', {
        name: 'Tồn thực tế Cà phê kiểm kê',
      }),
      '10.3',
    );
    await user.click(
      screen.getByRole('button', { name: 'Đối chiếu', exact: true }),
    );
    await screen.findByText('Đã đối chiếu tiền thực thu và tồn thực tế.');
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '1',
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'Lưu phiếu kiểm kho',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '0',
    );
    await user.click(
      screen.getByRole('button', { name: 'Đối chiếu', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Báo cáo cuối ca',
    });
    await user.click(
      await within(dialog).findByRole('button', { name: 'Gửi báo cáo' }),
    );
    await within(dialog).findByText('Chờ xác nhận');
    expect(
      calls.filter((call) => call.path === '/inventory/counts'),
    ).toHaveLength(1);
    expect(
      calls.find((call) => call.path === '/inventory/counts')?.body.items[0]
        .ly_do_chenh_lech,
    ).toBeUndefined();
    expect(
      calls.find((call) => call.path === '/inventory/counts')?.key,
    ).toMatch(/^[0-9a-f-]{36}$/);
    expect(location.hash).toBe('#/count');
  });
  it('logs out through confirmation and clears the authenticated workspace', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await screen.findByRole('textbox', { name: 'Tên tài khoản' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(calls.some((call) => call.path === '/auth/logout')).toBe(true);
  });
  it('creates recurring shifts inside the calendar without changing routes', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    await user.clear(within(dialog).getByLabelText('Ngày làm'));
    await user.type(
      within(dialog).getByLabelText('Ngày làm'),
      addDays(today(), 2),
    );
    await user.click(
      within(dialog).getByRole('radio', { name: 'Ca lặp lại hằng tuần' }),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'Theo số tuần' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.find((call) => call.path === '/shifts' && call.method === 'POST')
        ?.body.lap,
    ).toEqual({ so_tuan: 2 });
    expect(location.hash).toBe('#/shifts');
  });
  it('confirms a closing report in place and shows the real confirmer', async () => {
    const id = '88888888-8888-4888-8888-888888888888';
    reports = [
      {
        ma_bao_cao: id,
        ma_ca: shifts[0].ma_ca,
        ngay_kiem_ke: today(),
        ngay_lam: today(),
        gio_bat_dau: '07:00',
        gio_ket_thuc: '12:00',
        ho_ten_nguoi_lap: employee.ho_ten,
        trang_thai: 'Chờ xác nhận',
        doanh_thu_ca_luc_doi_chieu: 0,
        tien_mat_thuc_thu: 0,
        chuyen_khoan_thuc_thu: 0,
        items: [{ ...material, ton_thuc_te: 10, chenh_lech: 0 }],
      },
    ];
    location.hash = '/closing';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Xem', exact: true }),
    );
    const table = screen.getAllByRole('table')[0];
    const dialog = screen.getByRole('dialog', { name: 'Báo cáo cuối ca' });
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Xác nhận báo cáo',
        exact: true,
      }),
    );
    expect(within(screen.getByRole('dialog', { name: 'Xác nhận báo cáo' })).getByRole('button', { name: 'Đóng', exact: true })).toBeTruthy();
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Xác nhận báo cáo' }),
      ).getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await within(dialog).findByText('Đã xác nhận');
    expect(within(dialog).getByText(manager.ho_ten)).toBeTruthy();
    expect(screen.getAllByRole('table')[0]).toBe(table);
    expect(location.hash).toBe('#/closing');
  });
  it('resumes closing-report creation after a failed second request without inserting another count', async () => {
    activeUser = employee;
    location.hash = '/count';
    shifts.push({
      ...shifts[0],
      ma_ca: '44444444-4444-4444-8444-444444444446',
      ngay_lam: addDays(today(), -1),
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
    });
    errors.set('POST /inventory/close-reports', {
      status: 503,
      message: 'Tạm thời chưa lưu được báo cáo.',
    });
    render(<App />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '0',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }),
      '0',
    );
    await user.type(
      await screen.findByRole('spinbutton', {
        name: 'Tồn thực tế Cà phê kiểm kê',
      }),
      '10',
    );
    await user.click(
      screen.getByRole('button', { name: 'Đối chiếu', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByText('Tạm thời chưa lưu được báo cáo.');
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByRole('dialog', { name: 'Báo cáo cuối ca' });
    expect(
      calls.filter((call) => call.path === '/inventory/counts'),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (call) =>
          call.path === '/inventory/close-reports' && call.method === 'POST',
      ),
    ).toHaveLength(2);
    expect(
      sessionStorage.getItem('me-cafe-pending-count:' + employee.ma_nguoi_dung),
    ).toBeNull();
  });
  it('logs in through the API and keeps validation errors in the login form', async () => {
    activeUser = null;
    errors.set('POST /auth/login', {
      status: 401,
      message: 'Tên đăng nhập hoặc mật khẩu không đúng.',
    });
    render(<App />);
    const user = userEvent.setup();
    const username = await screen.findByRole('textbox', {
      name: 'Tên tài khoản',
    });
    const password = screen.getByLabelText('Mật khẩu', { exact: true });
    await user.type(username, 'quanly');
    await user.type(password, 'actual-password');
    await user.click(
      screen.getByRole('button', { name: 'Đăng nhập', exact: true }),
    );
    await screen.findByText('Tài khoản hoặc mật khẩu không chính xác');
    expect(screen.getByRole('textbox', { name: 'Tên tài khoản' })).toBe(
      username,
    );
    await user.click(
      screen.getByRole('button', { name: 'Đăng nhập', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Tổng quan', exact: true });
    expect(calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      ten_dang_nhap: 'quanly',
      mat_khau: 'actual-password',
    });
  });
  it('edits and locks a real account while retaining its list', async () => {
    location.hash = '/accounts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Chỉnh sửa thông tin tài khoản',
    });
    await user.clear(
      within(dialog).getByRole('textbox', { name: 'Họ và tên' }),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Họ và tên' }),
      'Họ tên đã sửa',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Xác nhận thay đổi thông tin tài khoản' }),
      ).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await screen.findByText('Họ tên đã sửa');
    await user.click(screen.getByRole('button', { name: 'Khóa', exact: true }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Khóa tài khoản' })).getByRole(
        'button',
        { name: 'Khóa', exact: true },
      ),
    );
    await screen.findByText('Đã khóa');
    expect(
      screen.getByRole('button', { name: 'Kích hoạt', exact: true }),
    ).toBeTruthy();
  });
  it('changes report periods and filters without remounting the report page', async () => {
    render(<App />);
    const user = userEvent.setup();
    await screen.findAllByText('50.000 đ');
    const heading = screen.getByRole('heading', {
      name: 'Tổng quan',
      exact: true,
    });
    await user.click(screen.getByRole('button', { name: 'Năm', exact: true }));
    const year = screen.getByRole('spinbutton', { name: 'Ngày báo cáo' });
    await user.clear(year);
    await user.type(year, '2025');
    await user.click(
      screen.getByRole('button', { name: 'Xem báo cáo', exact: true }),
    );
    await waitFor(() => expect(screen.getByText('2025')).toBeTruthy());
    await user.click(
      screen.getByRole('button', { name: 'Chuyển khoản', exact: true }),
    );
    expect(
      screen.getByRole('heading', { name: 'Tổng quan', exact: true }),
    ).toBe(heading);
    expect(location.hash).toBe('#/reports');
  });
  it.each(['cash', 'QR'])('keeps %s preparation changes visible in tracking and completed details', async (method) => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL() { return 'blob:test'; }
      static revokeObjectURL() {}
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    qrEnabled = true;
    const user = await startSale(); await checkSale(user);
    if (method === 'cash') {
      await user.click(screen.getByRole('button', { name: 'Tiền mặt', exact: true }));
      await user.type(screen.getByRole('spinbutton', { name: 'Số tiền nhận được' }), '50000');
      await user.click(screen.getByRole('button', { name: 'Xác nhận số tiền', exact: true }));
    } else {
      await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
      await user.click(await screen.findByRole('button', { name: 'Đối soát thành công', exact: true }));
    }
    await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true });
    const track = async (status: string) => {
      await user.click(screen.getByRole('link', { name: 'Quản lý đơn hàng', exact: true }));
      const code = await screen.findByRole('button', { name: '#' + order.ma_don_hien_thi, exact: true });
      await waitFor(() => expect(within(code.closest('tr')!).getByText(status)).toBeTruthy());
    };
    await track('Chưa pha chế');
    await user.click(screen.getByRole('link', { name: 'Bán hàng', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Xuất hóa đơn', exact: true }));
    await screen.findByRole('button', { name: 'Hoàn tất pha chế', exact: true });
    await track('Bắt đầu pha chế');
    await user.click(screen.getByRole('link', { name: 'Bán hàng', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Hoàn tất pha chế', exact: true }));
    await screen.findByText('Đã ghi nhận hoàn tất pha chế cho đơn #ME-000001');
    await track('Hoàn tất pha chế');
    await user.click(screen.getByRole('button', { name: '#' + order.ma_don_hien_thi, exact: true }));
    const detail = await screen.findByRole('dialog', { name: 'Chi tiết đơn hàng' });
    await within(detail).findByText('Đơn đã hoàn tất pha chế. Thông tin chỉ để xem.');
    expect(screen.queryByText('Lịch sử đơn hàng chỉ dành cho quản lý.')).toBeNull();
  });
  it.each(['restored order', 'legacy key without order'])('starts a fresh same-item sale after a completed %s', async (savedState) => {
    const user = await startSale(); await checkSale(user);
    const oldId = order.ma_don;
    const oldKey = calls.find(c => c.path === '/orders/drafts')!.key;
    order.da_thanh_toan = true;
    order.trang_thai_pha_che = 'Hoàn tất pha chế';
    cleanup();
    if (savedState === 'legacy key without order') sessionStorage.setItem(
      'me-cafe-checkout-state:' + employee.ma_nguoi_dung,
      JSON.stringify({ cart: [], requestKey: oldKey }),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    await user.click(await screen.findByRole('button', { name: 'Thêm Cà phê từ DB' }));
    await checkSale(user);
    expect(order.ma_don).not.toBe(oldId);
    expect(order.da_thanh_toan).toBe(false);
    const drafts = calls.filter(c => c.path === '/orders/drafts');
    expect(drafts.at(-1)!.key).not.toBe(oldKey);
    expect(drafts).toHaveLength(savedState === 'restored order' ? 2 : 3);
    expect(screen.queryByText('Lịch sử đơn hàng chỉ dành cho quản lý.')).toBeNull();
  });
  it('prints and completes a paid order, keeping its summary until the next sale', async () => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL() {
          return 'blob:test';
        }
        static revokeObjectURL() {}
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = await startSale();
    await checkSale(user);
    await user.click(
      screen.getByRole('button', { name: 'Tiền mặt', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Thanh toán tiền mặt' });
    await user.type(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '50000',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Xác nhận số tiền' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Tăng số bản' }));
    expect(screen.getByLabelText('Số bản').textContent).toBe('2');
    await user.click(screen.getByRole('button', { name: 'Xuất hóa đơn', exact: true }));
    expect(calls.find(call => call.path.endsWith('/invoice.pdf'))).toBeTruthy();
    await user.click(
      await screen.findByRole('button', {
        name: 'Hoàn tất pha chế',
        exact: true,
      }),
    );
    await screen.findByText('Đã ghi nhận hoàn tất pha chế cho đơn #ME-000001');
    expect(screen.getAllByText('25.000 đ').length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole('button', { name: 'Lập đơn mới', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    expect(
      screen.queryByRole('spinbutton', { name: 'Số lượng Cà phê từ DB' }),
    ).toBeNull();
    expect(
      sessionStorage.getItem('me-cafe-checkout:' + employee.ma_nguoi_dung),
    ).toBeNull();
  });
});
function dateTextForTest(date: string) {
  return date.split('-').reverse().join('\\/');
}
