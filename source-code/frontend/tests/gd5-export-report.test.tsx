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
import type { User } from '../src/services/models';

const manager: User = {
  ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
  ten_dang_nhap: 'quanly',
  ho_ten: 'Quản lý báo cáo',
  so_dien_thoai: '0900000001',
  vai_tro: 'Quản lý',
  trang_thai: 'Đang hoạt động',
};

const revenueWithData = {
  doanh_thu: '9250000',
  so_ly: '185',
  tien_mat: '3550000',
  chuyen_khoan: '5700000',
  items: [{ ngay: '2026-11-12' }],
};

const revenueEmpty = {
  doanh_thu: '0',
  so_ly: '0',
  tien_mat: '0',
  chuyen_khoan: '0',
  items: [],
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

let downloadCalls: Array<{ url: string }> = [];
let exportFailuresRemaining = 0;
let reportReadFailuresRemaining = 0;
let reportReadCalls = 0;
let reportReadPending = false;
let releaseReportRead: (() => void) | null = null;
let exportRevenue = revenueWithData;

beforeEach(() => {
  downloadCalls = [];
  exportFailuresRemaining = 0;
  reportReadFailuresRemaining = 0;
  reportReadCalls = 0;
  reportReadPending = false;
  releaseReportRead = null;
  exportRevenue = revenueWithData;
  vi.stubGlobal('EventSource', TestEventSource);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return response(manager);
      if (path === '/reports/revenue') {
        if (!url.searchParams.has('method')) {
          reportReadCalls += 1;
          if (reportReadPending) {
            await new Promise<void>((resolve) => {
              releaseReportRead = resolve;
            });
          }
          if (reportReadFailuresRemaining > 0) {
            reportReadFailuresRemaining -= 1;
            return response('Lỗi đọc báo cáo tạm thời.', 503);
          }
        }
        return response(exportRevenue);
      }
      if (path === '/reports/revenue/export') {
        downloadCalls.push({ url: url.toString() });
        if (exportFailuresRemaining > 0) {
          exportFailuresRemaining -= 1;
          return response('Không có dữ liệu báo cáo để xuất.', 422);
        }
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }
      return response('Không tìm thấy fixture API.', 404);
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

async function openExportDialog() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Xuất báo cáo' }),
    ).toBeTruthy(),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

async function openExportDialogWhenEmpty() {
  await waitFor(() =>
    expect(
      screen.getByText(
        'Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!',
      ),
    ).toBeTruthy(),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Xuất báo cáo' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

describe('GD5.3 xuất báo cáo', () => {
  it('xuất Excel (mặc định) không gửi method', async () => {
    renderReports();
    await openExportDialog();

    const dialog = screen.getByRole('dialog');
    await userEvent.setup().click(
      within(dialog).getByRole('radio', { name: 'Excel' }),
    );
    expect(
      within(dialog).getByRole('radio', { name: 'Excel' }),
    ).toHaveProperty('checked', true);

    await userEvent.setup().click(
      within(dialog).getByRole('button', { name: 'Xác nhận' }),
    );
    await waitFor(() => expect(downloadCalls.length).toBe(1));

    const url = new URL(downloadCalls[0].url);
    expect(url.searchParams.get('period')).toBe('day');
    expect(url.searchParams.get('format')).toBe('xlsx');
    expect(url.searchParams.has('method')).toBe(false);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const toasts = screen.getAllByText('Xuất file thành công');
    expect(toasts).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('Xuất file thành công')).toBeTruthy());
  });

  it('xuất PDF với format pdf', async () => {
    renderReports();
    await openExportDialog();

    const dialog = screen.getByRole('dialog');
    await userEvent.setup().click(
      within(dialog).getByRole('radio', { name: 'PDF' }),
    );
    expect(
      within(dialog).getByRole('radio', { name: 'PDF' }),
    ).toHaveProperty('checked', true);

    await userEvent.setup().click(
      within(dialog).getByRole('button', { name: 'Xác nhận' }),
    );
    await waitFor(() => expect(downloadCalls.length).toBe(1));

    const url = new URL(downloadCalls[0].url);
    expect(url.searchParams.get('format')).toBe('pdf');
    expect(url.searchParams.has('method')).toBe(false);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const toasts = screen.getAllByText('Xuất file thành công');
    expect(toasts).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('Xuất file thành công')).toBeTruthy());
  });

  it('giữ xem trước số 0, cảnh báo và nút xác nhận bị khóa khi rỗng', async () => {
    exportRevenue = revenueEmpty;
    renderReports();
    await openExportDialogWhenEmpty();

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Không có dữ liệu trong khoảng thời gian đã chọn để xuất file!',
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText('Khoảng thời gian báo cáo')).toBeTruthy();
    expect(within(dialog).getByText('Tổng doanh thu')).toBeTruthy();
    expect(within(dialog).getByText('Số ly bán ra')).toBeTruthy();
    expect(within(dialog).getByText('Tiền mặt')).toBeTruthy();
    expect(within(dialog).getByText('Chuyển khoản')).toBeTruthy();
    expect(within(dialog).getAllByText('0 đ')).toHaveLength(3);
    expect(within(dialog).getByText('0')).toBeTruthy();
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Xác nhận',
    });
    expect(confirmButton).toHaveProperty('disabled', true);
    await userEvent.setup().click(confirmButton);
    expect(downloadCalls).toHaveLength(0);

    await userEvent.setup().click(
      within(dialog).getByRole('button', { name: 'Đóng' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('hiển thị trạng thái đang tải trong hộp thoại và khóa xuất đến khi có dữ liệu', async () => {
    reportReadPending = true;
    renderReports();
    await waitFor(() => expect(reportReadCalls).toBe(1));

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Xuất báo cáo' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('status').textContent,
    ).toContain('Đang tải dữ liệu báo cáo');
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận' }),
    ).toHaveProperty('disabled', true);
    expect(
      within(dialog).queryByText(
        'Không có dữ liệu trong khoảng thời gian đã chọn để xuất file!',
      ),
    ).toBeNull();

    reportReadPending = false;
    releaseReportRead?.();
    await waitFor(() =>
      expect(within(dialog).getByText('Khoảng thời gian báo cáo')).toBeTruthy(),
    );
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận' }),
    ).toHaveProperty('disabled', false);
  });

  it('hiển thị lỗi đọc báo cáo trước khi xuất và cho tải lại dữ liệu', async () => {
    reportReadFailuresRemaining = 1;
    renderReports();
    await screen.findByRole('alert');
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Xuất báo cáo' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Không thể tải dữ liệu báo cáo doanh thu',
    );
    expect(
      within(dialog).queryByText(
        'Không có dữ liệu trong khoảng thời gian đã chọn để xuất file!',
      ),
    ).toBeNull();
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Xác nhận',
    });
    expect(confirmButton).toHaveProperty('disabled', true);
    expect(reportReadCalls).toBe(1);

    await userEvent.setup().click(
      within(dialog).getByRole('button', {
        name: 'Tải lại dữ liệu báo cáo',
      }),
    );
    await waitFor(() => expect(reportReadCalls).toBe(2));
    await waitFor(() =>
      expect(within(dialog).getByText('Khoảng thời gian báo cáo')).toBeTruthy(),
    );
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(confirmButton).toHaveProperty('disabled', false);
    expect(downloadCalls).toHaveLength(0);
  });

  it('thử lại sau 422 ngay trong modal và chỉ hiển thị một toast khi thành công', async () => {
    exportFailuresRemaining = 1;
    renderReports();
    await openExportDialog();

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Xác nhận',
    });
    await userEvent.setup().click(
      confirmButton,
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole('alert'),
      ).toBeTruthy(),
    );

    expect(downloadCalls).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(confirmButton).toHaveProperty('disabled', false);
    expect(screen.queryByText('Xuất file thành công')).toBeNull();

    await userEvent.setup().click(confirmButton);
    await waitFor(() => expect(downloadCalls).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByText('Xuất file thành công')).toHaveLength(1);
  });

  it('luồng GD5.1/GD5.2 vẫn hoạt động: xem báo cáo và chọn phương thức', async () => {
    renderReports();
    await waitFor(() =>
      expect(screen.getAllByText('9.250.000 đ').length).toBeGreaterThan(0),
    );
    expect(screen.getByText('185')).toBeTruthy();

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Chuyển khoản' }),
    );
    expect(
      screen.getAllByText('9.250.000 đ').length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('185')).toBeTruthy();
  });
});
