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
import App from '../src/app/App';
import type { User } from '../src/services/models';

const manager: User = {
  ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
  ten_dang_nhap: 'quanly',
  ho_ten: 'Quản lý báo cáo',
  so_dien_thoai: '0900000001',
  vai_tro: 'Quản lý',
  trang_thai: 'Đang hoạt động',
};
const allRevenue = {
  doanh_thu: '9250000',
  so_ly: '185',
  tien_mat: '3550000',
  chuyen_khoan: '5700000',
  items: [{ ngay: '2026-11-12' }],
};
const cashRevenue = {
  doanh_thu: '3550000',
  so_ly: '70',
  tien_mat: '3550000',
  chuyen_khoan: '0',
  items: [{ ngay: '2026-11-12' }],
};
const transferRevenue = {
  doanh_thu: '5700000',
  so_ly: '115',
  tien_mat: '0',
  chuyen_khoan: '5700000',
  items: [{ ngay: '2026-11-12' }],
};

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

class TestEventSource {
  addEventListener() {}
  close() {}
}

type RevenueCall = {
  search: URLSearchParams;
  url: string;
};
let calls: RevenueCall[];
let failures: Map<string, string>;
let emptyRevenue = false;
let heldDate = '';
let releaseHeld: ((value: Response) => void) | null;

