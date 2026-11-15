import {
  createContext,
  useCallback,
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
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  sessionNotice: { reason: 'locked' | 'expired' } | null;
  dismissNotice(): void;
};
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState<{
    reason: 'locked' | 'expired';
  } | null>(null);
  const ended = useRef(false);
  const dismissed = useRef(false);
  const voluntaryLogout = useRef(false);
  const dismissNotice = useCallback(() => {
    dismissed.current = true;
    setSessionNotice(null);
  }, []);
  const endSession = useCallback((value: unknown) => {
    if (voluntaryLogout.current) return;
    const reason = value === 'locked' ? 'locked' : 'expired';
    // A late 401 must neither downgrade a confirmed lock nor reopen an acknowledged notice.
    if (ended.current && (reason !== 'locked' || dismissed.current)) return;
    ended.current = true;
    setSessionNotice((previous) => previous?.reason === 'locked' ? previous : { reason });
    setError('');
    setUser(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<User>('/auth/me', { signal: controller.signal })
      .then(setUser)
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          if (error.code === 'ACCOUNT_LOCKED') endSession('locked');
          return;
        }
        setError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    const onEnded = (event: Event) => {
      endSession((event as CustomEvent<{reason?: unknown}>).detail?.reason);
    };
    const expired = () => endSession('expired');
    window.addEventListener('me-session-ended', onEnded);
    window.addEventListener('me-session-expired', expired);
    return () => {
      controller.abort();
      window.removeEventListener('me-session-ended', onEnded);
      window.removeEventListener('me-session-expired', expired);
    };
  }, [endSession]);
  useEffect(() => {
    if (!user) return;
    const events = new EventSource(apiBase + '/events', {
      withCredentials: true,
    });
    let active = true;
    events.addEventListener('refresh', () => {
      if (active) window.dispatchEvent(new Event('me-data-changed'));
    });
    const controller = new AbortController();
    let checking = false;
    events.addEventListener('session-ended', (event) => {
      if (!active) return;
      let reason: unknown;
      try {
        reason = JSON.parse((event as MessageEvent<string>).data)?.reason;
      } catch {
        // Older servers may send a session-ended event without details.
      }
      endSession(reason);
      events.close();
    });
    events.addEventListener('error', () => {
      if (!active || checking || voluntaryLogout.current) return;
      checking = true;
      void api<User>('/auth/me', { signal: controller.signal })
        .catch((error) => {
          if (active && error instanceof ApiError && error.status === 401) {
            endSession(error.code === 'ACCOUNT_LOCKED' ? 'locked' : 'expired');
            events.close();
          }
        })
        .finally(() => { checking = false; });
    });
    return () => { active = false; controller.abort(); events.close(); };
  }, [user?.ma_nguoi_dung, endSession]);
  const login = async (username: string, password: string) => {
    const found = await api<User>('/auth/login', {
      method: 'POST',
      body: { ten_dang_nhap: username, mat_khau: password },
    }).catch((error) => {
      if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
        // A new login attempt can show a new notice after acknowledgement.
        ended.current = false;
        dismissed.current = false;
        endSession('locked');
      }
      throw error;
    });
    ended.current = false;
    dismissed.current = false;
    voluntaryLogout.current = false;
    setSessionNotice(null);
    setError('');
    setUser(found);
    return found;
  };
  const logout = async () => {
    voluntaryLogout.current = true;
    try {
      await api('/auth/logout', { method: 'POST' });
      ended.current = true;
      dismissed.current = true;
      setSessionNotice(null);
      setUser(null);
    } finally {
      voluntaryLogout.current = false;
    }
  };
  return (
    <Context.Provider
      value={{
        user,
        ready,
        error,
        login,
        logout,
        sessionNotice,
        dismissNotice,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
