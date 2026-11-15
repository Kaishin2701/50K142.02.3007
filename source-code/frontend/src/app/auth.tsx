import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, apiBase, ApiError } from '../services/api';
import type { User } from '../services/models';
import { errorText } from './format';

type Session = {
  user: User | null;
  ready: boolean;
  error: string;
  locked: boolean;
  dismissLockedNotice(): void;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const lockAcknowledged = useRef(false);
  const endSession = (code?: string) => {
    setUser(null);
    if (code === 'ACCOUNT_LOCKED' && !lockAcknowledged.current) setLocked(true);
  };
  const dismissLockedNotice = () => {
    lockAcknowledged.current = true;
    setLocked(false);
  };
  useEffect(() => {
    const controller = new AbortController();
    api<User>('/auth/me', { signal: controller.signal })
      .then(setUser)
      .catch((error) => {
        if (!controller.signal.aborted && error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') endSession(error.code);
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.status === 401)
        )
          setError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    const expired = (event: Event) => endSession((event as CustomEvent<{ code?: string }>).detail?.code);
    window.addEventListener('me-session-expired', expired);
    return () => {
      controller.abort();
      window.removeEventListener('me-session-expired', expired);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource(apiBase + '/events', {
      withCredentials: true,
    });
    const controller = new AbortController();
    events.addEventListener('refresh', () =>
      window.dispatchEvent(new Event('me-data-changed')),
    );
    events.addEventListener('session-ended', (event) => {
      if (controller.signal.aborted) return;
      let code: string | undefined;
      try { code = JSON.parse((event as MessageEvent).data).code; } catch { /* Older servers only signal expiry. */ }
      endSession(code);
      events.close();
    });
    events.addEventListener('error', () => {
      // An account may be locked before EventSource can finish connecting.
      void api<User>('/auth/me', { signal: controller.signal }).catch(error => {
        if (!controller.signal.aborted && error instanceof ApiError && error.status === 401) endSession(error.code);
      });
    });
    return () => { controller.abort(); events.close(); };
  }, [user?.ma_nguoi_dung]);
  const login = async (username: string, password: string) => {
    const found = await api<User>('/auth/login', {
      method: 'POST',
      body: { ten_dang_nhap: username, mat_khau: password },
    });
    setError('');
    lockAcknowledged.current = false;
    setLocked(false);
    setUser(found);
    return found;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    lockAcknowledged.current = true;
    setLocked(false);
    setUser(null);
  };
  return (
    <Context.Provider value={{ user, ready, error, locked, dismissLockedNotice, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
