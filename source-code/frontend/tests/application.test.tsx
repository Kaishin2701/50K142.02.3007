import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '../src/app/App';
import { addDays, today } from '../src/app/format';
import type { Payment, QrMode, ShiftRequest, User } from '../src/services/models';

const applicationCss = readFileSync(
  resolve(process.cwd(), 'src/styles/application.css'),
  'utf8',
);

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
const displayDate = (value: string) => value.split('-').reverse().join('/');
function makeShiftRequest(
  type: string,
  id = '99999999-9999-4999-8999-999999999991',
): ShiftRequest {
  const date = today();
  return {
    ma_yeu_cau: id,
    ma_ca: '44444444-4444-4444-8444-444444444444',
    nguoi_gui: employee.ma_nguoi_dung,
    ma_nhan_vien_duoc_de_nghi: '33333333-3333-4333-8333-333333333333',
    ho_ten_nguoi_gui: 'An Nguyễn',
    ho_ten_nguoi_nhan: 'Bình Trần',
    loai_yeu_cau: type,
    trang_thai: 'Chờ xử lý',
    ly_do: 'Lịch cá nhân thay đổi.',
    ca_hien_tai: {
      ma_ca: '44444444-4444-4444-8444-444444444444',
      ngay_lam: date,
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
    },
    ca_dong_nghiep:
      type === 'Đổi ca hai chiều'
        ? {
            ma_ca: '55555555-5555-4555-8555-555555555555',
            ngay_lam: addDays(date, 1),
            gio_bat_dau: '12:00',
            gio_ket_thuc: '17:00',
          }
        : null,
  };
}
let activeUser: User | null;
let users: User[];
let shifts: any[];
let shiftRequests: ShiftRequest[];
let candidates: { ma_nguoi_dung: string; ho_ten: string; loai_dang_ky: string }[];
let registrations: any[];
let reports: any[];
let order: any;
let calls: { path: string; method: string; body: any; key?: string }[];
let errors: Map<
  string,
  {
    status: number;
    message: string;
    code?: string;
    details?: { field: string; message: string }[];
  }
>;
let savedCount: any;
let qrConfigured = false;
let qrPayloadOnly = false;
let qrDemo = false;
let qrMode: QrMode = 'live';
let qrReconcileShouldFail = false;
let qrReconcileNetworkFails = false;
let qrReconcileResponseOverride: Partial<Payment> | null = null;
let qrOrderGetStale = false;
let delayLogout = false;
let completeLogout: (() => void) | undefined;

function response(
  data: unknown,
  status = 200,
  code = 'TEST_ERROR',
  details?: { field: string; message: string }[],
) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code, message: data, details } },
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
        return response(
          failure.message,
          failure.status,
          failure.code,
          failure.details,
        );
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
        if (delayLogout)
          return await new Promise<Response>((resolve) => {
            completeLogout = () => {
              activeUser = null;
              resolve(response({ da_dang_xuat: true }));
            };
          });
        activeUser = null;
        return response({ da_dang_xuat: true });
      }
      if (path === '/payments/mode') return response({ mode: qrMode });
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
      if (path.startsWith('/shifts/') && method === 'PATCH') {
        const id = path.split('/')[2];
        shifts = shifts.map((shift) =>
          shift.ma_ca === id ? { ...shift, ...body } : shift,
        );
        return response(shifts.find((shift) => shift.ma_ca === id));
      }
      if (path.endsWith('/candidates')) return response(candidates);
      if (path.endsWith('/assignments')) {
        const people = body.ma_nhan_vien.map((id: string) => ({
          ma_nhan_vien: id,
          ho_ten:
            candidates.find((person) => person.ma_nguoi_dung === id)?.ho_ten ??
            employee.ho_ten,
        }));
        shifts = shifts.map((shift) =>
          shift.ma_ca === path.split('/')[2]
            ? {
                ...shift,
                nhan_vien: people,
                thieu_nhan_vien:
                  people.length < shift.so_nhan_vien_toi_thieu,
              }
            : shift,
        );
        return response(people);
      }
      if (path === '/shifts/requests' && method === 'GET')
        return response(shiftRequests);
      if (path === '/shifts/requests' && method === 'POST')
        return response(body);
      if (
        path.startsWith('/shifts/requests/') &&
        method === 'POST' &&
        (path.endsWith('/decide') || path.endsWith('/respond'))
      ) {
        const request = shiftRequests.find(
          (item) => item.ma_yeu_cau === path.split('/')[3],
        );
        if (!request) return response('Không tìm thấy yêu cầu.', 404);
        request.trang_thai = path.endsWith('/decide')
          ? body.dong_y
            ? 'Đã chấp thuận'
            : 'Bị từ chối'
          : body.dong_y
            ? 'Chờ xử lý'
            : 'Bị từ chối';
        return response(request);
      }
      if (path === '/shifts/co-workers')
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
        if (method === 'GET' && qrOrderGetStale)
          return response({
            ...order,
            da_thanh_toan: false,
            payments: (order.payments ?? []).map((payment: any) => ({
              ...payment,
              trang_thai: 'Chờ xác nhận',
            })),
          });
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
          if (
            order.da_thanh_toan ||
            order.trang_thai_pha_che !== 'Chưa pha chế'
          ) {
            return response(
              'Đơn hàng không thể hủy do đã thanh toán thành công hoặc đã bắt đầu pha chế.',
              409,
              'CANNOT_CANCEL',
            );
          }
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
        if ((qrConfigured || qrDemo) && order) {
          const payment = {
            ma_giao_dich: crypto.randomUUID(),
            ma_don: order.ma_don,
            phuong_thuc: 'Chuyển khoản qua QR',
            trang_thai: 'Chờ xác nhận',
            so_tien_thanh_toan: order.tong_tien,
            ma_tham_chieu_qr: qrDemo ? 'DEMOABC123' : 'REF-001',
            qr_mo_phong: qrDemo,
            ...(qrDemo
              ? {
                  qrImageUrl: 'data:image/png;base64,bG9jYWwtdmlldHFy',
                }
              : qrPayloadOnly
              ? { qrContent: 'BANK-TRANSFER-PAYLOAD' }
              : {
                  qrImageUrl:
                    'data:image/png;base64,bG9jYWwtdmlldHFy',
                }),
          };
          order.payments = [...(order.payments ?? []), payment];
          return response(payment);
        }
        return response('Chưa cấu hình cổng thanh toán QR.', 503);
      }
      if (path.startsWith('/payments/') && path.endsWith('/reconcile')) {
        const payment = order?.payments?.find(
          (item: any) => item.ma_giao_dich === path.split('/')[2],
        );
        if (
          qrReconcileShouldFail ||
          !qrDemo ||
          !payment?.qr_mo_phong
        )
          return response(
            'Đối soát chưa thành công: giao dịch chưa được xác nhận hoặc chưa đủ số tiền.',
            422,
            'PAYMENT_UNCONFIRMED',
          );
        if (!payment) return response('Không tìm thấy giao dịch QR.', 404);
        if (qrReconcileResponseOverride)
          return response({ ...payment, ...qrReconcileResponseOverride });
        payment.trang_thai = 'Thành công';
        order.da_thanh_toan = true;
        if (qrReconcileNetworkFails) {
          qrReconcileNetworkFails = false;
          throw new TypeError('fetch failed');
        }
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
  candidates = [
    {
      ma_nguoi_dung: employee.ma_nguoi_dung,
      ho_ten: employee.ho_ten,
      loai_dang_ky: 'Mong muốn',
    },
  ];
  order = null;
  reports = [];
  registrations = [];
  shiftRequests = [];
  calls = [];
  errors = new Map();
  qrConfigured = false;
  qrPayloadOnly = false;
  qrDemo = false;
  qrMode = 'live';
  qrReconcileShouldFail = false;
  qrReconcileNetworkFails = false;
  qrReconcileResponseOverride = null;
  qrOrderGetStale = false;
  delayLogout = false;
  completeLogout = undefined;
  savedCount = null;
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
  expect(screen.getByRole('heading', { name: 'Chọn món' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Tiếp tục lập đơn' }));
  return user;
}
async function checkSale(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Kiểm tra đơn', exact: true }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Xác nhận đơn', exact: true }),
  );
  await screen.findByRole('button', { name: 'Tiền mặt', exact: true });
}
function restorePendingQr(
  mode: 'demo' | 'live',
  legacyDemoPayload = false,
  localImage = false,
) {
  const payment = {
    ma_giao_dich: mode === 'demo' ? 'old-demo-qr' : 'old-live-qr',
    ma_don: '55555555-5555-4555-8555-555555555555',
    phuong_thuc: 'Chuyển khoản qua QR',
    trang_thai: 'Chờ xác nhận',
    so_tien_thanh_toan: 25000,
    ma_tham_chieu_qr: mode === 'demo' ? 'DEMO-OLD-REF' : 'OLD-REF',
    qr_mo_phong: mode === 'demo',
    ...(mode === 'demo' && legacyDemoPayload
      ? { qrContent: 'DEMO|OLD|25000|old-demo-qr' }
      : mode === 'demo'
      ? {
          qrImageUrl:
            localImage
              ? 'data:image/png;base64,bG9jYWwtdmlldHFy'
              : 'https://img.vietqr.io/image/970422-0333101167-compact2.png?amount=25000&addInfo=DEMO-OLD-REF',
        }
      : {
          qrImageUrl:
            localImage
              ? 'data:image/png;base64,bG9jYWwtdmlldHFy'
              : 'https://img.vietqr.io/image/970422-0333101167-compact2.png?amount=25000&addInfo=OLD-REF',
        }),
  };
  order = {
    ma_don: payment.ma_don,
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
    payments: [payment],
  };
  sessionStorage.setItem(
    `me-cafe-checkout-state:${employee.ma_nguoi_dung}`,
    JSON.stringify({
      cart: [],
      orderId: order.ma_don,
      requestKey: crypto.randomUUID(),
      payment,
    }),
  );
  return payment;
}

