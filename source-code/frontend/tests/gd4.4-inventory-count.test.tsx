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
import { addDays, today } from '../src/app/format';
import { RouterProvider } from '../src/app/router';
import CountPage from '../src/features/inventory/CountPage';
import { NoticeProvider } from '../src/components/ui';
import type {
  CalendarData,
  ClosingReport,
  CountPreview,
  Material,
  Shift,
  User,
} from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm kê',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};
const material: Material = {
  ma_nguyen_lieu: '66666666-6666-4666-8666-666666666666',
  ten_nguyen_lieu: 'Cà phê hạt',
  don_vi_tinh: 'kg',
  ton_ly_thuyet: 10,
  muc_ton_toi_thieu: 2,
  nguong_chenh_lech: 0.1,
  trang_thai: 'Bình thường',
};
const countId = '77777777-7777-4777-8777-777777777777';
const reportId = '88888888-8888-4888-8888-888888888888';

function makeShift(
  id: string,
  date: string,
  start = '07:00',
  end = '12:00',
): Shift {
  return {
    ma_ca: id,
    ngay_lam: date,
    gio_bat_dau: start,
    gio_ket_thuc: end,
    so_nhan_vien_toi_thieu: 1,
    so_nhan_vien_toi_da: 3,
    nhan_vien: [
      { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
    ],
    thieu_nhan_vien: false,
  };
}

function response(
  data: unknown,
  status = 200,
  message = 'Tạm thời không thể xử lý.',
) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data }
        : { error: { code: 'TEST_ERROR', message } },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

class TestEventSource {
  addEventListener() {}
  close() {}
}

function CountHarness() {
  const { user, ready } = useSession();
  if (!ready || !user) return <p role="status">Đang tải phiên đăng nhập…</p>;
  return (
    <DataProvider>
      <RouterProvider>
        <NoticeProvider>
          <CountPage />
        </NoticeProvider>
      </RouterProvider>
    </DataProvider>
  );
}

let shifts: Shift[] = [];
let reports: ClosingReport[] = [];
let threshold = 0.1;
let previewItems: CountPreview['items'] = [{
  ...material,
  nguong_chenh_lech: 0.1,
}];
let previewError = '';
let calendarError = '';
let countFailures = 0;
let closeReportFailures = 0;
let heldPreview: Promise<Response> | null = null;
let resolveHeldPreview: ((value: Response) => void) | null = null;
let calls: {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  key?: string;
}[] = [];
let countCreates = 0;
let countResults = new Map<string, string>();
let latestReport: ClosingReport | null = null;
let fetchMock: ReturnType<typeof vi.fn>;

function makeReport(body: Record<string, unknown>): ClosingReport {
  return {
    ma_bao_cao: reportId,
    ma_phieu: countId,
    ma_ca: String(body.ma_ca),
    ngay_kiem_ke: today(),
    ngay_lam: shifts.find((shift) => shift.ma_ca === body.ma_ca)?.ngay_lam,
    gio_bat_dau: '07:00',
    gio_ket_thuc: '12:00',
    ho_ten_nguoi_lap: employee.ho_ten,
    doanh_thu_ca_luc_doi_chieu: 10000,
    tien_mat_thuc_thu: Number(body.tien_mat_thuc_thu),
    chuyen_khoan_thuc_thu: Number(body.chuyen_khoan_thuc_thu),
    ly_do_chenh_lech_tien: body.ly_do_chenh_lech_tien as string | undefined,
    trang_thai: 'Nháp',
    items: [
      {
        ma_nguyen_lieu: material.ma_nguyen_lieu,
        ten_nguyen_lieu: material.ten_nguyen_lieu,
        don_vi_tinh: material.don_vi_tinh,
        ton_thuc_te: Number(
          (body.items as { ton_thuc_te: number }[])[0].ton_thuc_te,
        ),
        chenh_lech: 0,
      },
    ],
  };
}

