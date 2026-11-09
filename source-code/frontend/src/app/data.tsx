import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/api';
import { errorText } from './format';

type DataStore = {
  cache: Map<string, unknown>;
  version: number;
  refresh(): void;
};
const Context = createContext<DataStore | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const cache = useRef(new Map<string, unknown>());
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    let timer: number | undefined;
    const changed = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    };
    window.addEventListener('me-data-changed', changed);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('me-data-changed', changed);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ cache: cache.current, version, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useDataStore() {
  const store = useContext(Context);
  if (!store) throw new Error('DataProvider is required');
  return store;
}
export function useResource<T>(path: string | null, initial: T) {
  const { cache, version, refresh } = useDataStore();
  const [state, setState] = useState({
    path,
    data: path && cache.has(path) ? (cache.get(path) as T) : initial,
    loading: Boolean(path),
    error: '',
  });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState((previous) => ({
      path,
      data:
        previous.path === path
          ? previous.data
          : cache.has(path)
            ? (cache.get(path) as T)
            : initial,
      loading: true,
      error: '',
    }));
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        cache.set(path, data);
        setState({ path, data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: errorText(error),
          }));
      });
    return () => controller.abort();
  }, [path, version, cache]);
  return {
    data:
      state.path === path
        ? state.data
        : path && cache.has(path)
          ? (cache.get(path) as T)
          : initial,
    loading:
      Boolean(path) &&
      !cache.has(path!) &&
      (state.path !== path || state.loading),
    error: state.path === path ? state.error : '',
    refresh,
  };
}
export function useTask() {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>) => {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError('');
    try {
      await work();
      return true;
    } catch (error) {
      setError(errorText(error));
      return false;
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return { run, pending, error, setError };
}
