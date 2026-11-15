import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';
import { addDays, dateText, today } from '../src/app/format';
import type { CalendarData, Shift, User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm thử',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};

const coworker = {
  ma_nhan_vien: '33333333-3333-4333-8333-333333333333',
  ho_ten: 'Đồng nghiệp kiểm thử',
};

const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(status >= 400 ? { error: { message: data } } : { data }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );

let calendarData: CalendarData;
let calls: { path: string; method: string }[];

function makeShift(date: string, staff = [coworker]): Shift {
  return {
    ma_ca: '44444444-4444-4444-8444-444444444444',
    ngay_lam: date,
    gio_bat_dau: '07:00:00',
    gio_ket_thuc: '12:00:00',
    so_nhan_vien_toi_thieu: 1,
    so_nhan_vien_toi_da: 3,
    nhan_vien: [
      { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
      ...staff,
    ],
    thieu_nhan_vien: false,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(
    Date.parse('2026-11-09T07:00:00Z'),
  );
  location.hash = '/schedule';
  calendarData = { shifts: [], registrations: [] };
  calls = [];
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
      if (path === '/shifts') return response(calendarData);
      if (path === '/shifts/co-workers') return response([]);
      return response([]);
    }),
  );
});

afterEach(() => {
  cleanup();
  location.hash = '/';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GD6 employee shift details', () => {
  it('opens from a shift card and shows formatted details without the current employee', async () => {
    const shiftDate = addDays(today(), 1);
    calendarData.shifts = [makeShift(shiftDate)];
    render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /07:00–12:00/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
    expect(within(dialog).getByText('Ngày làm')).toBeTruthy();
    expect(within(dialog).getByText(dateText(shiftDate))).toBeTruthy();
    expect(within(dialog).getByText('Giờ bắt đầu')).toBeTruthy();
    expect(within(dialog).getByText('07:00')).toBeTruthy();
    expect(within(dialog).getByText('Giờ kết thúc')).toBeTruthy();
    expect(within(dialog).getByText('12:00')).toBeTruthy();
    expect(within(dialog).getByText(coworker.ho_ten)).toBeTruthy();
    expect(within(dialog).queryByText(employee.ho_ten)).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Đóng' }),
    ).toBeTruthy();
  });

  it('shows an em dash when the current employee is the only assigned staff member', async () => {
    calendarData.shifts = [makeShift(today(), [])];
    render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /07:00–12:00/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
    expect(within(dialog).getByText('—')).toBeTruthy();
    expect(within(dialog).queryByText(employee.ho_ten)).toBeNull();
  });

  it('closes with Hủy without sending a change request', async () => {
    calendarData.shifts = [makeShift(today())];
    render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /07:00–12:00/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    expect(
      screen.queryByRole('dialog', { name: 'Thông tin ca làm' }),
    ).toBeNull();
    expect(calls.some((call) => call.method !== 'GET')).toBe(false);
  });

  it('continues to open the existing shift change form for a future shift', async () => {
    calendarData.shifts = [makeShift(addDays(today(), 1))];
    render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /07:00–12:00/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Đổi hoặc xoay ca' }),
    );

    const changeDialog = await screen.findByRole('dialog', {
      name: 'Gửi yêu cầu đổi hoặc xoay ca',
    });
    expect(within(changeDialog).getAllByRole('radio')).toHaveLength(2);
    await waitFor(() =>
      expect(calls).toContainEqual({
        path: '/shifts/co-workers',
        method: 'GET',
      }),
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('keeps the shift change button disabled after the shift has started', async () => {
    calendarData.shifts = [makeShift(today())];
    render(<App />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: /07:00–12:00/ }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
    const changeButton = within(dialog).getByRole('button', {
      name: 'Đổi hoặc xoay ca',
    });
    expect(changeButton.hasAttribute('disabled')).toBe(true);
    expect(
      calls.some((call) => call.path === '/shifts/co-workers'),
    ).toBe(false);
  });
});
