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
import type { ShiftRequest, User } from '../src/services/models';

const employee: User = {
  ma_nguoi_dung: '22222222-2222-4222-8222-222222222222',
  ten_dang_nhap: 'nhanvien',
  ho_ten: 'Nhân viên kiểm thử',
  so_dien_thoai: '0900000002',
  vai_tro: 'Nhân viên',
  trang_thai: 'Đang hoạt động',
};
const manager: User = {
  ...employee,
  ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
  ten_dang_nhap: 'quanly',
  ho_ten: 'Quản lý kiểm thử',
  vai_tro: 'Quản lý',
};

function request(
  type: string,
  id: string,
  overrides: Partial<ShiftRequest> = {},
): ShiftRequest {
  return {
    ma_yeu_cau: id,
    ma_ca: '44444444-4444-4444-8444-444444444444',
    nguoi_gui: '33333333-3333-4333-8333-333333333333',
    ma_nhan_vien_duoc_de_nghi: employee.ma_nguoi_dung,
    ho_ten_nguoi_gui: 'Lê Thị Mai',
    ho_ten_nguoi_nhan: employee.ho_ten,
    loai_yeu_cau: type,
    trang_thai: 'Chờ đồng nghiệp',
    ly_do: 'Bận việc cá nhân',
    ca_hien_tai: {
      ma_ca: '44444444-4444-4444-8444-444444444444',
      ngay_lam: '2026-11-09',
      gio_bat_dau: '07:00',
      gio_ket_thuc: '12:00',
    },
    ca_dong_nghiep:
      type === 'Đổi ca hai chiều'
        ? {
            ma_ca: '55555555-5555-4555-8555-555555555555',
            ngay_lam: '2026-11-10',
            gio_bat_dau: '17:00',
            gio_ket_thuc: '22:00',
          }
        : null,
    ...overrides,
  };
}

