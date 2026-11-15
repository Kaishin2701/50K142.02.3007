import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from '../src/app/auth';
import LoginPage from '../src/features/auth/LoginPage';

const manager = {ma_nguoi_dung:'11111111-1111-4111-8111-111111111111',ten_dang_nhap:'quanly',ho_ten:'Quản lý',so_dien_thoai:'0900000001',vai_tro:'Quản lý',trang_thai:'Đang hoạt động'};
class Events {
  static instances: Events[] = [];
  listeners = new Map<string, (event: Event) => void>();
  constructor() { Events.instances.push(this); }
  addEventListener(name: string, callback: (event: Event) => void) { this.listeners.set(name, callback); }
  close() {}
}
const response = (data: unknown) => new Response(JSON.stringify({data}), {headers:{'Content-Type':'application/json'}});
const lockedResponse = () => new Response(JSON.stringify({error:{code:'ACCOUNT_LOCKED'}}), {
  status:401, headers:{'Content-Type':'application/json'},
});
let delayedLogout = false;
let completeLogout: (() => void) | undefined;
function Probe() {
  const session = useSession();
  return <>
    <output data-testid="account">{session.user?.ten_dang_nhap ?? 'none'}</output>
    <output data-testid="notice">{session.sessionNotice?.reason ?? 'none'}</output>
    <button onClick={session.dismissNotice}>Đóng thông báo</button>
    <button onClick={() => void session.login('quanly','test-password')}>Đăng nhập lại</button>
    <button onClick={() => void session.logout()}>Đăng xuất</button>
  </>;
}
function LoginWhenSignedOut() {
  const { ready, user } = useSession();
  if (!ready) return null;
  return user ? <Probe /> : <LoginPage />;
}

async function start() {
  render(<SessionProvider><Probe /></SessionProvider>);
  await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('quanly'));
  return userEvent.setup();
}
async function sessionEndedStream() {
  let stream: Events | undefined;
  await waitFor(() => {
    stream = Events.instances.find((instance) => instance.listeners.has('session-ended'));
    expect(stream).toBeDefined();
  });
  if (!stream) throw new Error('Session-ended EventSource listener was not registered');
  return stream;
}
function end(reason?: string) {
  act(() => window.dispatchEvent(reason
    ? new CustomEvent('me-session-ended', {detail:{reason}})
    : new Event('me-session-expired')));
}
beforeEach(() => {
  delayedLogout = false;
  completeLogout = undefined;
  Events.instances = [];
  vi.stubGlobal('EventSource', Events);
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (String(input).endsWith('/auth/logout') && delayedLogout)
      return new Promise<Response>((resolve) => { completeLogout = () => resolve(response({da_dang_xuat:true})); });
    return response(manager);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('session end notices', () => {
  it('shows the locked account notice on the login screen when the stream reports a lock', async () => {
    render(<SessionProvider><LoginWhenSignedOut /></SessionProvider>);
    const stream = await sessionEndedStream();
    act(() => stream.listeners.get('session-ended')!(new MessageEvent('session-ended',{data:JSON.stringify({reason:'locked'})})));
    const dialog = await screen.findByRole('dialog', {name:'Bạn đã bị đăng xuất'});
    expect(within(dialog).getByText('Tài khoản của bạn đã bị khóa.')).toBeTruthy();
    expect(within(dialog).getByText('Bạn không thể tiếp tục sử dụng hệ thống. Vui lòng liên hệ quản lý.')).toBeTruthy();
    expect(within(dialog).queryByText('Phiên làm việc của bạn đã kết thúc.')).toBeNull();
    await userEvent.setup().click(within(dialog).getByRole('button',{name:'Đã hiểu'}));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows a lock instead of an expiry if session restoration is rejected for a locked account', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(lockedResponse());
    render(<SessionProvider><LoginWhenSignedOut /></SessionProvider>);
    const dialog = await screen.findByRole('dialog',{name:'Bạn đã bị đăng xuất'});
    expect(within(dialog).getByText('Tài khoản của bạn đã bị khóa.')).toBeTruthy();
  });
  it('checks the session reason if the event stream cannot reconnect', async () => {
    await start();
    const stream = await sessionEndedStream();
    vi.mocked(fetch).mockResolvedValueOnce(lockedResponse());
    act(() => stream.listeners.get('error')!(new Event('error')));
    await waitFor(() => expect(screen.getByTestId('notice').textContent).toBe('locked'));
  });
  it('preserves a confirmed lock and ignores stale expiry after acknowledgement', async () => {
    const user = await start();
    end('locked');
    expect(screen.getByTestId('notice').textContent).toBe('locked');
    end();
    expect(screen.getByTestId('notice').textContent).toBe('locked');
    await user.click(screen.getByRole('button',{name:'Đóng thông báo'}));
    end();end('locked');
    expect(screen.getByTestId('notice').textContent).toBe('none');
    expect(screen.getByTestId('account').textContent).toBe('none');
  });
  it('starts notice tracking afresh after successful login', async () => {
    const user = await start();end('locked');
    await user.click(screen.getByRole('button',{name:'Đăng nhập lại'}));
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('quanly'));
    expect(screen.getByTestId('notice').textContent).toBe('none');
    end();expect(screen.getByTestId('notice').textContent).toBe('expired');
  });
  it('uses a neutral reason when no known lock evidence is supplied', async () => {
    await start();end('unknown-reason');
    expect(screen.getByTestId('notice').textContent).toBe('expired');
  });
  it('does not show an expiry notice for SSE received during voluntary logout', async () => {
    const user = await start();
    const stream = await sessionEndedStream();
    delayedLogout = true;
    await user.click(screen.getByRole('button',{name:'Đăng xuất'}));
    await waitFor(() => expect(completeLogout).toBeDefined());
    act(() => stream.listeners.get('session-ended')!(new Event('session-ended')));
    expect(screen.getByTestId('notice').textContent).toBe('none');
    await act(async () => completeLogout!());
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('none'));
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });
  it('ignores callbacks from a closed stream after login to a new session', async () => {
    const user = await start();
    const oldStream = await sessionEndedStream();
    await user.click(screen.getByRole('button',{name:'Đăng xuất'}));
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('none'));
    await user.click(screen.getByRole('button',{name:'Đăng nhập lại'}));
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('quanly'));
    act(() => oldStream.listeners.get('session-ended')!(new Event('session-ended')));
    expect(screen.getByTestId('account').textContent).toBe('quanly');
    expect(screen.getByTestId('notice').textContent).toBe('none');
  });
});