beforeEach(() => {
  location.hash = '#/count';
  sessionStorage.clear();
  shifts = [
    makeShift(
      '44444444-4444-4444-8444-444444444444',
      addDays(today(), -1),
    ),
    makeShift(
      '55555555-5555-4555-8555-555555555555',
      addDays(today(), -2),
      '12:00',
      '17:00',
    ),
  ];
  reports = [];
  threshold = 0.1;
  previewItems = [{ ...material, nguong_chenh_lech: 0.1 }];
  previewError = '';
  calendarError = '';
  countFailures = 0;
  closeReportFailures = 0;
  heldPreview = null;
  resolveHeldPreview = null;
  calls = [];
  countCreates = 0;
  countResults = new Map();
  latestReport = null;
  vi.stubGlobal('EventSource', TestEventSource);
  vi.stubGlobal('scrollTo', vi.fn());
  fetchMock = vi.fn(async (input: string, options: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = options.method ?? 'GET';
    const body = options.body
      ? (JSON.parse(String(options.body)) as Record<string, unknown>)
      : undefined;
    const key = new Headers(options.headers).get('Idempotency-Key') ?? undefined;
    calls.push({
      path: url.pathname + url.search,
      method,
      body,
      key,
    });

    if (url.pathname === '/api/auth/me') return response(employee);
    if (url.pathname === '/api/shifts' && method === 'GET') {
      if (calendarError)
        return response(null, 503, calendarError);
      const data: CalendarData = { shifts, registrations: [] };
      return response(data);
    }
    if (
      url.pathname === '/api/inventory/close-reports' &&
      method === 'GET'
    )
      return response(reports);
    if (url.pathname === '/api/inventory/counts/preview' && method === 'GET') {
      if (heldPreview) return heldPreview;
      if (previewError) return response(null, 503, previewError);
      const data: CountPreview = {
        ma_ca: url.searchParams.get('ma_ca') ?? '',
        doanh_thu: 10000,
        items: previewItems.map((item) => ({
          ...item,
          nguong_chenh_lech: threshold,
        })),
      };
      return response(data);
    }
    if (url.pathname === '/api/inventory/counts' && method === 'POST') {
      const requestKey = key ?? '';
      let resultId = countResults.get(requestKey);
      if (!resultId) {
        resultId = countId;
        countResults.set(requestKey, resultId);
        countCreates += 1;
      }
      if (countFailures > 0) {
        countFailures -= 1;
        return response(null, 503, 'Không lưu được phiếu kiểm kho.');
      }
      return response({ ma_phieu: resultId });
    }
    if (
      url.pathname === '/api/inventory/close-reports' &&
      method === 'POST'
    ) {
      if (closeReportFailures > 0) {
        closeReportFailures -= 1;
        return response(null, 503, 'Không lưu được báo cáo kiểm kho.');
      }
      const count = calls.find(
        (call) =>
          call.path === '/api/inventory/counts' && call.method === 'POST',
      );
      latestReport = makeReport(count?.body ?? {});
      reports = [latestReport];
      return response(latestReport);
    }
    if (
      url.pathname === `/api/inventory/close-reports/${reportId}` &&
      method === 'GET'
    )
      return response(latestReport);
    return response(null, 404, 'Không tìm thấy fixture API.');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCount() {
  location.hash = '#/count';
  return render(
    <SessionProvider>
      <CountHarness />
    </SessionProvider>,
  );
}

async function waitForCountTable() {
  return screen.findByRole('table');
}

async function enterValidCount(
  user: ReturnType<typeof userEvent.setup>,
  options: { cash?: string; actual?: string } = {},
) {
  await user.type(
    await screen.findByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
    options.cash ?? '10000',
  );
  await user.type(
    screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }),
    '0',
  );
  await user.type(
    screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
    options.actual ?? '10',
  );
}

async function reconcile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Đối chiếu' }));
}

describe('GD4.4 inventory count', () => {
  it('loads ended shifts and fetches the preview for the selected shift', async () => {
    renderCount();
    await waitForCountTable();
    const shiftSelect = screen.getByRole('combobox', { name: 'Ca' });
    expect((shiftSelect as HTMLSelectElement).value).toBe(shifts[0].ma_ca);

    const user = userEvent.setup();
    await user.selectOptions(shiftSelect, shifts[1].ma_ca);
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path ===
            `/api/inventory/counts/preview?ma_ca=${shifts[1].ma_ca}` &&
            call.method === 'GET',
        ),
      ).toBe(true),
    );
    expect(
      calls.every(
        (call) =>
          call.method === 'GET' ||
          (call.method === 'POST' &&
            (call.path === '/api/inventory/counts' ||
              call.path === '/api/inventory/close-reports')),
      ),
    ).toBe(true);
    expect(
      calls.some((call) => call.path.includes('/inventory/counts/preview')),
    ).toBe(true);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('paginates the inventory list at six rows per page', async () => {
    previewItems = Array.from({ length: 13 }, (_, index) => ({
      ...material,
      ma_nguyen_lieu: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      ten_nguyen_lieu: `Nguyên liệu ${index + 1}`,
      don_vi_tinh: index % 2 === 0 ? 'kg' : 'chai',
      ton_ly_thuyet: 10 + index,
    }));
    renderCount();
    const user = userEvent.setup();
    await waitForCountTable();
    expect(screen.getByRole('spinbutton', { name: 'Tồn thực tế Nguyên liệu 1' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'Tồn thực tế Nguyên liệu 7' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(screen.getByRole('spinbutton', { name: 'Tồn thực tế Nguyên liệu 7' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: 'Tồn thực tế Nguyên liệu 1' })).toBeNull();
  });

  it('keeps preview loading distinct from empty data and presents retry on error', async () => {
    heldPreview = new Promise<Response>((resolve) => {
      resolveHeldPreview = resolve;
    });
    renderCount();
    expect(await screen.findByText('Đang tải dữ liệu kiểm kê')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Chưa có dữ liệu đối chiếu.')).toBeNull();

    resolveHeldPreview?.(response(null, 503, 'Không thể tải dữ liệu kiểm kê.'));
    heldPreview = null;
    expect(
      await screen.findByText('Không thể tải dữ liệu kiểm kê.'),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();

    previewError = '';
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitForCountTable();
    expect(screen.queryByText('Không thể tải dữ liệu kiểm kê.')).toBeNull();
  });

  it('validates money and quantity limits against the API constraints', async () => {
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '100000000000000',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }),
      '0',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
      '100000000000',
    );
    await reconcile(user);

    expect(
      await screen.findByText('Tiền thực thu vượt quá giới hạn cho phép.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tồn thực tế phải là số không âm, tối đa 3 chữ số thập phân.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }).getAttribute(
        'aria-invalid',
      ),
    ).toBe('true');
    expect(
      screen.getByRole('spinbutton', {
        name: 'Tồn thực tế Cà phê hạt',
      }).getAttribute('aria-invalid'),
    ).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('requires integer money, three-decimal quantities, and only flags stock differences above the threshold', async () => {
    threshold = 1;
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '1.5',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Chuyển khoản thực thu' }),
      '0',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
      '10.1234',
    );
    await reconcile(user);
    expect(
      await screen.findByText('Tiền thực thu phải là số nguyên không âm.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tồn thực tế phải là số không âm, tối đa 3 chữ số thập phân.',
      ),
    ).toBeTruthy();

    await user.clear(screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }));
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '-1',
    );
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
      '-0.1',
    );
    await reconcile(user);
    expect(
      await screen.findByText('Tiền thực thu phải là số nguyên không âm.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tồn thực tế phải là số không âm, tối đa 3 chữ số thập phân.',
      ),
    ).toBeTruthy();

    await user.clear(screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }));
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tiền mặt thực thu' }),
      '10001',
    );
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
      '11',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Lý do chênh lệch tiền' }),
      'Đối chiếu tiền',
    );
    await reconcile(user);
    expect(
      await screen.findByText('Đã đối chiếu tiền thực thu và tồn thực tế.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', {
        name: 'Lý do chênh lệch Cà phê hạt',
      }).getAttribute('aria-invalid'),
    ).toBe('false');
  });

  it('requires a stock reason only above the threshold and sends the matching payload', async () => {
    threshold = 1;
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await enterValidCount(user, { cash: '10001', actual: '11' });
    await user.type(
      screen.getByRole('textbox', { name: 'Lý do chênh lệch tiền' }),
      'Đối chiếu tiền',
    );
    await reconcile(user);
    expect(
      await screen.findByText('Đã đối chiếu tiền thực thu và tồn thực tế.'),
    ).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Lý do chênh lệch Cà phê hạt',
      }),
      'Hao hụt',
    );
    await reconcile(user);
    expect(
      await screen.findByText(
        'Nguyên liệu khớp không cần lý do chênh lệch.',
      ),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Lý do chênh lệch Cà phê hạt',
      }),
      '',
    );
    await user.clear(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Tồn thực tế Cà phê hạt' }),
      '11.001',
    );
    await reconcile(user);
    expect(
      await screen.findByText(
        'Vui lòng chọn lý do chênh lệch cho nguyên liệu Cà phê hạt.',
      ),
    ).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Lý do chênh lệch Cà phê hạt',
      }),
      'Hao hụt',
    );
    await reconcile(user);
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByRole('dialog', { name: 'Báo cáo cuối ca' });
    expect(
      screen.getByText('Lưu phiếu kiểm kho thành công.').closest('[role="status"]')
        ?.className,
    ).toContain(
      'ui-notice-inventory-success',
    );

    const countCall = calls.find(
      (call) => call.path === '/api/inventory/counts' && call.method === 'POST',
    );
    expect(countCall?.body).toMatchObject({
      ma_ca: shifts[0].ma_ca,
      tien_mat_thuc_thu: 10001,
      chuyen_khoan_thuc_thu: 0,
      ly_do_chenh_lech_tien: 'Đối chiếu tiền',
      items: [
        {
          ma_nguyen_lieu: material.ma_nguyen_lieu,
          ton_ly_thuyet: 10,
          ton_thuc_te: 11.001,
          ly_do_chenh_lech: 'Hao hụt',
        },
      ],
    });
    expect(countCall?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      calls.filter((call) => call.method === 'POST').map((call) => call.path),
    ).toEqual([
      '/api/inventory/counts',
      '/api/inventory/close-reports',
    ]);
    expect(
      calls.find(
        (call) =>
          call.path === '/api/inventory/close-reports' &&
          call.method === 'POST',
      )?.body,
    ).toEqual({ ma_phieu: countId });
  });

  it('requires a note for Other and requires reconciliation again after edits', async () => {
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await enterValidCount(user, { actual: '10.5' });
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Lý do chênh lệch Cà phê hạt',
      }),
      'Khác',
    );
    await reconcile(user);
    expect(
      await screen.findByText('Vui lòng nhập ghi chú cho lý do Khác.'),
    ).toBeTruthy();

    const note = screen.getByRole('textbox', { name: 'Ghi chú Cà phê hạt' });
    expect(screen.getByText('Ghi chú:')).toBeTruthy();
    await user.type(note, 'Đã kiểm tra lại');
    await reconcile(user);
    expect(
      await screen.findByText('Đã đối chiếu tiền thực thu và tồn thực tế.'),
    ).toBeTruthy();
    await user.type(note, ' - cập nhật');
    expect(await screen.findByText('Vui lòng đối chiếu lại.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await reconcile(user);
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByRole('dialog', { name: 'Báo cáo cuối ca' });

    expect(
      calls.find(
        (call) =>
          call.path === '/api/inventory/counts' && call.method === 'POST',
      )?.body?.items,
    ).toEqual([
      {
        ma_nguyen_lieu: material.ma_nguyen_lieu,
        ton_ly_thuyet: 10,
        ton_thuc_te: 10.5,
        ly_do_chenh_lech: 'Khác',
        ghi_chu: 'Đã kiểm tra lại - cập nhật',
      },
    ]);
  });

  it('preserves the pending count and does not create a duplicate when report saving is retried', async () => {
    closeReportFailures = 1;
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await enterValidCount(user);
    await reconcile(user);
    await screen.findByText('Tiền thực thu và tồn thực tế đều khớp.');
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    expect(
      await screen.findByText('Không lưu được báo cáo kiểm kho.'),
    ).toBeTruthy();
    expect(
      JSON.parse(
        sessionStorage.getItem(
          'me-cafe-pending-count:' + employee.ma_nguoi_dung,
        ) ?? 'null',
      ).countId,
    ).toBe(countId);

    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByRole('dialog', { name: 'Báo cáo cuối ca' });
    expect(
      calls.filter(
        (call) =>
          call.path === '/api/inventory/counts' && call.method === 'POST',
      ),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (call) =>
          call.path === '/api/inventory/close-reports' &&
          call.method === 'POST',
      ),
    ).toHaveLength(2);
    expect(
      sessionStorage.getItem(
        'me-cafe-pending-count:' + employee.ma_nguoi_dung,
      ),
    ).toBeNull();
  });

  it('retries an uncertain count POST with the same idempotency key', async () => {
    countFailures = 1;
    renderCount();
    await waitForCountTable();
    const user = userEvent.setup();
    await enterValidCount(user);
    await reconcile(user);
    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    expect(
      await screen.findByText('Không lưu được phiếu kiểm kho.'),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Lưu phiếu kiểm kho' }),
    );
    await screen.findByRole('dialog', { name: 'Báo cáo cuối ca' });
    const countCalls = calls.filter(
      (call) => call.path === '/api/inventory/counts' && call.method === 'POST',
    );
    expect(countCalls).toHaveLength(2);
    expect(countCalls[0].key).toBe(countCalls[1].key);
    expect(countCreates).toBe(1);
    expect(
      calls.filter(
        (call) =>
          call.path === '/api/inventory/close-reports' &&
          call.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('shows the completed-shift empty state when all ended shifts already have counts', async () => {
    reports = [
      {
        ma_bao_cao: reportId,
        ma_phieu: countId,
        ma_ca: shifts[0].ma_ca,
      } as ClosingReport,
      {
        ma_bao_cao: '99999999-9999-4999-8999-999999999999',
        ma_phieu: countId,
        ma_ca: shifts[1].ma_ca,
      } as ClosingReport,
    ];
    renderCount();
    expect(
      await screen.findByText('Ca này đã có phiếu kiểm kho.'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Báo cáo cuối ca' }),
    ).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      calls.some((call) => call.path.includes('/inventory/counts/preview')),
    ).toBe(false);
  });

  it('shows calendar API errors with a retry action rather than an empty state', async () => {
    calendarError = 'Không thể tải danh sách ca.';
    renderCount();
    expect(
      await screen.findByText('Không thể tải danh sách ca.'),
    ).toBeTruthy();
    expect(screen.queryByText('Chưa có ca làm đã kết thúc cần kiểm kê.')).toBeNull();

    calendarError = '';
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitForCountTable();
    expect(screen.queryByText('Không thể tải danh sách ca.')).toBeNull();
  });
});
