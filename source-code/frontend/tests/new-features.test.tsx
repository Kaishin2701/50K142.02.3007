import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataProvider } from '../src/app/data';
import { NoticeProvider } from '../src/components/ui';
import InventoryPage from '../src/features/inventory/InventoryPage';
import PreparationTicketButton from '../src/features/orders/PreparationTicketButton';

const materialId = '66666666-6666-4666-8666-666666666666';
const orderId = '88888888-8888-4888-8888-888888888888';

const material = {
  ma_nguyen_lieu: materialId,
  ten_nguyen_lieu: 'Cà phê hạt',
  don_vi_tinh: 'kg',
  ton_ly_thuyet: 10,
  ton_kha_dung: 9,
  muc_ton_toi_thieu: 2,
  nguong_chenh_lech: 0.1,
  trang_thai: 'Bình thường',
  dang_hoat_dong: true,
};
const ticket = {
  ma_don: orderId,
  ma_don_hien_thi: 'ME-000008',
  trang_thai_pha_che: 'Bắt đầu pha chế' as const,
  items: [{ ten_mon: 'Cà phê sữa từ API', so_luong: 2 }],
};

type Call = {
  path: string;
  method: string;
  body?: any;
  key?: string;
};
let calls: Call[];
let receiptRows: any[];
let ticketFailures: number;
let fetchMock: ReturnType<typeof vi.fn>;

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

function renderWithProviders(element: ReactNode) {
  return render(
    <NoticeProvider>
      <DataProvider>{element}</DataProvider>
    </NoticeProvider>,
  );
}

beforeEach(() => {
  calls = [];
  receiptRows = [];
  ticketFailures = 0;

  fetchMock = vi.fn(async (input: string, options: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    const headers = new Headers(options.headers);
    calls.push({
      path: path + url.search,
      method,
      body,
      key: headers.get('Idempotency-Key') ?? undefined,
    });

    if (path === '/inventory/materials' && method === 'GET')
      return response([material]);
    if (path === '/inventory/receipts' && method === 'GET') {
      return response(
        receiptRows.map((row) => ({ ...row, total: receiptRows.length })),
      );
    }
    if (path === `/orders/${orderId}/preparation-ticket`) {
      if (ticketFailures > 0) {
        ticketFailures--;
        return response(null, 500);
      }
      return response(ticket);
    }
    return response(null, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('inventory management and receipts', () => {
  it('lists material status without add or edit actions', async () => {
    renderWithProviders(<InventoryPage page="stock" />);
    const material = await screen.findByText('Cà phê hạt');
    const row = within(material.closest('tr')!);
    expect(row.getByText('Bình thường')).toBeTruthy();
    expect(row.queryByRole('button', { name: 'Sửa thông tin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm nguyên liệu' })).toBeNull();
  });

  it('shows receipt history without a create action or POST', async () => {
    receiptRows = [{
      ma_po: 'PO-01',
      ngay_nhap: '2026-11-05',
      ten_nha_cung_cap: 'Minh An',
      tong_tien: 100000,
      trang_thai_thanh_toan: 'Đã thanh toán',
      hinh_thuc_thanh_toan: 'Tiền mặt',
    }];
    renderWithProviders(<InventoryPage page="receipts" />);

    expect(await screen.findByRole('button', { name: 'Xem chi tiết phiếu PO-01' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Lịch sử nhập hàng' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Tạo phiếu nhập/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((call) => call.path === '/inventory/receipts' && call.method === 'POST')).toBe(false);
    expect(calls.filter((call) => call.path.startsWith('/inventory/receipts')).every((call) => call.method === 'GET')).toBe(true);
  });
});

describe('preparation tickets', () => {
  it('fetches and prints only the server ticket for paid orders; unpaid orders cannot fetch it', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <PreparationTicketButton orderId={orderId} paid={false} />,
    );
    expect(
      (screen.getByRole('button', { name: 'Phiếu pha chế' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      calls.some((call) => call.path === `/orders/${orderId}/preparation-ticket`),
    ).toBe(false);

    rerender(
      <NoticeProvider>
        <DataProvider>
          <PreparationTicketButton orderId={orderId} paid />
        </DataProvider>
      </NoticeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Phiếu pha chế' }));
    const dialog = await screen.findByRole('dialog', { name: 'Phiếu pha chế' });
    expect(await within(dialog).findByText('Cà phê sữa từ API')).toBeTruthy();
    expect(within(dialog).getByText('Mã đơn: ME-000008')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'In phiếu' }));
    expect(print).toHaveBeenCalledOnce();
    expect(
      calls.some(
        (call) =>
          call.path === `/orders/${orderId}/preparation-ticket` &&
          call.method === 'GET',
      ),
    ).toBe(true);
  });

  it('surfaces ticket errors and retries the same server endpoint', async () => {
    ticketFailures = 1;
    const user = userEvent.setup();
    renderWithProviders(
      <PreparationTicketButton orderId={orderId} paid />,
    );
    await user.click(screen.getByRole('button', { name: 'Phiếu pha chế' }));
    const dialog = await screen.findByRole('dialog', { name: 'Phiếu pha chế' });
    await within(dialog).findByRole('alert');
    await user.click(
      within(dialog).getByRole('button', { name: 'Thử tải lại' }),
    );
    await within(dialog).findByText('Cà phê sữa từ API');
    expect(
      calls.filter(
        (call) =>
          call.path === `/orders/${orderId}/preparation-ticket` &&
          call.method === 'GET',
      ),
    ).toHaveLength(2);
  });
});
