import {
  createContext,
  useContext,
  useEffect,
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
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<User>('/auth/me', { signal: controller.signal })
      .then(setUser)
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.status === 401)
        )
          setError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    const expired = () => setUser(null);
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
    events.addEventListener('refresh', () =>
      window.dispatchEvent(new Event('me-data-changed')),
    );
    events.addEventListener('session-ended', () => {
      setUser(null);
      events.close();
    });
    return () => events.close();
  }, [user?.ma_nguoi_dung]);
  const login = async (username: string, password: string) => {
    const found = await api<User>('/auth/login', {
      method: 'POST',
      body: { ten_dang_nhap: username, mat_khau: password },
    });
    setError('');
    setUser(found);
    return found;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };
  return (
    <Context.Provider value={{ user, ready, error, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
