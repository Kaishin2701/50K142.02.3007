import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from '../src/app/auth';
import { DataProvider } from '../src/app/data';
import { RouterProvider } from '../src/app/router';
import { NoticeProvider } from '../src/components/ui';
import ClosingPage from '../src/features/inventory/ClosingPage';
import type { ClosingReport, User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm kho',
  so_dien_thoai: '0900000001',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};
const manager: User = {
  ...employee,
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'quanly',
  ho_ten: 'Quản lý xác nhận',
  vai_tro: 'Quản lý',
};
const id = '88888888-8888-4888-8888-888888888888';
const confirmedAt = '2026-11-06T06:00:00.000Z';

function makeReport(
  status: ClosingReport['trang_thai'] = 'Nháp',
): ClosingReport {
  return {
    ma_bao_cao: id,
    ma_phieu: '77777777-7777-4777-8777-777777777777',
    ma_ca: '66666666-6666-4666-8666-666666666666',
    ngay_kiem_ke: '2026-11-06',
    ngay_lam: '2026-11-06',
    gio_bat_dau: '07:00',
    gio_ket_thuc: '12:00',
    ho_ten_nguoi_lap: employee.ho_ten,
    ho_ten_nguoi_xac_nhan: status === 'Đã xác nhận' ? manager.ho_ten : undefined,
    thoi_gian_xac_nhan: status === 'Đã xác nhận' ? confirmedAt : undefined,
    doanh_thu_ca_luc_doi_chieu: '100000',
    tien_mat_thuc_thu: '70000',
    chuyen_khoan_thuc_thu: '29000',
    ly_do_chenh_lech_tien: 'Sai lệch tiền mặt',
    trang_thai: status,
    items: [
      {
        ma_nguyen_lieu: '33333333-3333-4333-8333-333333333333',
        ten_nguyen_lieu: 'Cà phê hạt',
        don_vi_tinh: 'kg',
        ton_thuc_te: '3.5',
        chenh_lech: '-2',
        muc_ton_toi_thieu: '5',
        ly_do_chenh_lech: 'Khác',
        ghi_chu: 'Sai lệch kiểm đếm',
      },
      {
        ma_nguyen_lieu: '44444444-4444-4444-8444-444444444444',
        ten_nguyen_lieu: 'Đường',
        don_vi_tinh: 'kg',
        ton_thuc_te: '5',
        chenh_lech: '0',
        muc_ton_toi_thieu: '5',
      },
      {
        ma_nguyen_lieu: '55555555-5555-4555-8555-555555555555',
        ten_nguyen_lieu: 'Sữa tươi',
        don_vi_tinh: 'lít',
        ton_thuc_te: '5.5',
        chenh_lech: '0.5',
        muc_ton_toi_thieu: '5',
      },
      {
        ma_nguyen_lieu: '99999999-9999-4999-8999-999999999999',
        ten_nguyen_lieu: 'Trà đào',
        don_vi_tinh: 'kg',
        ton_thuc_te: '3',
        chenh_lech: '0',
        muc_ton_toi_thieu: '5',
      },
    ],
  };
}

function response(data: unknown, status = 200, message = '', code = 'TEST_ERROR') {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code, message } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

class TestEventSource {
  addEventListener() {}
  close() {}
}

function ClosingHarness() {
  const { user, ready } = useSession();
  if (!ready || !user) return <p role="status">Đang tải phiên đăng nhập…</p>;
  return (
    <DataProvider>
      <RouterProvider>
        <NoticeProvider>
          <ClosingPage />
        </NoticeProvider>
      </RouterProvider>
    </DataProvider>
  );
}

let activeUser: User;
let reports: ClosingReport[];
let detail: ClosingReport | null;
let calls: { path: string; method: string; body: unknown }[];
let failures: Map<string, string>;
let failureCodes: Map<string, string>;