let activeUser: User;
let requests: ShiftRequest[];
let calls: { path: string; method: string; body?: unknown }[];
let responseError: string;
let requestReads: number;

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status >= 400
        ? { error: { code: 'TEST_ERROR', message: data } }
        : { data },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T07:00:00Z'));
  sessionStorage.clear();
  location.hash = '/schedule';
  activeUser = employee;
  requests = [request('Đổi ca hai chiều', '99999999-9999-4999-8999-999999999991')];
  calls = [];
  responseError = '';
  requestReads = 0;
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

      if (path === '/auth/me') return response(activeUser);
      if (path === '/shifts' && method === 'GET')
        return response({ shifts: [], registrations: [] });
      if (path === '/shifts/requests' && method === 'GET') {
        requestReads += 1;
        return response(requests);
      }
      if (
        path.startsWith('/shifts/requests/') &&
        method === 'POST' &&
        (path.endsWith('/respond') || path.endsWith('/decide'))
      ) {
        if (responseError) {
          const error = responseError;
          responseError = '';
          return response(error, 409);
        }
        const selected = requests.find(
          (item) => item.ma_yeu_cau === path.split('/')[3],
        );
        if (!selected) return response('Không tìm thấy yêu cầu.', 404);
        selected.trang_thai = path.endsWith('/respond')
          ? body.dong_y
            ? 'Chờ xử lý'
            : 'Bị từ chối'
          : body.dong_y
            ? 'Đã chấp thuận'
            : 'Bị từ chối';
        return response(selected);
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

async function openRequests(user = userEvent.setup()) {
  render(<App />);
  await user.click(
    await screen.findByRole('button', {
      name: 'Yêu cầu đổi hoặc xoay ca',
    }),
  );
  return user;
}

describe('GD6.5 phản hồi yêu cầu đổi hoặc xoay ca của Nhân viên', () => {
  it('lists all returned requests in the three Figma columns and opens a two-way request detail', async () => {
    requests = [
      request('Đổi ca hai chiều', 'request-swap'),
      request('Nhờ nhân viên khác làm thay', 'request-cover'),
      request('Đổi ca hai chiều', 'request-sent', {
        nguoi_gui: employee.ma_nguoi_dung,
        ma_nhan_vien_duoc_de_nghi: '33333333-3333-4333-8333-333333333333',
      }),
      request('Đổi ca hai chiều', 'request-closed', {
        trang_thai: 'Bị từ chối',
      }),
    ];
    const user = await openRequests();
    const list = screen.getByRole('dialog', { name: 'Yêu cầu' });

    expect(within(list).getByText('Nhân viên gửi')).toBeTruthy();
    expect(within(list).getByText('Loại yêu cầu')).toBeTruthy();
    expect(within(list).getByText('Ca làm liên quan')).toBeTruthy();
    expect(within(list).getAllByRole('button', { name: /Chi tiết yêu cầu/ }))
      .toHaveLength(4);
    expect(within(list).queryByRole('button', { name: 'Đồng ý' })).toBeNull();

    await user.click(
      within(list).getAllByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ Lê Thị Mai',
      })[0],
    );
    const detail = screen.getByRole('dialog', {
      name: 'Yêu cầu đổi hoặc xoay ca',
    });
    expect(within(detail).getByText('Nhân viên gửi yêu cầu')).toBeTruthy();
    expect(within(detail).getByText('Loại yêu cầu')).toBeTruthy();
    expect(within(detail).getByText('Ca làm cần thay đổi')).toBeTruthy();
    expect(within(detail).getByText('09/11/2026 · 07:00–12:00')).toBeTruthy();
    expect(within(detail).getByText('Ca làm của đồng nghiệp')).toBeTruthy();
    expect(within(detail).getByText('10/11/2026 · 17:00–22:00')).toBeTruthy();
    expect(within(detail).getByText('Bận việc cá nhân')).toBeTruthy();
    expect(within(detail).getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(within(detail).getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
  });

  it('does not present a coworker shift for requests to cover a shift', async () => {
    requests = [
      request('Nhờ nhân viên khác làm thay', 'request-cover'),
    ];
    const user = await openRequests();
    await user.click(
      await screen.findByRole('button', {
        name: 'Chi tiết yêu cầu Nhờ nhân viên khác làm thay từ Lê Thị Mai',
      }),
    );

    const detail = screen.getByRole('dialog', {
      name: 'Yêu cầu đổi hoặc xoay ca',
    });
    expect(
      within(detail).getAllByText('Nhờ nhân viên khác làm thay'),
    ).toHaveLength(2);
    expect(within(detail).queryByText('Ca làm của đồng nghiệp')).toBeNull();
    expect(within(detail).queryByText('10/11/2026 · 17:00–22:00')).toBeNull();
  });

  it('shows actions only when the current employee is the recipient of a pending response', async () => {
    requests = [
      request('Đổi ca hai chiều', 'request-self', {
        nguoi_gui: employee.ma_nguoi_dung,
        ho_ten_nguoi_gui: 'Nhân viên tự gửi',
      }),
      request('Đổi ca hai chiều', 'request-other-recipient', {
        ma_nhan_vien_duoc_de_nghi: '33333333-3333-4333-8333-333333333333',
        ho_ten_nguoi_gui: 'Đồng nghiệp khác',
      }),
      request('Đổi ca hai chiều', 'request-not-pending', {
        trang_thai: 'Chờ xử lý',
        ho_ten_nguoi_gui: 'Yêu cầu đã qua phản hồi',
      }),
      request('Đổi ca hai chiều', 'request-pending-response', {
        ho_ten_nguoi_gui: 'Người gửi actionable',
      }),
    ];
    const user = await openRequests();

    for (const id of [
      'request-self',
      'request-other-recipient',
      'request-not-pending',
    ]) {
      const row = requests.find((item) => item.ma_yeu_cau === id)!;
      await user.click(
        screen.getByRole('button', {
          name: `Chi tiết yêu cầu ${row.loai_yeu_cau} từ ${row.ho_ten_nguoi_gui}`,
        }),
      );
      const detail = screen.getByRole('dialog', {
        name: 'Yêu cầu đổi hoặc xoay ca',
      });
      expect(within(detail).queryByRole('button', { name: 'Từ chối' })).toBeNull();
      expect(within(detail).queryByRole('button', { name: 'Đồng ý' })).toBeNull();
      await user.click(within(detail).getByRole('button', { name: 'Đóng' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Yêu cầu' })).toBeNull(),
      );
      await user.click(
        screen.getByRole('button', { name: 'Yêu cầu đổi hoặc xoay ca' }),
      );
      await screen.findByRole('dialog', { name: 'Yêu cầu' });
    }

    await user.click(
      screen.getByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ Người gửi actionable',
      }),
    );
    const actionable = screen.getByRole('dialog', {
      name: 'Yêu cầu đổi hoặc xoay ca',
    });
    expect(within(actionable).getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(within(actionable).getByRole('button', { name: 'Đồng ý' })).toBeTruthy();
  });

  it.each([
    [false, 'Từ chối', 'Bị từ chối', 'Đã từ chối yêu cầu đổi hoặc xoay ca'],
    [true, 'Đồng ý', 'Chờ xử lý', 'Đã đồng ý yêu cầu đổi hoặc xoay ca'],
  ])(
    'posts a %s response, refreshes the list, and shows its success notice',
    async (accept, action, status, notice) => {
      const user = await openRequests();
      await user.click(
        await screen.findByRole('button', {
          name: 'Chi tiết yêu cầu Đổi ca hai chiều từ Lê Thị Mai',
        }),
      );
      const detail = screen.getByRole('dialog', {
        name: 'Yêu cầu đổi hoặc xoay ca',
      });
      await user.click(within(detail).getByRole('button', { name: action as string }));
      const confirmation = screen.getByRole('dialog', {
        name: action === 'Đồng ý' ? 'Đồng ý yêu cầu' : 'Từ chối yêu cầu',
      });
      await user.click(
        within(confirmation).getByRole('button', { name: 'Xác nhận' }),
      );

      expect((await screen.findByRole('status')).textContent).toContain(
        notice as string,
      );
      const noticeElement = screen.getByRole('status');
      if (accept) {
        expect(noticeElement.className).toContain('ui-notice-shift-success');
      } else {
        expect(noticeElement.className).toContain(
          'ui-notice-employee-request-reject-success',
        );
      }
      expect(screen.queryByRole('dialog', { name: 'Yêu cầu' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Yêu cầu đổi hoặc xoay ca' }));
      await waitFor(() => expect(requestReads).toBeGreaterThan(1));
      expect(requests[0].trang_thai).toBe(status);
      expect(
        calls.filter(
          (call) =>
            call.path === `/shifts/requests/${requests[0].ma_yeu_cau}/respond` &&
            call.method === 'POST',
        ),
      ).toEqual([
        {
          path: `/shifts/requests/${requests[0].ma_yeu_cau}/respond`,
          method: 'POST',
          body: { dong_y: accept },
        },
      ]);
      expect(calls.some((call) => call.path.endsWith('/decide'))).toBe(false);
      expect(
        calls.filter(
          (call) => call.path === '/shifts' && call.method !== 'GET',
        ),
      ).toHaveLength(0);
      expect(screen.queryByRole('dialog', { name: 'Đồng ý yêu cầu' })).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'Từ chối yêu cầu' })).toBeNull();
      expect(screen.queryByRole('dialog', { name: 'Yêu cầu đổi hoặc xoay ca' }))
        .toBeNull();
      expect(screen.getByRole('dialog', { name: 'Yêu cầu' })).toBeTruthy();
    },
  );

  it('preserves the request and original API error in the confirmation and allows retry', async () => {
    responseError = 'Không thể ghi nhận phản hồi lúc này.';
    const user = await openRequests();
    await user.click(
      await screen.findByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ Lê Thị Mai',
      }),
    );
    const detail = screen.getByRole('dialog', {
      name: 'Yêu cầu đổi hoặc xoay ca',
    });
    await user.click(within(detail).getByRole('button', { name: 'Đồng ý' }));
    let confirmation = screen.getByRole('dialog', { name: 'Đồng ý yêu cầu' });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      responseError,
    );
    expect(screen.getByRole('dialog', { name: 'Yêu cầu đổi hoặc xoay ca' }))
      .toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Đồng ý yêu cầu' })).toBeTruthy();
    expect(requests[0].trang_thai).toBe('Chờ đồng nghiệp');
    expect(
      screen.queryByText('Đã đồng ý yêu cầu đổi hoặc xoay ca'),
    ).toBeNull();

    confirmation = screen.getByRole('dialog', { name: 'Đồng ý yêu cầu' });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );
    expect(
      await screen.findByText('Đã đồng ý yêu cầu đổi hoặc xoay ca'),
    ).toBeTruthy();
  });

  it('keeps the manager queue and decide endpoint behavior unchanged', async () => {
    activeUser = manager;
    location.hash = '/shifts';
    requests = [
      request('Đổi ca hai chiều', 'manager-request', {
        trang_thai: 'Chờ xử lý',
      }),
    ];
    render(<App />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Xử lý yêu cầu đổi hoặc xoay ca',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Chi tiết yêu cầu Đổi ca hai chiều từ Lê Thị Mai',
      }),
    );
    const detail = screen.getByRole('dialog', {
      name: 'Xử lý yêu cầu đổi hoặc xoay ca',
    });
    await user.click(within(detail).getByRole('button', { name: 'Đồng ý' }));
    const confirmation = screen.getByRole('dialog', { name: 'Đồng ý yêu cầu' });
    await user.click(
      within(confirmation).getByRole('button', { name: 'Xác nhận' }),
    );

    expect(await screen.findByText('Đã chấp thuận yêu cầu.')).toBeTruthy();
    expect(
      calls.some(
        (call) =>
          call.path === '/shifts/requests/manager-request/decide' &&
          call.method === 'POST' &&
          JSON.stringify(call.body) === JSON.stringify({ dong_y: true }),
      ),
    ).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/respond'))).toBe(false);
  });
});
