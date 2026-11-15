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
import { DataProvider } from '../src/app/data';
import { NoticeProvider } from '../src/components/ui';
import { AvailabilityForm } from '../src/features/shifts/EmployeeShiftDialogs';
import { addDays, dateText, today } from '../src/app/format';
import type { User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm thử',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};

const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status >= 400 ? { error: { message: data } } : { data },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );

let calls: { path: string; method: string; body?: unknown }[];
let availabilityError: string | null;
let scheduleReads: number;

function installApi() {
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
      const body = options.body
        ? JSON.parse(String(options.body))
        : undefined;
      calls.push({ path, method, body });

      if (path === '/auth/me') return response(employee);
      if (path === '/shifts' && method === 'GET') {
        scheduleReads += 1;
        return response({ shifts: [], registrations: [] });
      }
      if (path === '/shifts/availability' && method === 'POST') {
        if (availabilityError)
          return response(availabilityError, 422);
        return response({ ...body, ma_dang_ky: 'registration-id' });
      }
      return response([]);
    }),
  );
}

function renderForm(onClose = vi.fn()) {
  render(
    <DataProvider>
      <NoticeProvider>
        <AvailabilityForm date={today()} onClose={onClose} />
      </NoticeProvider>
    </DataProvider>,
  );
  return {
    dialog: screen.getByRole('dialog', {
      name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
    }),
    onClose,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(
    Date.parse('2026-11-09T07:00:00Z'),
  );
  location.hash = '/schedule';
  calls = [];
  availabilityError = null;
  scheduleReads = 0;
  installApi();
});

afterEach(() => {
  cleanup();
  location.hash = '/';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GD6.2 đăng ký lịch rảnh hoặc ca muốn làm', () => {
  it('opens from the day plus button with its day and radio options', async () => {
    const user = userEvent.setup();
    render(<App />);

    const selectedDay = addDays(today(), 2);
    await user.click(
      await screen.findByRole('button', {
        name: `Đăng ký lịch làm việc ngày ${dateText(selectedDay)}`,
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
    });
    expect(
      (within(dialog).getByLabelText('Ngày') as HTMLInputElement).value,
    ).toBe(selectedDay);
    const desired = within(dialog).getByRole('radio', { name: 'Mong muốn' });
    const available = within(dialog).getByRole('radio', { name: 'Rảnh' });
    expect((desired as HTMLInputElement).checked).toBe(true);
    await user.click(available);
    expect((available as HTMLInputElement).checked).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
  });

  it('shows the required fields and invalid time messages without calling the API', async () => {
    const user = userEvent.setup();
    const { dialog } = renderForm();
    const start = within(dialog).getByLabelText('Giờ bắt đầu');
    const end = within(dialog).getByLabelText('Giờ kết thúc');

    await user.clear(within(dialog).getByLabelText('Ngày'));
    await user.clear(start);
    await user.click(within(dialog).getByRole('button', { name: 'Gửi đăng ký' }));
    expect(
      await within(dialog).findByText(
        'Vui lòng nhập đầy đủ thời gian và trạng thái đăng ký',
      ),
    ).toBeTruthy();

    await user.type(within(dialog).getByLabelText('Ngày'), today());
    await user.type(start, '17:00');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi đăng ký' }));
    expect(
      await within(dialog).findByText('Giờ bắt đầu phải trước giờ kết thúc'),
    ).toBeTruthy();
    expect(
      calls.some((call) => call.path === '/shifts/availability'),
    ).toBe(false);
  });

  it('rejects a date before today', async () => {
    const user = userEvent.setup();
    const { dialog } = renderForm();
    const date = within(dialog).getByLabelText('Ngày');

    await user.clear(date);
    await user.type(date, addDays(today(), -1));
    await user.click(within(dialog).getByRole('button', { name: 'Gửi đăng ký' }));

    expect(
      await within(dialog).findByText('Không thể đăng ký ngày trong quá khứ'),
    ).toBeTruthy();
    expect(
      calls.some((call) => call.path === '/shifts/availability'),
    ).toBe(false);
  });

  it('cancels without sending a registration', async () => {
    const user = userEvent.setup();
    const { dialog, onClose } = renderForm();

    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(
      calls.some((call) => call.path === '/shifts/availability'),
    ).toBe(false);
  });

  it('sends the exact payload, refreshes the schedule, closes, and keeps the route', async () => {
    const user = userEvent.setup();
    render(<App />);
    const selectedDay = addDays(today(), 2);
    await user.click(
      await screen.findByRole('button', {
        name: `Đăng ký lịch làm việc ngày ${dateText(selectedDay)}`,
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
    });
    await user.click(within(dialog).getByRole('radio', { name: 'Rảnh' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi đăng ký' }),
    );

    expect(await screen.findByText('Đăng ký thành công')).toBeTruthy();
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-employee-shift-success',
    );
    await waitFor(() => expect(scheduleReads).toBeGreaterThanOrEqual(2));
    expect(
      calls.find(
        (call) =>
          call.method === 'POST' && call.path === '/shifts/availability',
      )?.body,
    ).toEqual({
      ngay: selectedDay,
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
      loai_dang_ky: 'Rảnh',
    });
    expect(
      screen.queryByRole('dialog', {
        name: 'Đăng ký lịch rảnh hoặc ca muốn làm',
      }),
    ).toBeNull();
    expect(location.hash).toBe('#/schedule');
  });

  it('keeps API errors visible in the open form', async () => {
    const user = userEvent.setup();
    availabilityError = 'Không thể lưu đăng ký.';
    const { dialog, onClose } = renderForm();

    await user.click(within(dialog).getByRole('button', { name: 'Gửi đăng ký' }));

    expect(await within(dialog).findByText('Không thể lưu đăng ký.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Đăng ký thành công')).toBeNull();
  });
});
