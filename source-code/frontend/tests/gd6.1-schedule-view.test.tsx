import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';
import { addDays, dateText, today, weekStart } from '../src/app/format';
import type { CalendarData, User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm thử',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};

let fetchCalendarError = false;
let delayCalendarResponse = false;
let releaseCalendarResponse: ((response: Response) => void) | null;
let calendarData: CalendarData;
let calls: string[];

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

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T07:00:00Z'));
  sessionStorage.clear();
  location.hash = '/schedule';
  fetchCalendarError = false;
  delayCalendarResponse = false;
  releaseCalendarResponse = null;
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
    vi.fn(async (input: string) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return response(employee);
      if (path === '/shifts') {
        calls.push(url.pathname + url.search);
        if (delayCalendarResponse) {
          return new Promise<Response>((resolve) => {
            releaseCalendarResponse = resolve;
          });
        }
        return fetchCalendarError
          ? response('Không thể tải lịch.', 500)
          : response(calendarData);
      }
      if (path === '/shifts/requests') return response([]);
      return response([]);
    }),
  );
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('GD6.1 employee weekly schedule', () => {
  it('loads the current week through the existing calendar endpoint', async () => {
    render(<App />);
    const start = weekStart(today());

    await screen.findByText('Thứ Hai');
    await waitFor(() =>
      expect(calls).toContain(
        `/api/shifts?from=${start}&to=${addDays(start, 6)}`,
      ),
    );
    expect(screen.getByText('09 – 15 tháng 11, 2026')).toBeTruthy();
    expect(screen.getByText('Thứ Ba')).toBeTruthy();
    expect(screen.getByText('Thứ Tư')).toBeTruthy();
    expect(screen.getByText('Thứ Năm')).toBeTruthy();
    expect(screen.getByText('Thứ Sáu')).toBeTruthy();
    expect(screen.getByText('Thứ Bảy')).toBeTruthy();
    expect(screen.getByText('Chủ Nhật')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /^Đăng ký/ }),
    ).toHaveLength(7);
  });

  it('moves backward and forward by one week', async () => {
    render(<App />);
    const user = userEvent.setup();
    const currentWeek = weekStart(today());
    await screen.findByText('Thứ Hai');

    await user.click(screen.getByRole('button', { name: 'Tuần trước' }));
    await waitFor(() =>
      expect(calls).toContain(
        `/api/shifts?from=${addDays(currentWeek, -7)}&to=${addDays(currentWeek, -1)}`,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Tuần sau' }));
    await waitFor(() =>
      expect(calls).toContain(
        `/api/shifts?from=${currentWeek}&to=${addDays(currentWeek, 6)}`,
      ),
    );
  });

  it('returns to the current week with the today control', async () => {
    render(<App />);
    const user = userEvent.setup();
    const currentWeek = weekStart(today());
    await screen.findByText('Thứ Hai');

    await user.click(screen.getByRole('button', { name: 'Tuần sau' }));
    await screen.findByText('16 – 22 tháng 11, 2026');
    await user.click(screen.getByRole('button', { name: 'Hôm nay' }));

    await waitFor(() =>
      expect(calls).toContain(
        `/api/shifts?from=${currentWeek}&to=${addDays(currentWeek, 6)}`,
      ),
    );
    expect(screen.getByText('09 – 15 tháng 11, 2026')).toBeTruthy();
  });

  it('shows the empty-week message only after an empty calendar loads', async () => {
    render(<App />);
    expect(
      await screen.findByText(
        'Chưa có lịch làm việc hoặc đăng ký trong tuần này',
      ),
    ).toBeTruthy();
  });

  it('does not show the empty state while the calendar is loading', async () => {
    delayCalendarResponse = true;
    render(<App />);

    expect(await screen.findByRole('status')).toBeTruthy();
    expect(
      screen.queryByText(
        'Chưa có lịch làm việc hoặc đăng ký trong tuần này',
      ),
    ).toBeNull();

    await waitFor(() => expect(releaseCalendarResponse).not.toBeNull());
    releaseCalendarResponse?.(response(calendarData));
    expect(
      await screen.findByText(
        'Chưa có lịch làm việc hoặc đăng ký trong tuần này',
      ),
    ).toBeTruthy();
  });

  it('does not show the empty state when registrations exist without shifts', async () => {
    calendarData = {
      shifts: [],
      registrations: [
        {
          ma_dang_ky: '55555555-5555-4555-8555-555555555555',
          ngay: weekStart(today()),
          gio_bat_dau: '10:00',
          gio_ket_thuc: '14:00',
          loai_dang_ky: 'Rảnh',
        },
      ],
    };
    render(<App />);

    expect(await screen.findByText('Rảnh')).toBeTruthy();
    expect(
      screen.queryByText(
        'Chưa có lịch làm việc hoặc đăng ký trong tuần này',
      ),
    ).toBeNull();
  });

  it('styles available and wanted registrations as distinct statuses', async () => {
    const date = weekStart(today());
    calendarData = {
    shifts: [],
    registrations: [
      {
        ma_dang_ky: '55555555-5555-4555-8555-555555555555',
        ngay: date,
        gio_bat_dau: '10:00',
        gio_ket_thuc: '14:00',
        loai_dang_ky: 'Rảnh',
      },
      {
        ma_dang_ky: '66666666-6666-4666-8666-666666666666',
        ngay: date,
        gio_bat_dau: '15:00',
        gio_ket_thuc: '18:00',
        loai_dang_ky: 'Mong muốn',
      },
    ],
    };
    render(<App />);

    expect(
      (await screen.findByText('Rảnh')).classList.contains('is-available'),
    ).toBe(true);
    expect(
      screen.getByText('Mong muốn').classList.contains('is-wanted'),
    ).toBe(true);
  });

  it('shows the backend-derived assignment state without guessing the close state', async () => {
    calendarData = {
      shifts: [],
      registrations: [
        {
          ma_dang_ky: '77777777-7777-4777-8777-777777777777',
          ngay: weekStart(today()),
          gio_bat_dau: '07:00',
          gio_ket_thuc: '12:00',
          loai_dang_ky: 'Mong muốn',
          da_phan_cong: true,
        },
      ],
    };
    render(<App />);

    expect(await screen.findByText('Đã phân công')).toBeTruthy();
    expect(screen.queryByText('Chưa chốt')).toBeNull();
    expect(screen.queryByText('Đã chốt')).toBeNull();
  });

  it('keeps a week with registrations out of the empty state and hides staffing data', async () => {
    const shiftDate = weekStart(today());
    calendarData = {
      shifts: [
        {
          ma_ca: '44444444-4444-4444-8444-444444444444',
          ngay_lam: shiftDate,
          gio_bat_dau: '07:00',
          gio_ket_thuc: '12:00',
          so_nhan_vien_toi_thieu: 1,
          so_nhan_vien_toi_da: 3,
          nhan_vien: [
            {
              ma_nhan_vien: employee.ma_nguoi_dung,
              ho_ten: employee.ho_ten,
            },
          ],
          thieu_nhan_vien: false,
        },
      ],
      registrations: [
        {
          ma_dang_ky: '55555555-5555-4555-8555-555555555555',
          ngay: addDays(shiftDate, 1),
          gio_bat_dau: '10:00',
          gio_ket_thuc: '14:00',
          loai_dang_ky: 'Rảnh',
        },
      ],
    };
    render(<App />);

    const shiftCard = await screen.findByRole('button', {
      name: /07:00–12:00/,
    });
    expect(shiftCard).toBeTruthy();
    expect(screen.getByText('Rảnh')).toBeTruthy();
    expect(
      screen.queryByText('Chưa có lịch làm việc hoặc đăng ký trong tuần này'),
    ).toBeNull();
    expect(screen.queryByText('Đủ nhân sự')).toBeNull();
    expect(screen.queryByText('Cần bổ sung')).toBeNull();
    expect(screen.queryByText(/nhân viên/)).toBeNull();
    expect(shiftCard.textContent).not.toContain(employee.ho_ten);
  });

  it('does not show the empty-week message when the calendar request fails', async () => {
    fetchCalendarError = true;
    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không thể tải lịch.',
    );
    expect(
      screen.queryByText(
        'Chưa có lịch làm việc hoặc đăng ký trong tuần này',
      ),
    ).toBeNull();
  });

  it('opens the availability form with the date of the selected day', async () => {
    render(<App />);
    const user = userEvent.setup();
    const selectedDate = addDays(weekStart(today()), 3);
    await screen.findByText('Thứ Hai');

    const dayButton = screen.getAllByRole('button', {
      name: /^Đăng ký/,
    })[3];
    expect(dayButton.getAttribute('aria-description')).toBe(
      `Ngày ${dateText(selectedDate)}`,
    );
    await user.click(dayButton);

    expect(
      (await screen.findByLabelText('Ngày', { exact: true }) as HTMLInputElement)
        .value,
    ).toBe(selectedDate);
  });
});