beforeEach(() => {
  activeUser = employee;
  reports = [];
  detail = null;
  calls = [];
  failures = new Map();
  failureCodes = new Map();
  location.hash = '#/closing';
  vi.stubGlobal('EventSource', TestEventSource);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = options.method ?? 'GET';
      const body = options.body
        ? JSON.parse(String(options.body))
        : undefined;
      calls.push({ path, method, body });
      const failureKey = method + ' ' + path;
      const failure = failures.get(failureKey);
      if (failure) {
        failures.delete(failureKey);
        return response(null, 409, failure, failureCodes.get(failureKey));
      }
      if (path === '/auth/me') return response(activeUser);
      if (path === '/inventory/close-reports' && method === 'GET')
        return response(reports);
      if (
        path === `/inventory/close-reports/${id}` &&
        method === 'GET'
      )
        return response(detail);
      if (path === `/inventory/close-reports/${id}/send` && method === 'POST') {
        if (detail) detail.trang_thai = 'Chờ xác nhận';
        reports = reports.map((report) => ({
          ...report,
          trang_thai:
            report.ma_bao_cao === id ? 'Chờ xác nhận' : report.trang_thai,
        }));
        return response(detail);
      }
      if (
        path === `/inventory/close-reports/${id}/low-stock` &&
        method === 'POST'
      )
        return response({ da_gui: true, items: detail?.items ?? [] });
      if (
        path === `/inventory/close-reports/${id}/confirm` &&
        method === 'POST'
      ) {
        if (detail) {
          detail.trang_thai = 'Đã xác nhận';
          detail.ho_ten_nguoi_xac_nhan = manager.ho_ten;
          detail.thoi_gian_xac_nhan = confirmedAt;
        }
        reports = reports.map((report) =>
          report.ma_bao_cao === id && detail ? { ...detail } : report,
        );
        return response(detail);
      }
      return response(null, 404, 'Không tìm thấy fixture API.');
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderClosing(role: 'Nhân viên' | 'Quản lý' = 'Nhân viên') {
  activeUser = role === 'Quản lý' ? manager : employee;
  render(
    <SessionProvider>
      <ClosingHarness />
    </SessionProvider>,
  );
}

function actionCalls() {
  return calls.filter((call) => call.method === 'POST');
}

describe('GD4.5 báo cáo cuối ca', () => {
  it('shows the employee guidance state when the API returns no reports', async () => {
    renderClosing();
    expect(
      await screen.findByText(
        'Chưa có phiếu kiểm kho của ca này. Vui lòng kiểm kê nguyên liệu trước.',
      ),
    ).toBeTruthy();
    expect(
      calls.some(
        (call) =>
          call.path === '/inventory/close-reports' && call.method === 'GET',
      ),
    ).toBe(true);
    expect(actionCalls()).toHaveLength(0);
  });

  it('formats material differences with signs and highlights negative values', async () => {
    detail = makeReport();
    reports = [detail];
    renderClosing();
    const negative = await screen.findByText('-2');
    expect(negative.className).toContain('closing-difference-negative');
    expect(screen.getByText('+0,5')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('sends a draft without a body and refreshes the report state after success', async () => {
    detail = makeReport();
    reports = [detail];
    renderClosing();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText('Chờ xác nhận');
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-inventory-success',
    );
    expect(
      calls.find(
        (call) =>
          call.path === `/inventory/close-reports/${id}/send` &&
          call.method === 'POST',
      )?.body,
    ).toBeUndefined();
    expect(
      calls.filter(
        (call) => call.path === `/inventory/close-reports/${id}` && call.method === 'GET',
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(actionCalls()).toHaveLength(1);
  });

  it('keeps a failed draft unchanged and allows the employee to retry', async () => {
    detail = makeReport();
    reports = [detail];
    failures.set(
      `POST /inventory/close-reports/${id}/send`,
      'Gửi báo cáo thất bại. Vui lòng thử lại.',
    );
    renderClosing();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Gửi báo cáo' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Gửi báo cáo thất bại. Vui lòng thử lại.');
    expect(error.className).toBe('closing-error-toast');
    expect(screen.getByText('Nháp')).toBeTruthy();
    expect(screen.getByText('99.000 đ')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    expect(await screen.findByText('Chờ xác nhận')).toBeTruthy();
    expect(actionCalls()).toHaveLength(2);
    expect(actionCalls().every((call) => call.body === undefined)).toBe(true);
  });

  it('sends a low-stock notification only for items below their minimum', async () => {
    detail = makeReport('Chờ xác nhận');
    reports = [detail];
    renderClosing();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Gửi thông tin nguyên liệu cần nhập',
      }),
    );
    expect(
      await screen.findByText(
        'Đã gửi thông tin nguyên liệu cần nhập cho quản lý.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-inventory-success',
    );
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    expect(
      actionCalls().map((call) => [call.path, call.method, call.body]),
    ).toEqual([
      [`/inventory/close-reports/${id}/low-stock`, 'POST', undefined],
    ]);
  });

  it('keeps the pending report and displays the raw low-stock API error', async () => {
    detail = makeReport('Chờ xác nhận');
    reports = [detail];
    failures.set(
      `POST /inventory/close-reports/${id}/low-stock`,
      'Không có nguyên liệu dưới mức tồn tối thiểu.',
    );
    renderClosing();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Gửi thông tin nguyên liệu cần nhập',
      }),
    );
    expect(
      await screen.findByText('Không có nguyên liệu dưới mức tồn tối thiểu.'),
    ).toBeTruthy();
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    expect(actionCalls()).toHaveLength(1);
  });

  it('does not offer low-stock notification when actual stock equals the minimum', async () => {
    detail = makeReport('Chờ xác nhận');
    detail.items.forEach((item) => {
      item.ton_thuc_te = item.muc_ton_toi_thieu;
    });
    reports = [detail];
    renderClosing();
    await screen.findByText('Chờ xác nhận');
    expect(
      screen.queryByRole('button', {
        name: 'Gửi thông tin nguyên liệu cần nhập',
      }),
    ).toBeNull();
    expect(actionCalls()).toHaveLength(0);
  });

  it('shows a confirmed employee report read-only with backend confirmer data', async () => {
    detail = makeReport('Đã xác nhận');
    reports = [detail];
    renderClosing();
    expect(await screen.findByText(manager.ho_ten)).toBeTruthy();
    expect(screen.getByText('06/11/2026 13:00')).toBeTruthy();
    expect(screen.getByText('99.000 đ')).toBeTruthy();
    expect(screen.getByText('-1.000 đ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gửi báo cáo' })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Gửi thông tin nguyên liệu cần nhập',
      }),
    ).toBeNull();
  });

  it('describes one pending manager report with its API date and status', async () => {
    detail = makeReport('Chờ xác nhận');
    reports = [detail];
    renderClosing('Quản lý');
    expect(
      await screen.findByText(
        'Báo cáo cuối ca ngày 06/11/2026 chờ xác nhận',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('06/11/2026', { exact: true })).toBeNull();
  });

  it('keeps confirmed manager reports in the list and loads selected details', async () => {
    detail = makeReport('Đã xác nhận');
    reports = [detail, { ...makeReport('Chờ xác nhận'), ma_bao_cao: 'other-id' }];
    renderClosing('Quản lý');
    const viewButtons = await screen.findAllByRole('button', { name: 'Xem' });
    expect(viewButtons).toHaveLength(2);
    expect(screen.getByText('Danh sách 2 báo cáo cuối ca')).toBeTruthy();
    expect(screen.getByText('Đã xác nhận')).toBeTruthy();
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    expect(screen.getAllByText('06/11/2026')).toHaveLength(2);
    expect(screen.queryByText('Mã báo cáo')).toBeNull();
    expect(screen.queryByText('Người lập')).toBeNull();
    await userEvent.setup().click(viewButtons[0]);
    expect(await screen.findByText(manager.ho_ten)).toBeTruthy();
    expect(screen.getByText('06/11/2026 13:00')).toBeTruthy();
    expect(
      calls.some(
        (call) =>
          call.path === `/inventory/close-reports/${id}` &&
          call.method === 'GET',
      ),
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Xác nhận báo cáo' }),
    ).toBeNull();
  });

  it('confirms a pending manager report and refreshes status and confirmer data', async () => {
    detail = makeReport('Chờ xác nhận');
    reports = [detail];
    renderClosing('Quản lý');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xem' }));
    await user.click(
      await screen.findByRole('button', { name: 'Xác nhận báo cáo' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    expect(await screen.findByText('Đã xác nhận')).toBeTruthy();
    expect(await screen.findByText(manager.ho_ten)).toBeTruthy();
    expect(screen.getByText('06/11/2026 13:00')).toBeTruthy();
    expect(
      await screen.findByText('Xác nhận báo cáo cuối ca thành công.'),
    ).toBeTruthy();
    expect(
      actionCalls().map((call) => [call.path, call.method, call.body]),
    ).toEqual([
      [`/inventory/close-reports/${id}/confirm`, 'POST', undefined],
    ]);
    await waitFor(() => {
      expect(
        calls.filter(
          (call) =>
            call.path === '/inventory/close-reports' && call.method === 'GET',
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it.each([
    ['ordinary API failure', 'Xác nhận báo cáo thất bại. Vui lòng thử lại.'],
    [
      'inventory conflict',
      'Tồn kho sau đối chiếu không đủ cho phần đã giữ. Cần giải quyết đơn hoặc nhập kho trước khi xác nhận.',
    ],
  ])('handles %s and keeps the report pending', async (kind, message) => {
    detail = makeReport('Chờ xác nhận');
    reports = [detail];
    const stockConflict = kind === 'inventory conflict';
    const confirmRequest = `POST /inventory/close-reports/${id}/confirm`;
    failures.set(confirmRequest, message);
    if (stockConflict) {
      failureCodes.set(confirmRequest, 'STOCK_RECONCILIATION_CONFLICT');
    }
    renderClosing('Quản lý');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xem' }));
    await user.click(
      await screen.findByRole('button', { name: 'Xác nhận báo cáo' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText('Chờ xác nhận')).toBeTruthy();
    if (stockConflict) {
      expect(screen.getByRole('dialog')).toBeTruthy();
    } else {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText(message).className).toBe('closing-error-toast');
      await user.click(screen.getByRole('button', { name: 'Xác nhận báo cáo' }));
    }
    expect(screen.getByRole('button', { name: 'Xác nhận', exact: true })).toBeTruthy();
    expect(actionCalls()).toHaveLength(1);
    expect(actionCalls()[0].body).toBeUndefined();
  });
});