beforeEach(() => {
  calls = [];
  failures = new Map();
  emptyRevenue = false;
  heldDate = '';
  releaseHeld = null;
  location.hash = '#/reports';
  vi.stubGlobal('EventSource', TestEventSource);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return response(manager);
      if (path !== '/reports/revenue')
        return response('Không tìm thấy fixture API.', 404);

      const search = url.searchParams;
      calls.push({ search: new URLSearchParams(search), url: url.toString() });
      if (
        heldDate &&
        search.get('date') === heldDate &&
        !search.has('method')
      ) {
        return new Promise<Response>((resolve) => {
          releaseHeld = resolve;
        });
      }

      const method = search.get('method');
      const failureKey = method ?? 'all';
      const failure = failures.get(failureKey);
      if (failure) {
        failures.delete(failureKey);
        return response(failure, 503);
      }
      if (method === 'Tiền mặt') return response(cashRevenue);
      if (method === 'Chuyển khoản qua QR') return response(transferRevenue);
      if (emptyRevenue)
        return response({
          doanh_thu: '0',
          so_ly: '0',
          tien_mat: '0',
          chuyen_khoan: '0',
          items: [],
        });
      return response(allRevenue);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderReports() {
  render(<App />);
}

function revenueCalls() {
  return calls;
}

describe('GD5.1/GD5.2 báo cáo doanh thu', () => {
  it('requests total metrics without method and updates only the selected payment amount', async () => {
    renderReports();
    expect(await screen.findByText('9.250.000 đ')).toBeTruthy();
    expect(screen.getByText('185')).toBeTruthy();
    expect(
      revenueCalls().some(
        ({ search }) =>
          search.get('period') === 'day' &&
          search.get('date') === new Date(Date.now() + 7 * 3600000)
            .toISOString()
            .slice(0, 10) &&
          !search.has('method'),
      ),
    ).toBe(true);
    expect(
      revenueCalls().some(
        ({ search }) => search.get('method') === 'Tiền mặt',
      ),
    ).toBe(true);
    expect(await screen.findByText('3.550.000 đ')).toBeTruthy();

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Chuyển khoản' }),
    );
    expect(await screen.findByText('5.700.000 đ')).toBeTruthy();
    expect(screen.getByText('9.250.000 đ')).toBeTruthy();
    expect(screen.getByText('185')).toBeTruthy();
    expect(
      revenueCalls().some(
        ({ search }) => search.get('method') === 'Chuyển khoản qua QR',
      ),
    ).toBe(true);
  });

  it('refreshes both report scopes when application data changes', async () => {
    renderReports();
    expect(await screen.findByText('9.250.000 đ')).toBeTruthy();
    expect(await screen.findByText('3.550.000 đ')).toBeTruthy();
    const previousCalls = revenueCalls().length;

    window.dispatchEvent(new Event('me-data-changed'));
    await waitFor(() => {
      expect(revenueCalls()).toHaveLength(previousCalls + 2);
    });
  });

  it('sends day, month, and year filters only after choosing Xem báo cáo', async () => {
    renderReports();
    await screen.findByText('9.250.000 đ');
    const user = userEvent.setup();
    const dateInput = screen.getByLabelText('Ngày báo cáo');
    expect(
      screen.queryByRole('button', { name: 'Chọn ngày trên lịch' }),
    ).toBeNull();
    const currentDate = new Date(Date.now() + 7 * 3600000)
      .toISOString()
      .slice(0, 10);
    expect(dateInput).toHaveProperty(
      'value',
      `${currentDate.slice(8, 10)}/${currentDate.slice(5, 7)}/${currentDate.slice(0, 4)}`,
    );

    fireEvent.change(dateInput, { target: { value: '06/11/2026' } });
    const beforeDaySubmit = revenueCalls().length;
    await user.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
    await waitFor(() => {
      expect(
        revenueCalls().slice(beforeDaySubmit).some(
          ({ search }) =>
            search.get('period') === 'day' &&
            search.get('date') === '2026-11-06' &&
            !search.has('method'),
        ),
      ).toBe(true);
    });
    expect(screen.getByText('06/11/2026')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Tháng' }));
    expect(dateInput).toHaveProperty(
      'value',
      `${currentDate.slice(5, 7)}/${currentDate.slice(0, 4)}`,
    );
    fireEvent.change(dateInput, { target: { value: '10/2026' } });
    const beforeMonthSubmit = revenueCalls().length;
    await user.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
    await waitFor(() => {
      expect(
        revenueCalls().slice(beforeMonthSubmit).some(
          ({ search }) =>
            search.get('period') === 'month' &&
            search.get('date') === '2026-10-01' &&
            !search.has('method'),
        ),
      ).toBe(true);
    });
    expect(screen.getByText('10/2026')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Năm' }));
    const yearInput = screen.getByLabelText('Ngày báo cáo');
    expect(yearInput).toHaveProperty('value', currentDate.slice(0, 4));
    fireEvent.change(yearInput, {
      target: { value: '2025' },
    });
    const beforeYearSubmit = revenueCalls().length;
    await user.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
    await waitFor(() => {
      expect(
        revenueCalls().slice(beforeYearSubmit).some(
          ({ search }) =>
            search.get('period') === 'year' &&
            search.get('date') === '2025-01-01' &&
            !search.has('method'),
        ),
      ).toBe(true);
    });
    expect(screen.getByText('2025')).toBeTruthy();
  });

  it('shows zero and the empty state only when the unfiltered items list is empty', async () => {
    emptyRevenue = true;
    renderReports();
    expect(
      await screen.findByText(
        'Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!',
      ),
    ).toBeTruthy();
    const metrics = document.querySelector('.report-metrics');
    expect(metrics).not.toBeNull();
    expect(within(metrics as HTMLElement).getByText('0 đ')).toBeTruthy();
    expect(within(metrics as HTMLElement).getByText('0')).toBeTruthy();

    cleanup();
    emptyRevenue = false;
    renderReports();
    await screen.findByText('9.250.000 đ');
    expect(
      screen.queryByText(
        'Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!',
      ),
    ).toBeNull();
  });

  it('clears previous totals during a new report request', async () => {
    renderReports();
    await screen.findByText('9.250.000 đ');
    heldDate = '2024-01-01';
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tháng' }));
    fireEvent.change(screen.getByLabelText('Ngày báo cáo'), {
      target: { value: '01/2024' },
    });
    await user.click(screen.getByRole('button', { name: 'Xem báo cáo' }));
    await waitFor(() => expect(releaseHeld).not.toBeNull());
    expect(screen.queryByText('9.250.000 đ')).toBeNull();
    expect(
      within(document.querySelector('.report-metrics') as HTMLElement).getAllByText(
        '—',
      ),
    ).toHaveLength(2);
    expect(await screen.findByText('Đang tải…')).toBeTruthy();
    releaseHeld?.(response(allRevenue));
    expect(await screen.findByText('9.250.000 đ')).toBeTruthy();
  });

  it('shows report errors with dashes and retries the unfiltered request', async () => {
    failures.set('all', 'Máy chủ báo cáo tạm thời không khả dụng.');
    renderReports();
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain(
      'Máy chủ báo cáo tạm thời không khả dụng.',
    );
    expect(
      within(document.querySelector('.report-metrics') as HTMLElement).getAllByText(
        '—',
      ),
    ).toHaveLength(2);
    const paymentPanel = screen
      .getByRole('heading', { name: 'Doanh thu theo phương thức thanh toán' })
      .closest('section');
    expect(paymentPanel).not.toBeNull();
    expect(
      paymentPanel?.querySelector('.report-payment-value')?.textContent,
    ).toBe('Tiền mặt—');
    expect(
      within(paymentPanel as HTMLElement).getByText('—'),
    ).toBeTruthy();
    expect(
      within(paymentPanel as HTMLElement).queryByText('3.550.000 đ'),
    ).toBeNull();
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Tải lại báo cáo doanh thu' }),
    );
    expect(await screen.findByText('9.250.000 đ')).toBeTruthy();
  });

  it('keeps the payment error and retry control inside the payment section', async () => {
    failures.set('Tiền mặt', 'Dữ liệu thanh toán tạm thời không khả dụng.');
    renderReports();
    expect(await screen.findByText('9.250.000 đ')).toBeTruthy();
    const paymentPanel = screen
      .getByRole('heading', { name: 'Doanh thu theo phương thức thanh toán' })
      .closest('section');
    expect(paymentPanel).not.toBeNull();
    expect(
      await within(paymentPanel as HTMLElement).findByRole('alert'),
    ).toBeTruthy();
    expect(
      within(paymentPanel as HTMLElement).getByRole('button', {
        name: 'Tải lại dữ liệu phương thức thanh toán',
      }),
    ).toBeTruthy();
    expect(
      paymentPanel?.querySelector('.report-payment-value'),
    ).toBeNull();
    expect(
      paymentPanel?.querySelector('.segmented')?.nextElementSibling,
    ).toBe(paymentPanel?.querySelector('.report-payment-alert'));
    expect(screen.getByText('185')).toBeTruthy();

    await userEvent.setup().click(
      within(paymentPanel as HTMLElement).getByRole('button', {
        name: 'Tải lại dữ liệu phương thức thanh toán',
      }),
    );
    expect(
      await within(paymentPanel as HTMLElement).findByText('3.550.000 đ'),
    ).toBeTruthy();
    expect(screen.getByText('9.250.000 đ')).toBeTruthy();
    expect(screen.getByText('185')).toBeTruthy();
  });
});
