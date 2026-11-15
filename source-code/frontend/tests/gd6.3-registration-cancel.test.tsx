import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';

import type { CalendarData, Registration, User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm thử',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};
const registration: Registration = {
  ma_dang_ky: '55555555-5555-4555-8555-555555555555',
  ngay: '2026-11-09',
  gio_bat_dau: '07:00',
  gio_ket_thuc: '12:00',
  loai_dang_ky: 'Mong muốn',
};

let calendarData: CalendarData;
let calls: { path: string; method: string }[];
let deleteError: string | null;
let scheduleReads: number;

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status >= 400
        ? { error: { code: 'REGISTRATION_ERROR', message: data } }
        : { data },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T07:00:00Z'));
  sessionStorage.clear();
  location.hash = '/schedule';
  calendarData = { shifts: [], registrations: [registration] };
  calls = [];
  deleteError = null;
  scheduleReads = 0;
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      const method = options.method ?? 'GET';
      calls.push({ path, method });
      if (path === '/auth/me') return response(employee);
      if (path === '/shifts' && method === 'GET') {
        scheduleReads += 1;
        return response(calendarData);
      }
      if (
        path === `/shifts/availability/${registration.ma_dang_ky}` &&
        method === 'DELETE'
      ) {
        if (deleteError) return response(deleteError, 409);
        calendarData = { shifts: [], registrations: [] };
        return response({});
      }
      return response([]);
    }),
  );
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GD6.3 chi tiết và hủy đăng ký', () => {
  it.each(['Rảnh', 'Mong muốn'] as const)(
    'shows only the registration date, times, and %s status in its details',
    async (status) => {
      calendarData = {
        shifts: [],
        registrations: [{ ...registration, loai_dang_ky: status }],
      };
      const user = userEvent.setup();
      render(<App />);

      await user.click(
        await screen.findByRole('button', { name: /07:00–12:00/ }),
      );
      const details = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });
      expect(within(details).getByText('09/11/2026')).toBeTruthy();
      expect(within(details).getByText('07:00')).toBeTruthy();
      expect(within(details).getByText('12:00')).toBeTruthy();
      expect(within(details).getByText(status)).toBeTruthy();
      expect(within(details).queryByText(/phân công|chốt lịch/i)).toBeNull();
      expect(
        within(details).queryByRole('button', { name: 'Đổi hoặc xoay ca' }),
      ).toBeNull();
    },
  );

  it('opens confirmation and “Không” closes only that dialog without calling DELETE', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /07:00–12:00/ }));
    const details = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });

    await user.click(within(details).getByRole('button', { name: 'Hủy' }));
    const confirmation = screen.getByRole('dialog', {
      name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
    });
    await user.click(within(confirmation).getByRole('button', { name: 'Không' }));

    expect(
      screen.getByRole('dialog', { name: 'Thông tin đăng ký' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('dialog', {
        name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
      }),
    ).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('sends DELETE for the registration id, refreshes the schedule, closes, and notices success', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /07:00–12:00/ }));
    const details = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });
    await user.click(within(details).getByRole('button', { name: 'Hủy' }));
    const confirmation = screen.getByRole('dialog', {
      name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
    });

    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );

    expect(
      (await screen.findByRole('status')).textContent,
    ).toContain('Hủy đăng ký thành công');
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-employee-shift-success',
    );
    await waitFor(() => expect(scheduleReads).toBeGreaterThanOrEqual(2));
    expect(calls).toContainEqual({
      path: `/shifts/availability/${registration.ma_dang_ky}`,
      method: 'DELETE',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Thông tin đăng ký' }),
    ).toBeNull();
    expect(
      screen.queryByRole('dialog', {
        name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
      }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /07:00–12:00/ })).toBeNull();
    expect(location.hash).toBe('#/schedule');
  });

  it('keeps the registration on API failure and shows the API message on the schedule', async () => {
    const user = userEvent.setup();
    deleteError =
      'Đăng ký đã được dùng để phân công ca, không thể hủy đăng ký.';
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /07:00–12:00/ }));
    const details = screen.getByRole('dialog', { name: 'Thông tin đăng ký' });
    await user.click(within(details).getByRole('button', { name: 'Hủy' }));
    const confirmation = screen.getByRole('dialog', {
      name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
    });

    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      deleteError,
    );
    expect(screen.queryByText('Hủy đăng ký thành công')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Thông tin đăng ký' })).toBeNull();
    expect(screen.queryByRole('dialog', {
      name: 'Bạn có chắc chắn muốn hủy đăng ký này không?',
    })).toBeNull();
    expect(screen.getByRole('button', { name: /07:00–12:00/ })).toBeTruthy();
    expect(location.hash).toBe('#/schedule');
  });
});
