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

type Receipt = {
  ma_po: string;
  ngay_nhap: string;
  ten_nha_cung_cap: string;
  tong_tien: number;
  trang_thai_thanh_toan: string;
  hinh_thuc_thanh_toan: string | null;
  total?: number;
};

const receiptDetails = {
  ma_po: 'PO-01',
  ten_nha_cung_cap: 'Minh An',
  ngay_nhap: '2026-11-05',
  nguoi_xac_nhan: 'Trần Hoàng Nam',
  trang_thai_thanh_toan: 'Đã thanh toán',
  hinh_thuc_thanh_toan: 'Chuyển khoản',
  tong_tien: 2180000,
  items: [
    {
      ma_nguyen_lieu: 'material-1',
      ten_nguyen_lieu: 'Cà phê hạt',
      don_vi_tinh: 'kg',
      so_luong_dat: 20,
      so_luong_nhan: 20,
      don_gia: 90000,
      thanh_tien: 1800000,
    },
  ],
};

function makeReceipt(index: number): Receipt {
  return {
    ma_po: `PO-${String(index).padStart(2, '0')}`,
    ngay_nhap: '2026-11-05',
    ten_nha_cung_cap: 'Minh An',
    tong_tien: index === 1 ? 2180000 : 350000,
    trang_thai_thanh_toan: index % 4 === 0 ? 'Công nợ' : 'Đã thanh toán',
    hinh_thuc_thanh_toan: index % 4 === 0 ? null : 'Chuyển khoản',
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

let receipts: Receipt[] = [];
let total: number | undefined = 22;
let listError = false;
let detailError = false;
let calls: { path: string; method: string }[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  receipts = Array.from({ length: 22 }, (_, index) => makeReceipt(index + 1));
  total = 22;
  listError = false;
  detailError = false;
  calls = [];
  fetchMock = vi.fn(async (input: string, options: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = options.method ?? 'GET';
    calls.push({ path: path + url.search, method });

    if (path === '/inventory/receipts' && method === 'GET') {
      if (listError) return response(null, 500);
      const currentPage = Number(url.searchParams.get('page'));
      const start = (currentPage - 1) * 20;
      const pageRows = receipts.slice(start, start + 20);
      return response(
        total === undefined
          ? pageRows
          : pageRows.map((receipt) => ({ ...receipt, total })),
      );
    }

    if (path.startsWith('/inventory/receipts/') && method === 'GET') {
      if (detailError) return response(null, 500);
      const id = decodeURIComponent(path.slice('/inventory/receipts/'.length));
      return response({ ...receiptDetails, ma_po: id });
    }

    return response(null, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderReceipts() {
  return render(
    <DataProvider>
      <InventoryPage page="receipts" />
    </DataProvider>,
  );
}

function expectReceiptPage(page: number) {
  const pagination = screen.getByRole('navigation', {
    name: 'Phân trang nhập hàng',
  });
  expect(within(pagination).getByText(String(page), { exact: true })).toBeTruthy();
}

function expectReadOnlyReceiptRequests() {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.path).toMatch(/^\/inventory\/receipts(?:\/[^?]+)?(?:\?.*)?$/);
    expect(call.method).toBe('GET');
  }
}

describe('GD4.2 receipt history', () => {
  it('loads page one with the fixed API page size and correct pagination controls', async () => {
    renderReceipts();

    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-01' }),
    ).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Mã PO' })).toBeTruthy();
    expect(
      screen.queryByRole('columnheader', { name: 'Thao tác' }),
    ).toBeNull();
    expect(screen.getByText('20', { exact: true })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(calls).toContainEqual({
      path: '/inventory/receipts?page=1&limit=20',
      method: 'GET',
    });
    expectReadOnlyReceiptRequests();
  });

  it('shows real page-two rows with continuous numbering and disables the final page control', async () => {
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    ).toBeTruthy();
    expect(screen.getByText('21', { exact: true })).toBeTruthy();
    expect(screen.getByText('22', { exact: true })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Trang trước' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(calls).toContainEqual({
      path: '/inventory/receipts?page=2&limit=20',
      method: 'GET',
    });
    expectReadOnlyReceiptRequests();
  });

  it('uses the returned row count when the API does not include total', async () => {
    total = undefined;
    receipts = receipts.slice(0, 3);
    renderReceipts();

    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-01' }),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('returns to the last populated page if a full page without total is followed by an empty page', async () => {
    total = undefined;
    receipts = receipts.slice(0, 20);
    renderReceipts();
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Trang sau' });
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expectReceiptPage(1));
    expect(screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-20' }))
      .toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Trang sau' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expectReadOnlyReceiptRequests();
  });

  it('shows a dedicated empty state without a table or pagination', async () => {
    receipts = [];
    total = 0;
    renderReceipts();

    expect(await screen.findByText('Chưa có lần nhập hàng nào.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang nhập hàng' }),
    ).toBeNull();
    expectReadOnlyReceiptRequests();
  });

  it('retries a list error on page one without showing table or pagination', async () => {
    listError = true;
    renderReceipts();
    const user = userEvent.setup();

    expect(
      await screen.findByText(
        'Không thể tải lịch sử nhập hàng. Vui lòng thử lại.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeTruthy();
    expect(screen.queryByText('Chưa có lần nhập hàng nào.')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang nhập hàng' }),
    ).toBeNull();
    const pageOneRequests = () =>
      calls.filter(
        (call) => call.path === '/inventory/receipts?page=1&limit=20',
      );
    expect(pageOneRequests()).toHaveLength(1);

    listError = false;
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-01' }),
    ).toBeTruthy();
    expect(pageOneRequests()).toHaveLength(2);
    expectReadOnlyReceiptRequests();
  });

  it('retries a page-two list error on page two and shows that page after success', async () => {
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });

    listError = true;
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      await screen.findByText(
        'Không thể tải lịch sử nhập hàng. Vui lòng thử lại.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang nhập hàng' }),
    ).toBeNull();
    const pageTwoRequests = () =>
      calls.filter(
        (call) => call.path === '/inventory/receipts?page=2&limit=20',
      );
    expect(pageTwoRequests()).toHaveLength(1);

    listError = false;
    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    ).toBeTruthy();
    expectReceiptPage(2);
    expect(pageTwoRequests()).toHaveLength(2);
    expectReadOnlyReceiptRequests();
  });

  it('opens the paid receipt in the page content and displays formatted details', async () => {
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-01' });
    await user.click(
      screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-01' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Chi tiết lần nhập hàng' }),
    ).toBeTruthy();
    expect(screen.getByText('PO-01')).toBeTruthy();
    expect(screen.getByText('05/11/2026')).toBeTruthy();
    expect(screen.getByText('Đã thanh toán')).toBeTruthy();
    expect(screen.getByText('Chuyển khoản')).toBeTruthy();
    expect(screen.getByText('2.180.000 đ')).toBeTruthy();
    expect(screen.getByText('Cà phê hạt')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toContainEqual({
      path: '/inventory/receipts/PO-01',
      method: 'GET',
    });
    expectReadOnlyReceiptRequests();
  });

  it('returns from a detail page to the same list page', async () => {
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-21' });
    await user.click(
      screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    );
    await screen.findByRole('heading', { name: 'Chi tiết lần nhập hàng' });
    await user.click(
      screen.getByRole('button', { name: 'Quay lại danh sách nhập hàng' }),
    );

    expectReceiptPage(2);
    expect(
      screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    ).toBeTruthy();
    expect(
      calls.filter((call) => call.path === '/inventory/receipts?page=2&limit=20'),
    ).toHaveLength(1);
    expectReadOnlyReceiptRequests();
  });

  it('shows debt details without inventing a payment method', async () => {
    detailError = false;
    const debtReceipt = {
      ...receiptDetails,
      ma_po: 'PO-04',
      trang_thai_thanh_toan: 'Công nợ',
      hinh_thuc_thanh_toan: null,
    };
    fetchMock.mockImplementation(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = options.method ?? 'GET';
      calls.push({ path: path + url.search, method });
      if (path === '/inventory/receipts' && method === 'GET')
        return response([ { ...makeReceipt(4), total: 22 } ]);
      if (path === '/inventory/receipts/PO-04' && method === 'GET')
        return response(debtReceipt);
      return response(null, 404);
    });
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-04' });
    await user.click(
      screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-04' }),
    );

    expect(
      await screen.findByText('Công nợ', { selector: 'dd span' }),
    ).toBeTruthy();
    expect(screen.getByText('Chưa có')).toBeTruthy();
    expect(screen.queryByText('Chuyển khoản')).toBeNull();
    expectReadOnlyReceiptRequests();
  });

  it('keeps the loaded page and its rows when details fail, then returns to that page', async () => {
    detailError = true;
    renderReceipts();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Trang sau' });
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-21' });
    await user.click(
      screen.getByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    );

    expect(
      await screen.findByText(
        'Không thể tải chi tiết lần nhập hàng. Vui lòng thử lại.',
      ),
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-21' }),
    ).toBeTruthy();
    expectReceiptPage(2);
    expect(
      calls.filter((call) => call.path === '/inventory/receipts?page=2&limit=20'),
    ).toHaveLength(1);
    expectReadOnlyReceiptRequests();
  });
});
