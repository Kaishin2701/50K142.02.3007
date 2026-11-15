import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';
import { addDays, today } from '../src/app/format';
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
  ma_nguoi_dung: '33333333-3333-4333-8333-333333333333',
  ho_ten: 'Đồng nghiệp kiểm thử',
};
const sourceShiftId = '44444444-4444-4444-8444-444444444444';
const coworkerShiftId = '55555555-5555-4555-8555-555555555555';
const response = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(status >= 400 ? { error: { message: data } } : { data }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );

let calendarData: CalendarData;
let calls: { path: string; method: string; body?: unknown }[];
let requestError: string | null;

function makeShift(date: string, id = sourceShiftId): Shift {
  return {
    ma_ca: id,
    ngay_lam: date,
    gio_bat_dau: '07:00:00',
    gio_ket_thuc: '12:00:00',
    so_nhan_vien_toi_thieu: 1,
    so_nhan_vien_toi_da: 3,
    nhan_vien: [
      { ma_nhan_vien: employee.ma_nguoi_dung, ho_ten: employee.ho_ten },
    ],
    thieu_nhan_vien: false,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(
    Date.parse('2026-11-09T07:00:00Z'),
  );
  location.hash = '/schedule';
  const source = makeShift(addDays(today(), 1));
  calendarData = { shifts: [source], registrations: [] };
  calls = [];
  requestError = null;
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
      if (path === '/shifts') return response(calendarData);
      if (path === '/shifts/co-workers')
        return response([
          {
            ...coworker,
            shifts: [makeShift(addDays(today(), 2), coworkerShiftId)],
          },
        ]);
      if (path === '/shifts/requests' && method === 'POST' && requestError)
        return response(requestError, 409);
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

async function openForm() {
  render(<App />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: /07:00–12:00/ }),
  );
  const details = screen.getByRole('dialog', { name: 'Thông tin ca làm' });
  await user.click(
    within(details).getByRole('button', { name: 'Đổi hoặc xoay ca' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Gửi yêu cầu đổi hoặc xoay ca',
  });
  await within(dialog).findByRole('option', { name: coworker.ho_ten });
  return { user, dialog };
}

async function fillRequest(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  type: 'Đổi ca hai chiều' | 'Nhờ nhân viên khác làm thay',
) {
  if (type !== 'Đổi ca hai chiều') {
    await user.click(within(dialog).getByRole('radio', { name: type }));
  }
  await user.selectOptions(
    within(dialog).getByLabelText('Đồng nghiệp'),
    coworker.ma_nguoi_dung,
  );
  if (type === 'Đổi ca hai chiều') {
    await user.selectOptions(
      within(dialog).getByLabelText('Ca làm của đồng nghiệp'),
      coworkerShiftId,
    );
  }
  await user.type(within(dialog).getByLabelText('Lý do'), '  Việc cá nhân  ');
}

describe('GD6.4 shift change request', () => {
  it('requires all information without sending an incomplete request', async () => {
    const { user, dialog } = await openForm();

    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }),
    );

    expect(
      within(dialog).getByText('Vui lòng nhập đầy đủ thông tin yêu cầu'),
    ).toBeTruthy();
    expect(
      calls.some(
        (call) => call.path === '/shifts/requests' && call.method === 'POST',
      ),
    ).toBe(false);
  });

  it('sends a two-way swap with the real source and coworker shift IDs and stays open on success', async () => {
    const { user, dialog } = await openForm();
    const sourceField = within(dialog).getByLabelText(
      'Ca làm cần thay đổi',
    ) as HTMLInputElement;
    expect(sourceField.readOnly).toBe(true);
    expect(sourceField.value).toContain('07:00–12:00');
    expect(within(dialog).getAllByRole('radio')).toHaveLength(2);
    expect(
      within(dialog).getByRole('radio', { name: 'Đổi ca hai chiều' })
        .checked,
    ).toBe(true);

    await fillRequest(user, dialog, 'Đổi ca hai chiều');
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }),
    );

    await screen.findByText('Gửi yêu cầu thành công.');
    expect(screen.getByRole('status').className).toContain(
      'ui-notice-employee-request-success',
    );
    await waitFor(() =>
      expect(
        calls.find(
          (call) => call.path === '/shifts/requests' && call.method === 'POST',
        )?.body,
      ).toEqual({
        ma_ca: sourceShiftId,
        loai_yeu_cau: 'Đổi ca hai chiều',
        ma_nhan_vien_duoc_de_nghi: coworker.ma_nguoi_dung,
        ma_ca_cua_dong_nghiep: coworkerShiftId,
        ly_do: 'Việc cá nhân',
      }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Gửi yêu cầu đổi hoặc xoay ca' }),
    ).toBeTruthy();
    expect(screen.getByText('Gửi yêu cầu thành công.')).toBeTruthy();
  });

  it('sends a cover request without requiring or sending a second shift ID', async () => {
    const { user, dialog } = await openForm();
    await fillRequest(user, dialog, 'Nhờ nhân viên khác làm thay');

    expect(
      within(dialog).queryByLabelText('Ca làm của đồng nghiệp'),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }),
    );

    await waitFor(() =>
      expect(
        calls.find(
          (call) => call.path === '/shifts/requests' && call.method === 'POST',
        )?.body,
      ).toEqual({
        ma_ca: sourceShiftId,
        loai_yeu_cau: 'Nhờ nhân viên khác làm thay',
        ma_nhan_vien_duoc_de_nghi: coworker.ma_nguoi_dung,
        ly_do: 'Việc cá nhân',
      }),
    );
  });

  it.each([
    'Không thể gửi yêu cầu cho ca làm đã bắt đầu hoặc đã kết thúc',
    'Nhân viên được chọn bị trùng lịch làm việc',
    'Ca làm này đã có yêu cầu đang chờ xử lý',
  ])('shows the API error unchanged: %s', async (message) => {
    requestError = message;
    const { user, dialog } = await openForm();
    await fillRequest(user, dialog, 'Đổi ca hai chiều');
    await user.click(
      within(dialog).getByRole('button', { name: 'Gửi yêu cầu' }),
    );

    expect(
      (await within(dialog).findByRole('alert')).textContent,
    ).toBe(message);
    expect(
      screen.getByRole('dialog', { name: 'Gửi yêu cầu đổi hoặc xoay ca' }),
    ).toBeTruthy();
  });
});
