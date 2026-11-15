import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../src/app/data';
import InventoryPage from '../src/features/inventory/InventoryPage';

type Loss = {
  ma_phieu: string;
  ma_ca: string;
  ngay_kiem_ke: string;
  ten_nguyen_lieu: string;
  don_vi_tinh: string;
  ton_ly_thuyet_luc_kiem_ke: number;
  ton_thuc_te: number;
  chenh_lech: number;
  ly_do_chenh_lech: string;
  ghi_chu: string;
  nguoi_ghi_nhan: string;
  total?: number;
};

function makeLoss(index: number): Loss {
  const isPositive = index % 3 === 1;
  return {
    ma_phieu: `count-${index + 1}`,
    ma_ca: 'ca-123456-unique',
    ngay_kiem_ke: '2026-11-06',
    ten_nguyen_lieu: index % 3 === 0 ? 'Cà phê hạt' : 'Sữa tươi',
    don_vi_tinh: index % 3 === 0 ? 'kg' : 'lít',
    ton_ly_thuyet_luc_kiem_ke: isPositive ? 10 : 5.5,
    ton_thuc_te: isPositive ? 10.5 : 3.5,
    chenh_lech: isPositive ? 0.5 : -2,
    ly_do_chenh_lech: index % 3 === 1 ? 'Khác' : 'Hao hụt',
    ghi_chu: index % 3 === 1 ? 'Sai lệch kiểm đếm' : '',
    nguoi_ghi_nhan: 'Nguyễn Minh Anh',
  };
}

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code: 'TEST_ERROR', message: 'Tạm thời không thể tải.' } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

let losses: Loss[] = [];
let total: number | undefined = 22;
let listError = false;
let calls: { path: string; method: string }[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
let pendingResponse: Promise<Response> | null = null;

beforeEach(() => {
  losses = Array.from({ length: 22 }, (_, index) => makeLoss(index));
  total = 22;
  listError = false;
  calls = [];
  pendingResponse = null;
  fetchMock = vi.fn(async (input: string, options: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = options.method ?? 'GET';
    calls.push({ path: path + url.search, method });

    if (path === '/inventory/losses' && method === 'GET') {
      if (pendingResponse) return pendingResponse;
      if (listError) return response(null, 500);
      const currentPage = Number(url.searchParams.get('page'));
      const start = (currentPage - 1) * 20;
      const pageRows = losses.slice(start, start + 20);
      return response(
        total === undefined
          ? pageRows
          : pageRows.map((loss) => ({ ...loss, total })),
      );
    }

    return response(null, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLosses() {
  return render(
    <DataProvider>
      <InventoryPage page="losses" />
    </DataProvider>,
  );
}

function expectLossPage(page: number) {
  const pagination = screen.getByRole('navigation', {
    name: 'Phân trang hao hụt',
  });
  expect(within(pagination).getByText(String(page), { exact: true })).toBeTruthy();
}

function expectReadOnlyLossRequests() {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.path).toMatch(/^\/inventory\/losses\?page=\d+&limit=20$/);
    expect(call.method).toBe('GET');
  }
}

describe('GD4.3 inventory loss history', () => {
  it('renders formatted loss rows including both difference signs and other-reason notes', async () => {
    renderLosses();

    expect(
      await screen.findByRole('heading', { name: 'Lịch sử hao hụt kho' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Lịch sử hao hụt' }),
    ).toBeTruthy();
    for (const label of [
      'STT',
      'Ngày',
      'Ca',
      'Nguyên liệu',
      'Đơn vị tính',
      'Tồn lý thuyết',
      'Tồn thực tế',
      'Chênh lệch',
      'Lý do chênh lệch',
      'Người ghi nhận',
    ]) {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    }
    const dataRows = screen.getAllByRole('row').slice(1);
    expect(within(dataRows[0]).getByText('06/11/2026')).toBeTruthy();
    expect(within(dataRows[0]).getByText('ca-12345')).toBeTruthy();
    expect(within(dataRows[0]).getByText('5,5')).toBeTruthy();
    expect(within(dataRows[0]).getByText('3,5')).toBeTruthy();
    expect(within(dataRows[0]).getByText('-2').className).toBe('is-negative');
    expect(
      within(dataRows[1]).getByText('Khác - Sai lệch kiểm đếm'),
    ).toBeTruthy();
    expect(within(dataRows[1]).getByText('+0,5').className).toBe('');
    expectLossPage(1);
    expect(calls).toEqual([
      { path: '/inventory/losses?page=1&limit=20', method: 'GET' },
    ]);
    expectReadOnlyLossRequests();
  });

  it('uses the API total for page controls and keeps row numbers continuous', async () => {
    renderLosses();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });

    expect(
      (screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(await screen.findByText('21', { selector: 'td' })).toBeTruthy();
    expect(await screen.findByText('22', { selector: 'td' })).toBeTruthy();
    expectLossPage(2);
    expect(
      (screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(calls).toContainEqual({
      path: '/inventory/losses?page=2&limit=20',
      method: 'GET',
    });
    expectReadOnlyLossRequests();
  });

  it('uses the page length when the API does not include a total', async () => {
    total = undefined;
    renderLosses();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(await screen.findByText('21', { selector: 'td' })).toBeTruthy();
    expect(await screen.findByText('22', { selector: 'td' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expectReadOnlyLossRequests();
  });

  it('shows an empty state without a table or pagination', async () => {
    losses = [];
    total = 0;
    renderLosses();

    expect(
      await screen.findByText('Chưa có dữ liệu hao hụt.'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang hao hụt' }),
    ).toBeNull();
    expectReadOnlyLossRequests();
  });

  it('shows a loading state separately from empty data', async () => {
    let resolveResponse!: (value: Response) => void;
    pendingResponse = new Promise((resolve) => {
      resolveResponse = resolve;
    });
    renderLosses();

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('Chưa có dữ liệu hao hụt.')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();

    pendingResponse = null;
    resolveResponse(response([]));
    expect(await screen.findByText('Chưa có dữ liệu hao hụt.')).toBeTruthy();
    expectReadOnlyLossRequests();
  });

  it('retries an error on the same page', async () => {
    renderLosses();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });
    listError = true;
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText(
      'Không thể tải lịch sử hao hụt. Vui lòng thử lại.',
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang hao hụt' }),
    ).toBeNull();
    expect(calls.filter((call) => call.path.includes('page=2'))).toHaveLength(1);

    listError = false;
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));

    expect(await screen.findByText('21', { selector: 'td' })).toBeTruthy();
    expectLossPage(2);
    await waitFor(() =>
      expect(calls.filter((call) => call.path.includes('page=2'))).toHaveLength(
        2,
      ),
    );
    expectReadOnlyLossRequests();
  });
});
