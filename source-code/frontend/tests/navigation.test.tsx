import React, { Suspense, lazy } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from '../src/app/auth';
import { RouterProvider, useRouter } from '../src/app/router';
import { DataProvider, useResource } from '../src/app/data';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it('retains the current page while a business page module loads', async () => {
  location.hash = '/reports';
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'EventSource',
    class {
      addEventListener() {}
      close() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              ma_nguoi_dung: '11111111-1111-4111-8111-111111111111',
              ho_ten: 'Quản lý',
              vai_tro: 'Quản lý',
            },
          }),
        ),
    ),
  );
  let finishLoading!: (value: { default: React.ComponentType }) => void;
  const destination = lazy(
    () =>
      new Promise<{ default: React.ComponentType }>((resolve) => {
        finishLoading = resolve;
      }),
  );
  function Overview() {
    const { go } = useRouter();
    return <button onClick={() => go('accounts')}>Mở quản lý tài khoản</button>;
  }
  function Outlet() {
    const { ready } = useSession();
    const { page } = useRouter();
    if (!ready) return null;
    const View = page === 'accounts' ? destination : Overview;
    return (
      <Suspense fallback={<p>Màn hình trống đang tải</p>}>
        <View />
      </Suspense>
    );
  }
  render(
    <SessionProvider>
      <RouterProvider>
        <Outlet />
      </RouterProvider>
    </SessionProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Mở quản lý tài khoản' }),
  );
  expect(
    screen.getByRole('button', { name: 'Mở quản lý tài khoản' }),
  ).toBeTruthy();
  expect(screen.queryByText('Màn hình trống đang tải')).toBeNull();
  await act(async () =>
    finishLoading({ default: () => <h1>Quản lý tài khoản đã tải</h1> }),
  );
  expect(await screen.findByText('Quản lý tài khoản đã tải')).toBeTruthy();
  expect(location.hash).toBe('#/accounts');
});

it('ignores a stale resource response after changing filters', async () => {
  let finishOld!: (response: Response) => void;
  let finishNew!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (path: string) =>
        new Promise<Response>((resolve) => {
          if (String(path).endsWith('/old')) finishOld = resolve;
          else finishNew = resolve;
        }),
    ),
  );
  function Content() {
    const [path, setPath] = React.useState('/old');
    const resource = useResource(path, '');
    return (
      <>
        <button onClick={() => setPath('/new')}>Đổi bộ lọc</button>
        <p>{resource.data}</p>
      </>
    );
  }
  render(
    <DataProvider>
      <Content />
    </DataProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Đổi bộ lọc' }));
  await act(async () =>
    finishNew(new Response(JSON.stringify({ data: 'Dữ liệu mới' }))),
  );
  await screen.findByText('Dữ liệu mới');
  await act(async () =>
    finishOld(new Response(JSON.stringify({ data: 'Dữ liệu cũ' }))),
  );
  expect(screen.queryByText('Dữ liệu cũ')).toBeNull();
  expect(screen.getByText('Dữ liệu mới')).toBeTruthy();
});

it('refreshes cached data without inserting a full loading state', async () => {
  let finish!: (response: Response) => void;
  let requests = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      requests++;
      if (requests === 1)
        return Promise.resolve(
          new Response(JSON.stringify({ data: 'Số liệu hiện tại' })),
        );
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }),
  );
  function Content() {
    const resource = useResource('/resource', '');
    return (
      <>
        <button onClick={resource.refresh}>Tải lại dữ liệu</button>
        {resource.loading && <p>Đang tải toàn bộ</p>}
        <p>{resource.data}</p>
      </>
    );
  }
  render(
    <DataProvider>
      <Content />
    </DataProvider>,
  );
  await screen.findByText('Số liệu hiện tại');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Tải lại dữ liệu' }));
  expect(screen.queryByText('Đang tải toàn bộ')).toBeNull();
  expect(screen.getByText('Số liệu hiện tại')).toBeTruthy();
  await act(async () =>
    finish(new Response(JSON.stringify({ data: 'Số liệu cập nhật' }))),
  );
  await screen.findByText('Số liệu cập nhật');
});
