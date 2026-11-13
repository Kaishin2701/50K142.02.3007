import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
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
let errors: Map<string, { status: number; message: string }>;
let savedCount: any;
let qrEnabled: boolean;

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code: 'TEST_ERROR', message: data } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
function installApi() {
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
        return response(failure.message, failure.status);
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
        order = {
          ma_don: '55555555-5555-4555-8555-555555555555',
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
            ten_mon_luc_lap: menu[0].ten_mon,
            don_gia_luc_lap: 25000,
          })),
          payments: [],
        };
        return response(order);
      }
      if (path === '/orders' || path === '/orders/history')
        return response(order && order.da_xac_nhan ? [order] : []);
      if (path.startsWith('/orders/')) {
        if (!order) return response('Không tìm thấy đơn.', 404);
        if (
          method === 'GET' &&
          order.trang_thai_pha_che === 'Hoàn tất pha chế' &&
          activeUser?.vai_tro === 'Nhân viên'
        )
          return response('Lịch sử đơn hàng chỉ dành cho quản lý.', 403);
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
  await user.click(
    await screen.findByRole('button', { name: 'Xác nhận đơn', exact: true }),
  );
  await screen.findByRole('button', { name: 'Tiền mặt', exact: true });
}

describe('native application architecture', () => {
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
    await user.click(
      within(dialog).getByRole('button', { name: 'Xác nhận số tiền' }),
    );
    await within(dialog).findByText(
      'Số tiền nhận được nhỏ hơn tổng tiền đơn hàng.',
    );
    expect(screen.getByRole('main')).toBe(main);
    await user.clear(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
    );
    await user.type(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '50000',
    );
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
    expect(screen.getByText('#ME-000001')).toBeTruthy();
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
  it('reflects automatic QR success from server refresh without clicking reconciliation', async () => {
    qrEnabled = true;
    const user = await startSale();
    await checkSale(user);
    const main = screen.getByRole('main');
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByText('Đang chờ ngân hàng xác nhận thanh toán…');
    expect(order.da_thanh_toan).toBe(false);
    order.da_thanh_toan = true;
    order.payments[0].trang_thai = 'Thành công';
    window.dispatchEvent(new Event('me-data-changed'));
    await screen.findByRole('button', { name: 'Xuất hóa đơn' });
    expect(screen.queryByRole('dialog', { name: 'Thanh toán QR' })).toBeNull();
    expect(
      calls.filter((call) => call.path.endsWith('/reconcile')),
    ).toHaveLength(0);
    expect(screen.getByRole('main')).toBe(main);
  });
  it('polls pending automatic QR if the realtime notification is missed', async () => {
    qrEnabled = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    await screen.findByText('Đang chờ ngân hàng xác nhận thanh toán…');
    order.da_thanh_toan = true;
    order.payments[0].trang_thai = 'Thành công';
    await screen.findByRole(
      'button',
      { name: 'Xuất hóa đơn' },
      { timeout: 8000 },
    );
    expect(
      calls.filter((call) => call.path.endsWith('/reconcile')),
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
    await user.selectOptions(
      within(dialog).getByLabelText('Kết thúc lặp'),
      'weeks',
    );
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
    await screen.findByText('Tên đăng nhập hoặc mật khẩu không đúng.');
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
        screen.getByRole('dialog', { name: 'Xác nhận lưu thay đổi' }),
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