describe('native application architecture', () => {
  it('keeps the order-history table headings and receipt empty icon when no orders exist', async () => {
    activeUser = manager;
    location.hash = '#/orders';
    render(<App />);

    await screen.findByText('Chưa có đơn hàng nào trong lịch sử đơn hàng');
    expect(screen.getByRole('columnheader', { name: 'STT' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Mã đơn' })).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: 'Trạng thái' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('columnheader', { name: 'Thao tác' }),
    ).toBeNull();
    const emptyIcon = document.querySelector(
      '.order-history-empty-icon svg',
    );
    expect(emptyIcon?.getAttribute('width')).toBe('24');
    expect(emptyIcon?.querySelector('path')?.getAttribute('d')).toContain(
      'M6 2.5H18V21',
    );
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
    await user.click(within(dialog).getByRole('button', { name: 'Vai trò' }));
    await user.click(within(dialog).getByRole('option', { name: 'Nhân viên' }));
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
      within(screen.getByRole('dialog', { name: 'Xác nhận tạo tài khoản' })).getByRole('button', {
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
      .getByRole('heading', { name: 'Đơn hàng', exact: true })
      .closest('section');
    expect(screen.getAllByText('25.000 đ')).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Tiếp tục lập hóa đơn' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Thêm món' }));
    await user.click(screen.getByRole('button', { name: 'Thêm Cà phê từ DB' }));
    await user.click(screen.getByRole('button', { name: 'Tiếp tục lập đơn' }));
    expect(location.hash).toBe('#/sales');
    expect(screen.getByRole('main')).toBe(main);
    expect(
      screen
        .getByRole('heading', { name: 'Đơn hàng', exact: true })
        .closest('section'),
    ).toBe(panel);
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Số lượng Cà phê từ DB',
        }) as HTMLInputElement
      ).value,
    ).toBe('2');
    expect(screen.getAllByText('50.000 đ').length).toBeGreaterThan(0);
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
    await screen.findByRole('heading', { name: 'Đơn hàng', exact: true });
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
      within(dialog).getByRole('button', { name: 'Xác nhận lại số tiền' }),
    );
    await within(dialog).findByText(
      'Số tiền nhận được nhỏ hơn tổng tiền đơn hàng.',
    );
    expect(
      within(dialog).getByText(
        'Hoàn trả toàn bộ số tiền đã nhận cho khách, sau đó chọn lại phương thức thanh toán.',
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: 'Chọn lại phương thức' }),
    ).toBeTruthy();
    expect(screen.getByRole('main')).toBe(main);
    await user.clear(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
    );
    await user.type(
      within(dialog).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '50000',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Xác nhận lại số tiền' }),
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
  it('renders a scannable QR locally when the payment adapter returns qrContent only', async () => {
    qrConfigured = true;
    qrPayloadOnly = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));

    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    const qrCode = dialog.querySelector('svg.sales-qr-image');
    expect(qrCode).toBeTruthy();
    expect(qrCode?.getAttribute('width')).toBe('160');
    expect(qrCode?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(qrCode?.querySelector('title')?.textContent).toBe('Mã QR thanh toán');
    expect(dialog.textContent).not.toContain('BANK-TRANSFER-PAYLOAD');
    expect(
      within(dialog).queryByRole('alert'),
    ).toBeNull();
  });
  it('continues displaying the QR image returned by an image-based adapter', async () => {
    qrConfigured = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));

    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    const qrImage = await within(dialog).findByRole('img', {
      name: 'QR thanh toán',
    });
    expect(qrImage.tagName).toBe('IMG');
    expect(qrImage.classList.contains('sales-qr-image')).toBe(true);
    expect(qrImage.getAttribute('src')).toBe(
      'data:image/png;base64,bG9jYWwtdmlldHFy',
    );
    expect(
      within(dialog).getByText('VietQR thật · chờ xác nhận từ SePay'),
    ).toBeTruthy();
    expect(dialog.querySelector('svg')).toBeNull();
  });
  it('hides an old VietQR until staff explicitly creates a simulated QR for the same order', async () => {
    qrMode = 'demo';
    qrDemo = true;
    const oldPayment = restorePendingQr('live');
    activeUser = employee;
    location.hash = '/sales';
    render(<App />);

    await screen.findByText(
      'Đơn này đang có mã VietQR từ lần thanh toán trước. Chế độ hiện tại là QR mô phỏng.',
    );
    expect(screen.queryByRole('img', { name: 'QR thanh toán' })).toBeNull();
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr')).toHaveLength(0);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Tạo QR mô phỏng cho đơn này' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    expect(within(dialog).queryByText('QR mô phỏng')).toBeNull();
    expect(
      within(dialog).getByText('Khách quét mã để thanh toán'),
    ).toBeTruthy();
    expect(within(dialog).getByText('25.000 đ')).toBeTruthy();
    const qrImage = await within(dialog).findByRole('img', {
      name: 'Mã QR mô phỏng',
    });
    expect(qrImage.classList.contains('sales-qr-image')).toBe(true);
    expect(qrImage.getAttribute('src')).toBe('data:image/png;base64,bG9jYWwtdmlldHFy');
    expect(dialog.textContent).not.toContain('DEMO|');
    expect(within(dialog).queryByText('Dữ liệu QR mô phỏng')).toBeNull();
    const newPayment = order.payments.find(
      (payment: any) => payment.qr_mo_phong,
    );
    expect(order.ma_don).toBe(oldPayment.ma_don);
    expect(order.tong_tien).toBe(25000);
    expect(newPayment.ma_giao_dich).not.toBe(oldPayment.ma_giao_dich);
    expect(oldPayment.trang_thai).toBe('Chờ xác nhận');

    cleanup();
    render(<App />);
    const restoredQrButton = await screen.findByRole('button', {
      name: 'QR',
      exact: true,
    });
    const restoredUser = userEvent.setup();
    await restoredUser.click(restoredQrButton);
    const restoredDialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    expect(within(restoredDialog).queryByText('QR mô phỏng')).toBeNull();
    expect(
      within(restoredDialog).getByText('Khách quét mã để thanh toán'),
    ).toBeTruthy();
    expect(
      within(restoredDialog).getByRole('img', { name: 'Mã QR mô phỏng' }),
    ).toBeTruthy();

    await restoredUser.click(
      within(restoredDialog).getByRole('button', {
        name: /Đối soát thành công/,
      }),
    );
    await waitFor(() => expect(order.da_thanh_toan).toBe(true));
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.path === `/payments/${newPayment.ma_giao_dich}/reconcile`,
      ),
    ).toBe(true);
  });
  it('replaces a cached legacy DEMO payload only after staff requests a new VietQR for that order', async () => {
    qrMode = 'demo';
    qrDemo = true;
    const oldPayment = restorePendingQr('demo', true);
    activeUser = employee;
    location.hash = '/sales';
    render(<App />);

    await screen.findByText(/Không thể khôi phục ảnh VietQR của giao dịch mô phỏng cũ/);
    expect(screen.queryByRole('img', { name: 'QR thanh toán' })).toBeNull();
    expect(document.querySelector('svg.sales-qr-image')).toBeNull();
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr')).toHaveLength(0);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Tạo QR mô phỏng cho đơn này' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    const image = await within(dialog).findByRole('img', { name: 'Mã QR mô phỏng' });
    expect(within(dialog).getByText('Khách quét mã để thanh toán')).toBeTruthy();
    expect(image.getAttribute('src')).toBe('data:image/png;base64,bG9jYWwtdmlldHFy');
    expect(within(dialog).getByText('25.000 đ')).toBeTruthy();
    expect(dialog.textContent).not.toContain('DEMO|');
    const newPayment = order.payments.find(
      (payment: any) => payment.ma_giao_dich !== oldPayment.ma_giao_dich,
    );
    expect(newPayment.ma_don).toBe(oldPayment.ma_don);
    expect(newPayment.ma_giao_dich).not.toBe(oldPayment.ma_giao_dich);
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr')).toHaveLength(1);
  });
  it('hides an old simulated QR after switching to live and reconciles only the new live payment', async () => {
    qrMode = 'live';
    qrConfigured = true;
    const oldPayment = restorePendingQr('demo');
    activeUser = employee;
    location.hash = '/sales';
    render(<App />);

    await screen.findByText(
      'Đơn này đang có mã QR mô phỏng từ lần thanh toán trước. Chế độ hiện tại là VietQR thật.',
    );
    expect(screen.queryByRole('img', { name: 'QR thanh toán' })).toBeNull();
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr')).toHaveLength(0);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Tạo QR VietQR cho đơn này' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    const image = await within(dialog).findByRole('img', {
      name: 'QR thanh toán',
    });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,bG9jYWwtdmlldHFy');
    expect(
      within(dialog).getByText('VietQR thật · chờ xác nhận từ SePay'),
    ).toBeTruthy();
    expect(
      within(dialog).queryByText('Khách quét mã để thanh toán'),
    ).toBeNull();
    const newPayment = order.payments.find(
      (payment: any) => payment.ma_giao_dich !== oldPayment.ma_giao_dich,
    );
    expect(newPayment.ma_giao_dich).not.toBe(oldPayment.ma_giao_dich);
    expect(order.ma_don).toBe(oldPayment.ma_don);

    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );
    await screen.findByText(
      'Đối soát chưa thành công: giao dịch chưa được xác nhận hoặc chưa đủ số tiền.',
    );
    expect(order.da_thanh_toan).toBe(false);
    expect(oldPayment.trang_thai).toBe('Chờ xác nhận');
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' &&
          call.path === `/payments/${newPayment.ma_giao_dich}/reconcile`,
      ),
    ).toBe(true);
  });
  it('reuses the saved QR in the same mode after restoring an order', async () => {
    qrMode = 'live';
    const savedPayment = restorePendingQr('live');
    activeUser = employee;
    location.hash = '/sales';
    render(<App />);
    const qrButton = await screen.findByRole('button', {
      name: 'QR',
      exact: true,
    });
    await waitFor(() => expect((qrButton as HTMLButtonElement).disabled).toBe(false));

    const user = userEvent.setup();
    await user.click(qrButton);
    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    const image = await within(dialog).findByRole('img', {
      name: 'QR thanh toán',
    });
    expect(image.getAttribute('src')).toContain('addInfo=OLD-REF');
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr')).toHaveLength(0);
    expect(order.payments[0].ma_giao_dich).toBe(savedPayment.ma_giao_dich);
  });
  it('keeps cash available when QR is disabled and leaves a pending QR untouched', async () => {
    qrMode = 'disabled';
    const savedPayment = restorePendingQr('live');
    activeUser = employee;
    location.hash = '/sales';
    render(<App />);

    await screen.findByText(
      'QR đang tắt trong cấu hình hiện tại. Mã QR cũ không được hiển thị.',
    );
    expect(screen.queryByRole('img', { name: 'QR thanh toán' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Tạo QR VietQR cho đơn này' }),
    ).toBeNull();
    expect(savedPayment.trang_thai).toBe('Chờ xác nhận');
    expect(
      calls.filter((call) => call.method === 'POST' && call.path === '/payments/qr'),
    ).toHaveLength(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chọn tiền mặt' }));
    expect(
      await screen.findByRole('dialog', { name: 'Thanh toán tiền mặt' }),
    ).toBeTruthy();
  });
  it('keeps an order pending and shows one error when creating a replacement QR fails', async () => {
    qrMode = 'demo';
    qrDemo = true;
    const oldPayment = restorePendingQr('live');
    activeUser = employee;
    location.hash = '/sales';
    errors.set('POST /payments/qr', {
      status: 503,
      message: 'Chưa cấu hình cổng thanh toán QR.',
      code: 'PAYMENT_NOT_CONFIGURED',
    });
    render(<App />);

    await screen.findByText(
      'Đơn này đang có mã VietQR từ lần thanh toán trước. Chế độ hiện tại là QR mô phỏng.',
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Tạo QR mô phỏng cho đơn này' }),
    );
    const error = 'Chưa cấu hình cổng thanh toán QR.';
    await screen.findByText(error);
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(order.da_thanh_toan).toBe(false);
    expect(oldPayment.trang_thai).toBe('Chờ xác nhận');
  });
  it('shows the VietQR demo caption and marks paid after reconciliation', async () => {
    qrMode = 'demo';
    qrDemo = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    expect(within(dialog).queryByText('QR mô phỏng')).toBeNull();
    expect(
      within(dialog).getByText('Khách quét mã để thanh toán'),
    ).toBeTruthy();
    expect(within(dialog).getByText('25.000 đ')).toBeTruthy();
    const qrImage = await within(dialog).findByRole('img', {
      name: 'Mã QR mô phỏng',
    });
    expect(qrImage.getAttribute('src')).toBe('data:image/png;base64,bG9jYWwtdmlldHFy');
    expect(dialog.textContent).not.toContain('DEMO|');
    expect(dialog.textContent).not.toContain('0333101167');
    expect(within(dialog).queryByText('Dữ liệu QR mô phỏng')).toBeNull();
    expect(order.da_thanh_toan).toBe(false);

    errors.set(`GET /orders/${order.ma_don}`, {
      status: 503,
      message: 'Tạm thời không thể tải chi tiết đơn.',
      code: 'TEST_UNAVAILABLE',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );
    await waitFor(() => expect(order.da_thanh_toan).toBe(true));
    await screen.findByText(/Thanh toán QR đã được xác nhận/);
    expect(
      screen.queryByText(
        'Đối soát chưa thành công: giao dịch chưa được xác nhận hoặc chưa đủ số tiền.',
      ),
    ).toBeNull();
    expect(
      screen.queryByText('Cổng thanh toán chưa trả ảnh hoặc nội dung QR.'),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Thử đồng bộ lại đơn' }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/Thanh toán QR đã được xác nhận/)).toBeNull(),
    );
    await screen.findByRole('button', { name: 'Xuất hóa đơn' });

    expect(
      calls.filter(
        (call) =>
          call.method === 'POST' && call.path.endsWith('/reconcile'),
      ),
    ).toHaveLength(1);
  });
  it('keeps confirmed payment when order sync returns stale data and retries the sync', async () => {
    qrMode = 'demo';
    qrDemo = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    qrOrderGetStale = true;
    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );

    await screen.findByText(/Thanh toán QR đã được xác nhận/);
    await screen.findByRole('button', { name: 'Xuất hóa đơn' });
    expect(order.da_thanh_toan).toBe(true);

    qrOrderGetStale = false;
    await user.click(
      screen.getByRole('button', { name: 'Thử đồng bộ lại đơn' }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/Thanh toán QR đã được xác nhận/)).toBeNull(),
    );
    expect(order.payments[0].trang_thai).toBe('Thành công');
  });
  it('checks the order after a lost reconcile response before reporting an outcome', async () => {
    qrMode = 'demo';
    qrDemo = true;
    qrReconcileNetworkFails = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );

    await screen.findByRole('button', { name: 'Xuất hóa đơn' });
    expect(order.da_thanh_toan).toBe(true);
    expect(screen.queryByText(/Không nhận được phản hồi đối soát/)).toBeNull();
    const reconcileIndex = calls.findIndex((call) => call.path.endsWith('/reconcile'));
    expect(
      calls.slice(reconcileIndex + 1).some(
        (call) =>
          call.method === 'GET' && call.path === `/orders/${order.ma_don}`,
      ),
    ).toBe(true);
  });
  it('does not mark paid when reconcile returns a different transaction', async () => {
    qrMode = 'demo';
    qrDemo = true;
    qrReconcileResponseOverride = {
      ma_giao_dich: 'different-transaction',
    };
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );

    const error =
      'Phản hồi đối soát không khớp giao dịch QR của đơn hiện tại.';
    await screen.findByText(error);
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(order.da_thanh_toan).toBe(false);
    expect(order.payments[0].trang_thai).toBe('Chờ xác nhận');
  });
  it('shows a real QR reconciliation error once and leaves the order unpaid', async () => {
    qrConfigured = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    await user.click(
      within(dialog).getByRole('button', { name: /Đối soát thành công/ }),
    );

    const error =
      'Đối soát chưa thành công: giao dịch chưa được xác nhận hoặc chưa đủ số tiền.';
    await screen.findByText(error);
    expect(screen.getAllByText(error)).toHaveLength(1);
    expect(order.da_thanh_toan).toBe(false);
    expect(order.payments[0].trang_thai).toBe('Chờ xác nhận');
  });
  it('keeps the order pending when staff mark QR reconciliation as unsuccessful', async () => {
    qrConfigured = true;
    const user = await startSale();
    await checkSale(user);
    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));
    const dialog = await screen.findByRole('dialog', { name: 'Thanh toán QR' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Đóng' }),
    );

    expect(screen.queryByRole('dialog', { name: 'Thanh toán QR' })).toBeNull();
    expect(order.da_thanh_toan).toBe(false);
    expect(order.payments[0].trang_thai).toBe('Chờ xác nhận');
    expect(calls.filter((call) => call.path.endsWith('/reconcile'))).toHaveLength(0);
  });
  it.each([
    { user: manager, route: '/menu', fallback: 'reports' },
    { user: manager, route: '/notifications', fallback: 'reports' },
    { user: employee, route: '/menu', fallback: 'sales' },
    { user: employee, route: '/notifications', fallback: 'sales' },
  ])(
    'redirects removed route $route to the $fallback page for $user.vai_tro',
    async ({ user: role, route, fallback }) => {
      activeUser = role;
      location.hash = route;
      render(<App />);

      await screen.findByRole('heading', {
        name: fallback === 'reports' ? 'Tổng quan' : 'Chọn món',
        exact: true,
      });
      await waitFor(() => expect(location.hash).toBe('#/' + fallback));
      expect(
        screen.queryByRole('link', { name: 'Thực đơn và định mức' }),
      ).toBeNull();
      expect(screen.queryByRole('link', { name: 'Thông báo' })).toBeNull();

      if (role.vai_tro === 'Nhân viên') {
        expect(
          calls.some((call) => call.path === '/menu' && call.method === 'GET'),
        ).toBe(true);
        const user = userEvent.setup();
        await user.click(
          screen.getByRole('link', { name: 'Quản lý đơn hàng', exact: true }),
        );
        await screen.findByRole('heading', {
          name: 'Theo dõi trạng thái đơn hàng',
          exact: true,
        });
      } else {
        const user = userEvent.setup();
        await user.click(
          screen.getByRole('link', { name: 'Quản lý tài khoản', exact: true }),
        );
        await screen.findByRole('table');
      }
    },
  );
  it('assigns employees without replacing the weekly calendar', async () => {
    location.hash = '/shifts';
    shifts[1].so_nhan_vien_toi_thieu = 2;
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
    const updatedCard = document
      .querySelector('.shift-card-main[aria-label*="07:00"]')
      ?.closest('.shift-card');
    await waitFor(() =>
      expect(
        updatedCard?.querySelector('.shift-count-pill')?.textContent?.trim(),
      ).toBe('1 / 3 nhân viên'),
    );
    expect(updatedCard?.getAttribute('data-short')).toBe('true');
    await screen.findByText('Phân công ca làm thành công.');
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-shift-assignment-success',
    );
  });
  it('shows only cancel when there are no candidates or assignments', async () => {
    candidates = [];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await within(dialog).findByText(
      'Không có nhân viên phù hợp với ca làm này',
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Lưu', exact: true }),
    ).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeTruthy();
    expect(
      calls.filter(
        (call) =>
          call.method === 'PUT' && call.path.endsWith('/assignments'),
      ),
    ).toHaveLength(0);
  });
  it('shows a compact validation message when no employee is selected', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Lưu',
        exact: true,
      }),
    );
    const validation = await within(dialog).findByText(
      'Vui lòng chọn nhân viên cần phân công',
    );
    expect(validation.className).toBe('assignment-validation-error');
    expect(
      calls.filter(
        (call) =>
          call.method === 'PUT' && call.path.endsWith('/assignments'),
      ),
    ).toHaveLength(0);
  });
  it('does not send PUT when saving an existing assignment without changes', async () => {
    shifts[1].nhan_vien = [
      {
        ma_nhan_vien: employee.ma_nguoi_dung,
        ho_ten: employee.ho_ten,
      },
    ];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    const save = await within(dialog).findByRole('button', {
      name: 'Lưu',
      exact: true,
    });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.click(save);
    expect(
      calls.filter(
        (call) =>
          call.method === 'PUT' && call.path.endsWith('/assignments'),
      ),
    ).toHaveLength(0);
  });
  it('can replace an assigned employee missing from candidates when a replacement exists', async () => {
    const inactiveId = '77777777-7777-4777-8777-777777777777';
    shifts[1].nhan_vien = [
      { ma_nhan_vien: inactiveId, ho_ten: 'Tài khoản đã khóa' },
    ];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    const inactive = await within(dialog).findByRole('checkbox', {
      name: 'Tài khoản đã khóa',
    });
    expect((inactive as HTMLInputElement).checked).toBe(true);
    await within(dialog).findByText(
      'Không còn trong danh sách ứng viên',
    );
    await user.click(inactive);
    await user.click(
      within(dialog).getByRole('checkbox', { name: employee.ho_ten }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.find(
        (call) =>
          call.method === 'PUT' && call.path.endsWith('/assignments'),
      )?.body.ma_nhan_vien,
    ).toEqual([employee.ma_nguoi_dung]);
  });
  it('shows only cancel for an assigned employee when candidates are empty', async () => {
    shifts[1].nhan_vien = [
      {
        ma_nhan_vien: '77777777-7777-4777-8777-777777777777',
        ho_ten: 'Tài khoản đã khóa',
      },
    ];
    candidates = [];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await within(dialog).findByText('Không còn trong danh sách ứng viên');
    const assigned = await within(dialog).findByRole('checkbox', {
      name: 'Tài khoản đã khóa',
    });
    expect((assigned as HTMLInputElement).checked).toBe(true);
    expect((assigned as HTMLInputElement).disabled).toBe(true);
    expect(
      within(dialog).queryByRole('button', { name: 'Lưu', exact: true }),
    ).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeTruthy();
    expect(
      calls.filter(
        (call) =>
          call.method === 'PUT' && call.path.endsWith('/assignments'),
      ),
    ).toHaveLength(0);
  });
  it('shows candidate loading errors without presenting an empty result', async () => {
    errors.set(`GET /shifts/${shifts[1].ma_ca}/candidates`, {
      status: 500,
      message: 'Không thể tải danh sách nhân viên.',
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await within(dialog).findByText('Không thể tải danh sách nhân viên.');
    expect(
      within(dialog).queryByText(
        'Không có nhân viên phù hợp với ca làm này',
      ),
    ).toBeNull();
    expect(
      (within(dialog).getByRole('button', {
        name: 'Lưu',
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('rejects assignments above the maximum without sending a request', async () => {
    candidates = [
      ...candidates,
      {
        ma_nguoi_dung: '77777777-7777-4777-8777-777777777777',
        ho_ten: 'Nhân viên thứ hai',
        loai_dang_ky: 'Rảnh',
      },
    ];
    shifts[1].so_nhan_vien_toi_da = 1;
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    await user.click(
      await within(dialog).findByRole('checkbox', { name: employee.ho_ten }),
    );
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Nhân viên thứ hai' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số nhân viên được phân công không được vượt quá số lượng tối đa của ca',
    );
    expect(calls.some((call) => call.path.endsWith('/assignments'))).toBe(
      false,
    );
    expect(
      (within(dialog).getByRole('checkbox', {
        name: employee.ho_ten,
      }) as HTMLInputElement).checked,
    ).toBe(true);
  });
  it('keeps selected candidates and displays assignment API errors in the dialog', async () => {
    const shiftId = shifts[1].ma_ca;
    errors.set(`PUT /shifts/${shiftId}/assignments`, {
      status: 422,
      message: 'Nhân viên bị trùng lịch.',
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: new RegExp('07:00') }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Phân công nhân viên cho ca làm',
    });
    const candidate = await within(dialog).findByRole('checkbox', {
      name: employee.ho_ten,
    });
    await user.click(candidate);
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText('Nhân viên bị trùng lịch.');
    expect((candidate as HTMLInputElement).checked).toBe(true);
    expect(
      calls.find((call) => call.path.endsWith('/assignments'))?.body
        .ma_nhan_vien,
    ).toEqual([employee.ma_nguoi_dung]);
  });
  it('only shows an empty manager week after a successful empty calendar load', async () => {
    location.hash = '/shifts';
    shifts = [];
    render(<App />);
    expect(
      await screen.findByText('Chưa có ca làm trong tuần này'),
    ).toBeTruthy();

    cleanup();
    errors.set('GET /shifts', {
      status: 500,
      message: 'Không thể tải lịch.',
    });
    location.hash = '/shifts';
    render(<App />);
    await waitFor(() => expect(screen.getByText('Không thể tải lịch.')).toBeTruthy());
    expect(
      screen.queryByText('Chưa có ca làm trong tuần này'),
    ).toBeNull();
  });
  it('registers employee availability in a dialog without changing the schedule route', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Đăng ký lịch làm việc',
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
  it('cancels logout without calling the API and keeps the current page', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Đăng xuất' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Hủy', exact: true }),
    );
    expect(screen.queryByRole('dialog', { name: 'Đăng xuất' })).toBeNull();
    expect(calls.filter((call) => call.path === '/auth/logout')).toHaveLength(0);
    expect(location.hash).toBe('#/reports');

    await user.click(screen.getByRole('button', { name: 'Đăng xuất', exact: true }));
    fireEvent.click(screen.getByRole('dialog', { name: 'Đăng xuất' }));
    expect(screen.queryByRole('dialog', { name: 'Đăng xuất' })).toBeNull();
    expect(calls.filter((call) => call.path === '/auth/logout')).toHaveLength(0);
  });
  it('shows the role-specific confirmation for an employee without leaving the page', async () => {
    activeUser = employee;
    location.hash = '/schedule';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    expect(
      screen.getByText('Bạn có chắc chắn muốn đăng xuất không?'),
    ).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Đăng xuất' })).toBeTruthy();
    expect(location.hash).toBe('#/schedule');
    expect(calls.filter((call) => call.path === '/auth/logout')).toHaveLength(0);
  });
  it('locks confirmation while logout is pending and sends only one request', async () => {
    delayLogout = true;
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await waitFor(() => expect(completeLogout).toBeDefined());
    const confirmButton = screen.getByRole('button', {
      name: 'Xác nhận',
      exact: true,
    });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      calls.filter((call) => call.path === '/auth/logout' && call.method === 'POST'),
    ).toHaveLength(1);
    completeLogout!();
    await screen.findByRole('textbox', { name: 'Tên tài khoản' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });
  it('keeps the session on failure, shows a red notice and allows retry', async () => {
    errors.set('POST /auth/logout', {
      status: 500,
      message: 'Tạm thời không thể đăng xuất.',
    });
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Xác nhận', exact: true }));
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain(
      'Đăng xuất chưa thành công. Vui lòng thử lại',
    );
    expect(notice.className).toContain('ui-notice-error');
    expect(screen.queryByRole('dialog', { name: 'Đăng xuất' })).toBeNull();
    expect(screen.getByRole('complementary')).toBeTruthy();
    expect(activeUser).toBe(manager);

    await user.click(screen.getByRole('button', { name: 'Đăng xuất', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận', exact: true }));
    await screen.findByRole('textbox', { name: 'Tên tài khoản' });
    expect(
      calls.filter((call) => call.path === '/auth/logout' && call.method === 'POST'),
    ).toHaveLength(2);
  });
  it('shows the success notice after returning to login', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(screen.getByRole('button', { name: 'Xác nhận', exact: true }));
    await screen.findByRole('textbox', { name: 'Tên tài khoản' });
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Đăng xuất thành công!');
    expect(notice.className).toContain('ui-notice-logout-success');
    expect(
      calls.filter((call) => call.path === '/auth/logout' && call.method === 'POST'),
    ).toHaveLength(1);
  });
  it('keeps each manager staffing count in its API-backed shift card', async () => {
    const longStaff = [
      {
        ma_nhan_vien: 'aaaa1111-1111-4111-8111-111111111111',
        ho_ten: 'Nguyễn Thị Hoàng Minh Phương Thảo',
      },
      {
        ma_nhan_vien: 'bbbb1111-1111-4111-8111-111111111111',
        ho_ten: 'Trần Ngọc Bảo Châu Nguyễn Hoàng Anh',
      },
    ];
    const shift = (
      ma_ca: string,
      gio_bat_dau: string,
      gio_ket_thuc: string,
      nhan_vien: typeof longStaff,
    ) => ({
      ma_ca,
      ngay_lam: today(),
      gio_bat_dau,
      gio_ket_thuc,
      so_nhan_vien_toi_thieu: 2,
      so_nhan_vien_toi_da: 4,
      nhan_vien,
      thieu_nhan_vien: nhan_vien.length < 3,
    });
    shifts = [
      shift('aaaaaaaa-1111-4111-8111-111111111111', '07:00:00', '12:00:00', longStaff),
      shift('bbbbbbbb-1111-4111-8111-111111111111', '12:00:00', '17:00:00', longStaff.slice(0, 1)),
      shift('cccccccc-1111-4111-8111-111111111111', '17:00:00', '22:00:00', []),
    ];
    location.hash = '/shifts';
    const { container } = render(<App />);
    await screen.findByText('17:00–22:00');
    const cards = container.querySelectorAll('.calendar-day .shift-card');
    expect(cards).toHaveLength(3);

    const firstCount = cards[0].querySelector(
      '.shift-card-meta .shift-count-pill',
    );
    expect(firstCount?.textContent?.trim()).toBe('2 / 4 nhân viên');
    expect(
      cards[0].querySelector('.shift-names')?.textContent,
    ).toContain('Nguyễn Thị Hoàng Minh Phương Thảo');

    const lastCard = cards[2];
    const lastCount = lastCard.querySelector(
      '.shift-card-meta .shift-count-pill',
    );
    expect(lastCard.textContent).toContain('17:00–22:00');
    expect(lastCard.querySelector('.shift-names')?.textContent).toBe(
      'Chưa phân công',
    );
    expect(lastCount?.textContent?.trim()).toBe('0 / 4 nhân viên');
    expect(lastCount?.closest('.shift-card')).toBe(lastCard);
    expect(lastCount?.closest('.shift-card-main')).toBeNull();
  });
  it('lists manager requests from the API and shows the empty state after an empty response', async () => {
    shiftRequests = [
      makeShiftRequest('Đổi ca hai chiều'),
      makeShiftRequest(
        'Nhờ nhân viên khác làm thay',
        '99999999-9999-4999-8999-999999999992',
      ),
    ];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ An Nguyễn',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Chi tiết yêu cầu Nhờ nhân viên khác làm thay từ An Nguyễn',
      }),
    ).toBeTruthy();

    shiftRequests = [];
    location.hash = '/shifts';
    cleanup();
    render(<App />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    expect(
      await screen.findByText('Không có yêu cầu chờ xử lý.'),
    ).toBeTruthy();
  });
  it.each([
    ['Đổi ca hai chiều', 'Ca làm của nhân viên được đề nghị đổi ca'],
    ['Nhờ nhân viên khác làm thay', 'Nhờ nhân viên làm thay'],
  ])('shows API details for %s requests', async (type, sectionTitle) => {
    shiftRequests = [makeShiftRequest(type)];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: `Chi tiết yêu cầu ${type} từ An Nguyễn`,
      }),
    );
    expect(screen.getByRole('heading', { name: sectionTitle })).toBeTruthy();
    expect(screen.getAllByText('An Nguyễn').length).toBeGreaterThan(0);
    expect(screen.getByText('Bình Trần')).toBeTruthy();
    expect(screen.getByText('Lịch cá nhân thay đổi.')).toBeTruthy();
    expect(
      screen.getByText(displayDate(shiftRequests[0].ca_hien_tai.ngay_lam)),
    ).toBeTruthy();
    if (type === 'Đổi ca hai chiều') {
      expect(
        screen.getByText(displayDate(addDays(today(), 1))),
      ).toBeTruthy();
    }
  });
  it('does not send a manager decision when confirmation or the dialog is closed', async () => {
    shiftRequests = [makeShiftRequest('Nhờ nhân viên khác làm thay')];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Chi tiết yêu cầu Nhờ nhân viên khác làm thay từ An Nguyễn',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    const confirmation = await screen.findByRole('dialog', {
      name: 'Từ chối yêu cầu',
    });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Hủy' }),
    );
    expect(
      calls.filter((call) => call.path.endsWith('/decide')),
    ).toHaveLength(0);
    await user.click(
      screen.getByRole('button', { name: 'Đóng', exact: true }),
    );
    expect(
      screen.queryByRole('dialog', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    ).toBeNull();
    expect(
      calls.filter((call) => call.path.endsWith('/decide')),
    ).toHaveLength(0);
  });
  it.each([
    [true, 'Đồng ý', 'Đã chấp thuận', 'Đã chấp thuận yêu cầu.'],
    [false, 'Từ chối', 'Bị từ chối', 'Đã từ chối yêu cầu.'],
  ])(
    'sends a manager decision only after confirmation and shows its result',
    async (accept, action, status, notice) => {
      const request = makeShiftRequest('Đổi ca hai chiều');
      shiftRequests = [request];
      location.hash = '/shifts';
      render(<App />);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', {
          name: 'Xử lý yêu cầu đổi hoặc xoay ca',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Chi tiết yêu cầu Đổi ca hai chiều từ An Nguyễn',
        }),
      );
      await user.click(screen.getByRole('button', { name: action as string }));
      const confirmation = await screen.findByRole('dialog', {
        name: action === 'Đồng ý' ? 'Đồng ý yêu cầu' : 'Từ chối yêu cầu',
      });
      expect(
        calls.filter((call) => call.path.endsWith('/decide')),
      ).toHaveLength(0);
      await user.click(
        within(confirmation).getByRole('button', { name: 'Xác nhận' }),
      );
      expect(await screen.findByText(status as string)).toBeTruthy();
      expect(await screen.findByText(notice as string)).toBeTruthy();
      const requestDialog = screen.getByRole('dialog', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      });
      expect(
        requestDialog.querySelector(`.ui-badge[data-value="${status}"]`),
      ).not.toBeNull();
      const expectedColors =
        status === 'Đã chấp thuận'
          ? { background: '#e2ebdb', color: '#46643e' }
          : { background: '#f6ded3', color: '#984a36' };
      const escapedStatus = status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scopedRule = new RegExp(
        `\\.manager-requests-dialog\\s+\\.ui-badge\\[data-value=['"]${escapedStatus}['"]\\]\\s*\\{([^}]+)\\}`,
      ).exec(applicationCss);
      expect(scopedRule).not.toBeNull();
      expect(scopedRule?.[1]).toMatch(
        new RegExp(`background:\\s*${expectedColors.background}`),
      );
      expect(scopedRule?.[1]).toMatch(
        new RegExp(`color:\\s*${expectedColors.color}`),
      );
      const waitingRule = new RegExp(
        `\\.ui-badge\\[data-value=['"]Chờ xử lý['"]\\][\\s\\S]*?\\{([^}]+)\\}`,
      ).exec(applicationCss);
      expect(waitingRule?.[1]).toMatch(/background:\s*#f3e3c8/);
      expect(waitingRule?.[1]).toMatch(/color:\s*#875c25/);
      const decisionCall = calls.find(
        (call) =>
          call.path === `/shifts/requests/${request.ma_yeu_cau}/decide` &&
          call.method === 'POST',
      );
      expect(decisionCall?.body).toEqual({ dong_y: accept });
      expect(
        calls.filter(
          (call) => call.path === '/shifts/requests' && call.method === 'GET',
        ).length,
      ).toBeGreaterThan(1);
      expect(
        calls.filter(
          (call) => call.path === '/shifts' && call.method === 'GET',
        ).length,
      ).toBeGreaterThan(1);
    },
  );
  it('keeps manager request details open and shows API errors after a failed decision', async () => {
    const request = makeShiftRequest('Nhờ nhân viên khác làm thay');
    shiftRequests = [request];
    errors.set(`POST /shifts/requests/${request.ma_yeu_cau}/decide`, {
      status: 500,
      message: 'Không thể xử lý yêu cầu lúc này.',
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Chi tiết yêu cầu Nhờ nhân viên khác làm thay từ An Nguyễn',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Đồng ý' }));
    const confirmation = await screen.findByRole('dialog', {
      name: 'Đồng ý yêu cầu',
    });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );
    expect(
      await screen.findByText('Không thể xử lý yêu cầu lúc này.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('dialog', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Ca làm cần thay đổi' }),
    ).toBeTruthy();
    expect(screen.getByText('Chờ xử lý')).toBeTruthy();
    expect(
      calls.filter(
        (call) =>
          call.path === `/shifts/requests/${request.ma_yeu_cau}/decide` &&
          call.method === 'POST',
      ),
    ).toHaveLength(1);
  });
  it('keeps employee request responses on the respond endpoint', async () => {
    activeUser = employee;
    shiftRequests = [
      {
        ...makeShiftRequest('Đổi ca hai chiều'),
        nguoi_gui: '33333333-3333-4333-8333-333333333333',
        trang_thai: 'Chờ đồng nghiệp',
        ma_nhan_vien_duoc_de_nghi: employee.ma_nguoi_dung,
      },
    ];
    location.hash = '/schedule';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Yêu cầu đổi hoặc xoay ca',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ An Nguyễn',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Đồng ý' }));
    const confirmation = await screen.findByRole('dialog', {
      name: 'Đồng ý yêu cầu',
    });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path ===
              `/shifts/requests/${shiftRequests[0].ma_yeu_cau}/respond` &&
            call.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(calls.some((call) => call.path.endsWith('/decide'))).toBe(false);
  });
  it('creates recurring shifts inside the calendar without changing routes', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    await user.click(
      within(dialog).getByRole('radio', { name: 'Ca lặp lại hằng tuần' }),
    );
    await user.clear(within(dialog).getByLabelText('Ngày làm'));
    await user.type(
      within(dialog).getByLabelText('Ngày làm'),
      displayDate(addDays(today(), 2)),
    );
    await user.click(
      within(dialog).getByRole('radio', { name: 'Theo số tuần' }),
    );
    await user.clear(within(dialog).getByLabelText('Số tuần lặp'));
    await user.type(within(dialog).getByLabelText('Số tuần lặp'), '2');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findByRole('status')).className).toContain(
      'ui-notice-shift-create-success',
    );
    expect(
      calls.find((call) => call.path === '/shifts' && call.method === 'POST')
        ?.body.lap,
    ).toEqual({ so_tuan: 2 });
    expect(location.hash).toBe('#/shifts');
  });
  it('creates a one-time shift, refreshes the calendar, and can cancel the modal', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    const openCreate = async () =>
      user.click(
        await screen.findByRole('button', {
          name: '+ Tạo ca mới',
          exact: true,
        }),
      );
    await openCreate();
    let dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    expect(
      (
        within(dialog).getByRole('radio', {
          name: 'Ca diễn ra một lần',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(within(dialog).queryByLabelText('Ngày kết thúc')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Hủy' })).toBeNull();
    expect(
      (within(dialog).getByLabelText('Ngày làm') as HTMLInputElement).value,
    ).toBe(displayDate(today()));
    expect(
      (within(dialog).getByLabelText('Giờ bắt đầu') as HTMLInputElement)
        .value,
    ).toBe('07:00');
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.filter(
        (call) => call.path === '/shifts' && call.method === 'POST',
      ),
    ).toHaveLength(0);

    await openCreate();
    dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('Tạo ca làm thành công.');
    const post = calls.find(
      (call) => call.path === '/shifts' && call.method === 'POST',
    );
    expect(post?.body).not.toHaveProperty('lap');
    expect(post?.body.ngay_lam).toBe(today());
    expect(post?.body.gio_bat_dau).toBe('07:00');
    expect(
      calls.filter(
        (call) => call.path === '/shifts' && call.method === 'GET',
      ),
    ).toHaveLength(2);
    expect(location.hash).toBe('#/shifts');
  });
  it('creates a recurring shift that ends on the selected date', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    await user.click(
      within(dialog).getByRole('radio', { name: 'Ca lặp lại hằng tuần' }),
    );
    const endDate = within(dialog).getByLabelText('Ngày kết thúc');
    await user.clear(endDate);
    await user.type(endDate, displayDate(addDays(today(), 14)));
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      calls.find((call) => call.path === '/shifts' && call.method === 'POST')
        ?.body.lap,
    ).toEqual({ ngay_ket_thuc: addDays(today(), 14) });
  });
  it('edits a shift only after confirmation and preserves API date and time formats', async () => {
    shifts[1].nhan_vien = [
      {
        ma_nhan_vien: employee.ma_nguoi_dung,
        ho_ten: employee.ho_ten,
      },
    ];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    expect(
      (within(dialog).getByLabelText('Ngày làm') as HTMLInputElement).value,
    ).toBe(displayDate(addDays(today(), 1)));
    expect(
      (within(dialog).getByLabelText('Giờ bắt đầu') as HTMLInputElement).value,
    ).toBe('07:00');
    expect(within(dialog).getByText(employee.ho_ten)).toBeTruthy();

    await user.clear(within(dialog).getByLabelText('Giờ bắt đầu'));
    await user.type(within(dialog).getByLabelText('Giờ bắt đầu'), '08:15');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    const confirmation = screen.getByRole('dialog', {
      name: 'Xác nhận thay đổi',
    });
    expect(within(confirmation).getByText('Xác nhận thay đổi')).toBeTruthy();
    expect(
      within(confirmation).getByRole('button', { name: 'Hủy', exact: true }),
    ).toBeTruthy();
    expect(
      within(confirmation).getByRole('button', {
        name: 'Xác nhận',
        exact: true,
      }),
    ).toBeTruthy();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);

    await user.click(
      within(confirmation).getByRole('button', { name: 'Đóng' }),
    );
    expect(screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' })).toBeTruthy();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);

    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    const canceledConfirmation = screen.getByRole('dialog', {
      name: 'Xác nhận thay đổi',
    });
    await user.click(
      within(canceledConfirmation).getByRole('button', {
        name: 'Hủy',
        exact: true,
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Chỉnh sửa', exact: true }));
    const reopenedDialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    const reopenedStart = within(reopenedDialog).getByLabelText('Giờ bắt đầu');
    expect((reopenedStart as HTMLInputElement).value).toBe('07:00');
    await user.clear(reopenedStart);
    await user.type(reopenedStart, '08:15');
    await user.click(
      within(reopenedDialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    const finalConfirmation = screen.getByRole('dialog', {
      name: 'Xác nhận thay đổi',
    });
    await user.click(
      within(finalConfirmation).getByRole('button', {
        name: 'Xác nhận',
        exact: true,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('Chỉnh sửa ca làm thành công.');
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-shift-edit-success',
    );
    const patch = calls.find(
      (call) => call.path === `/shifts/${shifts[1].ma_ca}` && call.method === 'PATCH',
    );
    expect(patch?.body).toEqual({
      ngay_lam: addDays(today(), 1),
      gio_bat_dau: '08:15',
      gio_ket_thuc: '12:00',
      so_nhan_vien_toi_thieu: 1,
      so_nhan_vien_toi_da: 3,
    });
    expect(
      calls.filter(
        (call) => call.path === '/shifts' && call.method === 'GET',
      ),
    ).toHaveLength(2);
  });
  it('closes the edit modal with its close button or Escape without PATCH', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    const openEdit = async () =>
    user.click(
      await screen.findByRole('button', {
        name: 'Chỉnh sửa',
        exact: true,
      }),
    );

    await openEdit();
    let dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    expect(
    within(dialog).queryByRole('button', { name: 'Hủy', exact: true }),
    ).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);

    await openEdit();
    dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    const escapeCancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, escapeCancel);
    expect(escapeCancel.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });
  it('validates edit date, time, quantities, and assigned employee limits', async () => {
    shifts[1].nhan_vien = [
      { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
      {
        ma_nhan_vien: '77777777-7777-4777-8777-777777777777',
        ho_ten: 'Nhân viên thứ hai',
      },
    ];
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    const date = within(dialog).getByLabelText('Ngày làm');
    await user.clear(date);
    await user.type(date, '31/02/2026');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Ngày làm phải là ngày hợp lệ và không trước hôm nay.',
    );
    await user.clear(date);
    await user.type(date, displayDate(addDays(today(), 1)));

    const maximum = within(dialog).getByLabelText(
      'Số lượng nhân viên tối đa',
    );
    await user.clear(maximum);
    await user.type(maximum, '1');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số lượng tối đa không được nhỏ hơn số nhân viên đang được phân công.',
    );
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận thay đổi' }),
    ).toBeNull();

    await user.clear(maximum);
    await user.type(maximum, '0');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số lượng nhân viên phải là số nguyên từ 1 đến 100.',
    );

    await user.clear(maximum);
    await user.type(maximum, '3');
    const minimum = within(dialog).getByLabelText(
      'Số lượng nhân viên tối thiểu',
    );
    await user.clear(minimum);
    await user.type(minimum, '4');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.',
    );

    await user.clear(minimum);
    await user.type(minimum, '1');
    const start = within(dialog).getByLabelText('Giờ bắt đầu');
    const end = within(dialog).getByLabelText('Giờ kết thúc');
    await user.clear(start);
    await user.type(start, '22:00');
    await user.clear(end);
    await user.type(end, '06:00');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Ca làm phải bắt đầu và kết thúc trong cùng một ngày.',
    );
    await user.clear(start);
    await user.type(start, '07:00');
    await user.clear(end);
    await user.type(end, '12:00');
    await user.clear(date);
    await user.type(date, displayDate(today()));
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.',
    );
    expect(
      screen.queryByRole('dialog', { name: 'Xác nhận thay đổi' }),
    ).toBeNull();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
  });
  it('keeps entered edit values and shows overlap and started errors from the API', async () => {
    const shiftId = shifts[1].ma_ca;
    shifts[1].nhan_vien = [
      { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
    ];
    errors.set(`PATCH /shifts/${shiftId}`, {
      status: 409,
      code: 'SHIFT_OVERLAP',
      message: 'Thời gian ca bị trùng với lịch làm việc của nhân viên.',
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa ca làm' });
    const start = within(dialog).getByLabelText('Giờ bắt đầu');
    await user.clear(start);
    await user.type(start, '08:30');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    const confirmation = screen.getByRole('dialog', {
      name: 'Xác nhận thay đổi',
    });
    await user.click(
      within(confirmation).getByRole('button', {
        name: 'Xác nhận',
        exact: true,
      }),
    );
    await within(dialog).findByText(
      'Thời gian ca bị trùng với lịch làm việc của nhân viên.',
    );
    expect((start as HTMLInputElement).value).toBe('08:30');
    expect(within(dialog).queryByText(employee.ho_ten)).toBeTruthy();
    expect(within(dialog).queryByText('Nhân viên bị trùng lịch')).toBeNull();

    errors.set(`PATCH /shifts/${shiftId}`, {
      status: 409,
      code: 'SHIFT_OVERLAP',
      message: 'Thời gian ca bị trùng với ca đã có.',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Xác nhận thay đổi' })).getByRole(
        'button',
        { name: 'Xác nhận', exact: true },
      ),
    );
    await within(dialog).findByText('Thời gian ca bị trùng với ca đã có.');
    expect((start as HTMLInputElement).value).toBe('08:30');

    cleanup();
    errors.set(`PATCH /shifts/${shiftId}`, {
      status: 409,
      code: 'INVALID_OPERATION',
      message: 'Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.',
    });
    location.hash = '/shifts';
    render(<App />);
    await user.click(
      await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }),
    );
    const startedDialog = screen.getByRole('dialog', {
      name: 'Chỉnh sửa ca làm',
    });
    await user.click(
      within(startedDialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await user.click(
      within(screen.getByRole('dialog', { name: 'Xác nhận thay đổi' })).getByRole(
        'button',
        { name: 'Xác nhận', exact: true },
      ),
    );
    await screen.findByText('Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.');
    expect(screen.queryByRole('dialog', { name: 'Chỉnh sửa ca làm' })).toBeNull();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(3);
  });
  it('shows create validation beside invalid date, quantities, and times', async () => {
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    const date = within(dialog).getByLabelText('Ngày làm');
    await user.clear(date);
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Ngày làm phải là ngày hợp lệ và không trước hôm nay.',
    );
    expect(date.getAttribute('aria-invalid')).toBe('true');

    await user.type(date, displayDate(addDays(today(), 1)));
    await user.click(
      within(dialog).getByRole('radio', { name: 'Ca lặp lại hằng tuần' }),
    );
    const endDate = within(dialog).getByLabelText('Ngày kết thúc');
    await user.clear(endDate);
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Ngày kết thúc phải hợp lệ và không trước ngày làm.',
    );
    await user.type(endDate, displayDate(addDays(today(), 2)));
    const minimum = within(dialog).getByLabelText(
      'Số lượng nhân viên tối thiểu',
    );
    const maximum = within(dialog).getByLabelText(
      'Số lượng nhân viên tối đa',
    );
    await user.clear(minimum);
    await user.type(minimum, '0');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số lượng nhân viên phải là số nguyên từ 1 đến 100.',
    );
    await user.clear(minimum);
    await user.type(minimum, '4');
    await user.clear(maximum);
    await user.type(maximum, '2');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.',
    );

    await user.clear(maximum);
    await user.type(maximum, '4');
    const start = within(dialog).getByLabelText('Giờ bắt đầu');
    const end = within(dialog).getByLabelText('Giờ kết thúc');
    await user.clear(start);
    await user.type(start, '23:00');
    await user.clear(end);
    await user.type(end, '22:00');
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText(
      'Ca làm phải bắt đầu và kết thúc trong cùng một ngày.',
    );
    expect(
      calls.filter(
        (call) => call.path === '/shifts' && call.method === 'POST',
      ),
    ).toHaveLength(0);
  });
  it('keeps entered values and shows conflicting days from the API', async () => {
    errors.set('POST /shifts', {
      status: 409,
      code: 'SHIFT_OVERLAP',
      message: 'Ca ngày 2026-11-16 bị trùng với ca đã có.',
      details: [
        { field: 'lap', message: 'Ca ngày 2026-11-23 cũng bị trùng.' },
      ],
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    await user.click(
      within(dialog).getByRole('radio', { name: 'Ca lặp lại hằng tuần' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText('16/11/2026 · 23/11/2026');
    expect(screen.getByRole('dialog', { name: 'Tạo ca làm' })).toBeTruthy();
    expect(
      (
        within(dialog).getByRole('radio', {
          name: 'Ca lặp lại hằng tuần',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (within(dialog).getByLabelText('Ngày làm') as HTMLInputElement).value,
    ).toBe(displayDate(today()));
    expect(
      (within(dialog).getByLabelText('Ngày kết thúc') as HTMLInputElement)
        .value,
    ).toBe(displayDate(addDays(today(), 28)));
    expect(screen.queryByText('Tạo ca làm thành công.')).toBeNull();
  });
  it('keeps one-time shift values and shows overlap dates from the API', async () => {
    errors.set('POST /shifts', {
      status: 409,
      code: 'SHIFT_OVERLAP',
      message: 'Ca ngày 2026-11-16 bị trùng với ca đã có.',
      details: [
        { field: 'ngay_lam', message: 'Ca ngày 2026-11-23 cũng bị trùng.' },
      ],
    });
    location.hash = '/shifts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '+ Tạo ca mới', exact: true }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Tạo ca làm' });
    const date = within(dialog).getByLabelText('Ngày làm');
    const start = within(dialog).getByLabelText('Giờ bắt đầu');
    await user.clear(date);
    await user.type(date, displayDate(addDays(today(), 1)));
    await user.clear(start);
    await user.type(start, '09:30');
    await user.clear(
      within(dialog).getByLabelText('Số lượng nhân viên tối thiểu'),
    );
    await user.type(
      within(dialog).getByLabelText('Số lượng nhân viên tối thiểu'),
      '2',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Lưu', exact: true }),
    );
    await within(dialog).findByText('16/11/2026 · 23/11/2026');

    expect(screen.getByRole('dialog', { name: 'Tạo ca làm' })).toBeTruthy();
    expect(
      (
        within(dialog).getByRole('radio', {
          name: 'Ca diễn ra một lần',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect((date as HTMLInputElement).value).toBe(
      displayDate(addDays(today(), 1)),
    );
    expect((start as HTMLInputElement).value).toBe('09:30');
    expect(within(dialog).queryByLabelText('Ngày kết thúc')).toBeNull();
    const post = calls.find(
      (call) => call.path === '/shifts' && call.method === 'POST',
    );
    expect(post?.body.ngay_lam).toBe(addDays(today(), 1));
    expect(post?.body.gio_bat_dau).toBe('09:30');
    expect(screen.queryByText('Tạo ca làm thành công.')).toBeNull();
  });
  it('confirms a closing report from its detail page and shows the real confirmer', async () => {
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
    await user.click(
      await screen.findByRole('button', {
        name: 'Xác nhận báo cáo',
        exact: true,
      }),
    );
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Xác nhận báo cáo' }),
      ).getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await screen.findByText('Đã xác nhận');
    expect(screen.getAllByText(manager.ho_ten)).toHaveLength(2);
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
    expect(
      screen.getByRole('heading', { name: 'Mê Cà Phê', exact: true }),
    ).toBeTruthy();
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
    expect(password).toHaveProperty('value', '');
    await user.type(password, 'actual-password');
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
    const dialog = screen.getByRole('dialog', { name: 'Chỉnh sửa thông tin tài khoản' });
    const accountStatus = within(dialog).getByRole('textbox', {
      name: 'Trạng thái tài khoản',
    });
    expect((accountStatus as HTMLInputElement).readOnly).toBe(true);
    expect(accountStatus.parentElement?.classList.contains('accounts-edit-status-field')).toBe(true);
    expect(applicationCss).toContain('.accounts-edit-status-field::after');
    expect(applicationCss).toContain("content: '⌄';");
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
      within(screen.getByRole('dialog', { name: 'Xác nhận thay đổi thông tin tài khoản' }))
        .getByRole('button', { name: 'Lưu', exact: true }),
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
  it('requires the edit confirmation button before updating an account', async () => {
    location.hash = '/accounts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }));
    const edit = screen.getByRole('dialog', { name: 'Chỉnh sửa thông tin tài khoản' });
    const name = within(edit).getByRole('textbox', { name: 'Họ và tên' });
    await user.clear(name);
    await user.type(name, 'Chờ xác nhận thay đổi');
    const submit = within(edit).getByRole('button', { name: 'Lưu', exact: true });
    await user.click(submit);
    await user.click(submit);
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    const confirmation = screen.getByRole('dialog', { name: 'Xác nhận thay đổi thông tin tài khoản' });
    await user.click(within(confirmation).getByRole('button', { name: 'Hủy' }));
    expect((name as HTMLInputElement).value).toBe('Chờ xác nhận thay đổi');
    await user.click(submit);
    await user.click(within(screen.getByRole('dialog', { name: 'Xác nhận thay đổi thông tin tài khoản' }))
      .getByRole('button', { name: 'Lưu', exact: true }));
    await screen.findByText('Chờ xác nhận thay đổi');
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
  });
  it('clears the edit failure notice after a successful retry', async () => {
    location.hash = '/accounts';
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Chỉnh sửa', exact: true }));
    const edit = screen.getByRole('dialog', { name: 'Chỉnh sửa thông tin tài khoản' });
    const name = within(edit).getByRole('textbox', { name: 'Họ và tên' });
    await user.clear(name);
    await user.type(name, 'Cập nhật sau lỗi');
    errors.set('PATCH /users/' + employee.ma_nguoi_dung, {status: 500, message: 'Máy chủ tạm thời không khả dụng.'});
    const save = async () => {
      await user.click(within(edit).getByRole('button', { name: 'Lưu', exact: true }));
      await user.click(within(screen.getByRole('dialog', { name: 'Xác nhận thay đổi thông tin tài khoản' }))
        .getByRole('button', { name: 'Lưu', exact: true }));
    };
    await save();
    await screen.findByText('Cập nhật thông tin tài khoản thất bại');
    expect((name as HTMLInputElement).value).toBe('Cập nhật sau lỗi');
    await save();
    await screen.findByText('Cập nhật thông tin tài khoản thành công');
    expect(screen.queryByText('Cập nhật thông tin tài khoản thất bại')).toBeNull();
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2);
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
      within(dialog).getByRole('button', { name: 'Xác nhận lại số tiền' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Xem trước hóa đơn' });
    await user.click(
      await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true }),
    );
    expect(screen.getByText('Đã xuất hóa đơn giấy')).toBeTruthy();
    expect(screen.getByText('Giấy in nhiệt 80 mm · 1 bản')).toBeTruthy();
    const exportedStatus = screen.getByText('Đã xuất');
    expect(exportedStatus.className).toBe('sales-invoice-exported-status');
    expect(exportedStatus.classList.contains('sales-status-badge')).toBe(false);
    const trackOrders = screen.getByRole('button', {
      name: 'Theo dõi đơn hàng',
      exact: true,
    });
    expect(
      trackOrders.closest('.sales-action-column')?.firstElementChild?.textContent,
    ).toContain('Hoàn tất pha chế');
    await user.click(trackOrders);
    await screen.findByRole('heading', {
      name: 'Theo dõi trạng thái đơn hàng',
      exact: true,
    });
    await user.click(
      screen.getByRole('link', { name: 'Bán hàng', exact: true }),
    );
    await screen.findByRole('button', {
      name: 'Theo dõi đơn hàng',
      exact: true,
    });
    await user.click(
      await screen.findByRole('button', {
        name: 'Hoàn tất pha chế',
        exact: true,
      }),
    );
    await screen.findByText('Đã ghi nhận hoàn tất pha chế cho đơn #ME-000001');
    const completedOrderPanel = screen
      .getByRole('heading', { name: 'Đơn hàng #ME-000001', exact: true })
      .closest('section');
    expect(
      within(completedOrderPanel!).queryByText('Hoàn tất pha chế'),
    ).toBeNull();
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
  it('cancels an eligible confirmed order, retains the order code, and allows creating a new order', async () => {
    const user = await startSale();
    await checkSale(user);
    expect(screen.getByText('#ME-000001')).toBeTruthy();
    const cancelBtn = screen.getByRole('button', { name: 'Hủy đơn' });
    await user.click(cancelBtn);

    const dialog = screen.getByRole('dialog', { name: 'Hủy đơn' });
    expect(
      within(dialog).getByText('Bạn có chắc chắn muốn hủy đơn đang lập không?'),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    expect(
      calls.some((c) => c.method === 'DELETE' && c.path.startsWith('/orders/')),
    ).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Multiple elements contain this text (toast + main content), so use getAllByText
    const cancelledTexts = await screen.findAllByText(/Đã hủy đơn hàng #ME-000001/);
    expect(cancelledTexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Phần tồn đã được giải phóng/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        'Đơn hàng bị hủy, không còn trong hệ thống và không được lưu vào lịch sử đơn hàng. Phần tồn đã giữ cho đơn được giải phóng, tồn khả dụng được cập nhật. Hãy thông báo cho khách hàng đơn đã được hủy.',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lập đơn mới' }));
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    expect(
      screen.queryByRole('spinbutton', { name: 'Số lượng Cà phê từ DB' }),
    ).toBeNull();
  });
  it('handles backend CANNOT_CANCEL rejection by keeping the order and showing error toast', async () => {
    const user = await startSale();
    await checkSale(user);

    order.trang_thai_pha_che = 'Bắt đầu pha chế';

    const cancelBtn = screen.getByRole('button', { name: 'Hủy đơn' });
    await user.click(cancelBtn);

    const dialog = screen.getByRole('dialog', { name: 'Hủy đơn' });
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The error message appears in both the header toast and the checkout panel ErrorMessage
    const errMsgs = await screen.findAllByText(
      'Đơn hàng không thể hủy do đã thanh toán thành công hoặc đã bắt đầu pha chế.',
    );
    expect(errMsgs.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Lập đơn mới' })).toBeNull();
    expect(screen.getAllByText('#ME-000001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bắt đầu pha chế')).toBeTruthy();
  });
  it('keeps the draft order when the cancellation request fails with a server error', async () => {
    const user = await startSale();
    await checkSale(user);
    errors.set(`DELETE /orders/${order.ma_don}`, {
      status: 503,
      message: 'Máy chủ đang bận. Vui lòng thử lại.',
      code: 'TEST_SERVER_UNAVAILABLE',
    });

    await user.click(screen.getByRole('button', { name: 'Hủy đơn' }));
    const dialog = screen.getByRole('dialog', { name: 'Hủy đơn' });
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    const serverErrors = await screen.findAllByText(
      'Máy chủ đang bận. Vui lòng thử lại.',
    );
    expect(serverErrors.length).toBeGreaterThanOrEqual(1);
    expect(order.ma_don).toBeTruthy();
    expect(screen.getAllByText('#ME-000001').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Lập đơn mới' })).toBeNull();
    expect(
      screen.queryByText(/Đã hủy đơn hàng #ME-000001/),
    ).toBeNull();
    expect(
      calls.filter(
        (call) => call.method === 'DELETE' && call.path === `/orders/${order.ma_don}`,
      ),
    ).toHaveLength(1);
  });
  it('renders pending QR state with cancel button and allows cancelling while QR is awaiting payment', async () => {
    qrConfigured = true;
    const user = await startSale();
    await checkSale(user);

    await user.click(screen.getByRole('button', { name: 'QR', exact: true }));

    const qrDialog = await screen.findByRole('dialog', {
      name: 'Thanh toán QR',
    });
    // The dialog has two "Đóng"-labeled buttons: the × header button and the "Đóng" footer button
    // Use getAllByRole and pick the footer one (text "Đóng", not aria-label "Đóng")
    const closeButtons = within(qrDialog).getAllByRole('button', { name: 'Đóng' });
    await user.click(closeButtons[closeButtons.length - 1]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(screen.getByText('QR đang chờ hoặc chưa rõ kết quả')).toBeTruthy();
    expect(
      screen.getByText('Chưa ghi nhận thanh toán thành công.'),
    ).toBeTruthy();
    expect(screen.getByText('Chưa chuyển phiếu pha chế.')).toBeTruthy();
    expect(screen.getByText('Đang giữ tồn.')).toBeTruthy();
    expect(order.da_thanh_toan).toBe(false);
    expect(
      calls.some(
        (call) =>
          call.method === 'POST' && call.path.endsWith('/reconcile'),
      ),
    ).toBe(false);

    const cancelBtn = screen.getByRole('button', { name: 'Hủy đơn' });
    await user.click(cancelBtn);

    const confirmDialog = screen.getByRole('dialog', { name: 'Hủy đơn' });
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Xác nhận' }),
    );

    await screen.findAllByText(/Đã hủy đơn hàng #ME-000001/);
    expect(screen.getAllByText(/Phần tồn đã được giải phóng/).length).toBeGreaterThanOrEqual(1);
  });
  it('keeps the empty cart notice left-aligned with Figma typography', () => {
    const emptyCartRule = applicationCss.match(
      /\.cart-empty-notice\s*\{([^}]*)\}/,
    );
    const emptyCartTextRule = applicationCss.match(
      /\.cart-empty-notice p,\s*\.cart-empty-notice small\s*\{([^}]*)\}/,
    );

    expect(emptyCartRule?.[1]).toMatch(/text-align:\s*left/);
    expect(emptyCartTextRule?.[1]).toMatch(/font-size:\s*13px/);
    expect(emptyCartTextRule?.[1]).toMatch(/font-weight:\s*500/);
    expect(emptyCartTextRule?.[1]).toMatch(/line-height:\s*1\.5/);
    expect(emptyCartTextRule?.[1]).toMatch(/color:\s*#7d6657/);
  });
  it('pins the exported-invoice notice above the total at the bottom of the brewing panel', () => {
    const invoiceNoticeRule = applicationCss.match(
      /^\.sales-invoice-exported-note\s*\{([^}]*)\}/m,
    );
    const invoiceDetailsRule = applicationCss.match(
      /^\.sales-invoice-exported-details\s*\{([^}]*)\}/m,
    );
    const brewingPanelRule = applicationCss.match(
      /\.sales-main:has\(> \.sales-brewing-total-bar\)\s*\{([^}]*)\}/,
    );
    const invoiceNoticePlacementRule = applicationCss.match(
      /\.sales-main:has\(> \.sales-brewing-total-bar\) > \.sales-invoice-exported-note\s*\{([^}]*)\}/,
    );

    expect(invoiceNoticeRule?.[1]).toMatch(/text-align:\s*left/);
    expect(invoiceDetailsRule?.[1]).toMatch(/text-align:\s*left/);
    expect(brewingPanelRule?.[1]).toMatch(/display:\s*flex/);
    expect(brewingPanelRule?.[1]).toMatch(/flex-direction:\s*column/);
    expect(invoiceNoticePlacementRule?.[1]).toMatch(/margin-top:\s*auto/);
  });
});
function dateTextForTest(date: string) {
  return date.split('-').reverse().join('\\/');
}
