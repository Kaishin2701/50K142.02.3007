import React from 'react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/app/App';

// Opt in against the isolated database started with backend's --qa option.
const localBase = process.env.ME_CAFE_LOCAL_API_BASE_URL;
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it.skipIf(!localBase)(
  'runs the application with the real local API through login, sale, payment and completion',
  async () => {
    const credentials = JSON.parse(
      await readFile(
        resolve(process.cwd(), '../backend/.local/qa/access.json'),
        'utf8',
      ),
    );
    const nativeFetch = globalThis.fetch;
    let cookie = '';
    vi.stubGlobal('fetch', async (path: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      headers.set('Origin', 'http://127.0.0.1:5173');
      if (cookie) headers.set('Cookie', cookie);
      const response = await nativeFetch(new URL(String(path), localBase), {
        ...options,
        headers,
      });
      const saved = response.headers.get('set-cookie');
      if (saved) cookie = saved.split(';')[0];
      return response;
    });
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener() {}
        close() {}
      },
    );
    vi.stubGlobal('scrollTo', vi.fn());
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
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:local-qa',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    sessionStorage.clear();
    location.hash = '/reports';
    render(<App />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('textbox', { name: 'Tên tài khoản' }),
      credentials.manager.username,
    );
    await user.type(
      screen.getByLabelText('Mật khẩu', { exact: true }),
      credentials.manager.password,
    );
    await user.click(
      screen.getByRole('button', { name: 'Đăng nhập', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Tổng quan', exact: true });
    const sidebar = screen.getByRole('complementary', {
      name: 'Thanh điều hướng',
    });
    await user.click(
      screen.getByRole('link', { name: 'Quản lý tài khoản', exact: true }),
    );
    await screen.findByText(credentials.employee.username);
    expect(
      screen.getByRole('complementary', { name: 'Thanh điều hướng' }),
    ).toBe(sidebar);
    await user.click(
      screen.getByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Tên tài khoản' }),
      credentials.employee.username,
    );
    await user.type(
      screen.getByLabelText('Mật khẩu', { exact: true }),
      credentials.employee.password,
    );
    await user.click(
      screen.getByRole('button', { name: 'Đăng nhập', exact: true }),
    );
    const add = (await screen.findAllByRole('button', { name: /^Thêm / }))[0];
    const name = add.getAttribute('aria-label')!.replace(/^Thêm /, '');
    await user.click(add);
    const quantity = screen.getByRole('spinbutton', {
      name: 'Số lượng ' + name,
    });
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(
      screen.getByRole('button', { name: 'Tiếp tục lập hóa đơn' }),
    );
    const main = screen.getByRole('main');
    await user.click(
      screen.getByRole('button', { name: 'Kiểm tra đơn', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Xác nhận đơn', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Tiền mặt', exact: true }),
    );
    const cash = screen.getByRole('dialog', { name: 'Thanh toán tiền mặt' });
    await user.type(
      within(cash).getByRole('spinbutton', { name: 'Số tiền nhận được' }),
      '100000',
    );
    await user.click(
      within(cash).getByRole('button', { name: 'Xác nhận số tiền' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Xuất hóa đơn', exact: true }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Hoàn tất pha chế',
        exact: true,
      }),
    );
    await screen.findByText(/Đã ghi nhận hoàn tất pha chế cho đơn #ME-/);
    expect(screen.getByRole('main')).toBe(main);
    expect(location.hash).toBe('#/sales');
    await user.click(
      screen.getByRole('button', { name: 'Lập đơn mới', exact: true }),
    );
    await screen.findByRole('heading', { name: 'Chọn món', exact: true });
    expect(
      screen.queryByRole('spinbutton', { name: 'Số lượng ' + name }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Đăng xuất', exact: true }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Xác nhận', exact: true }),
    );
    await screen.findByRole('textbox', { name: 'Tên tài khoản' });
  },
  30000,
);
