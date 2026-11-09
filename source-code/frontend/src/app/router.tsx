import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import legacyRoutes from './legacy-routes.json';
import { useSession } from './auth';

export type Page =
  | 'reports'
  | 'sales'
  | 'orders'
  | 'accounts'
  | 'shifts'
  | 'schedule'
  | 'stock'
  | 'receipts'
  | 'losses'
  | 'count'
  | 'closing';
const pages: Page[] = [
  'reports',
  'sales',
  'orders',
  'accounts',
  'shifts',
  'schedule',
  'stock',
  'receipts',
  'losses',
  'count',
  'closing',
];
const managerPages: Page[] = [
  'reports',
  'orders',
  'accounts',
  'shifts',
  'stock',
  'receipts',
  'losses',
  'closing',
];
const employeePages: Page[] = [
  'sales',
  'orders',
  'schedule',
  'count',
  'closing',
];

function readPage(): Page | undefined {
  let hash: string;
  try {
    hash = decodeURIComponent(location.hash.slice(1)).replace(/^\//, '');
  } catch {
    return undefined;
  }
  if (pages.includes(hash as Page)) return hash as Page;
  // Existing bookmarks resolve to their business page. Dialogs are local state.
  return (legacyRoutes as Record<string, Page>)[hash];
}
const Context = createContext<{ page: Page; go(page: Page): void } | null>(
  null,
);

export function RouterProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const manager = user?.vai_tro === 'Quản lý';
  const allowed = manager ? managerPages : employeePages;
  const fallback: Page = manager ? 'reports' : 'sales';
  const [requested, setRequested] = useState(readPage);
  const page = requested && allowed.includes(requested) ? requested : fallback;
  const go = (next: Page) => {
    location.hash = '/' + next;
    startTransition(() => setRequested(next));
  };
  useEffect(() => {
    const changed = () => startTransition(() => setRequested(readPage()));
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    if (requested && allowed.includes(requested)) return;
    const url = new URL(location.href);
    url.hash = '/' + fallback;
    history.replaceState(null, '', url);
    startTransition(() => setRequested(fallback));
  }, [requested, allowed, fallback]);
  useEffect(() => {
    document.title = 'Mê Cà Phê';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);
  return <Context.Provider value={{ page, go }}>{children}</Context.Provider>;
}
export function useRouter() {
  const router = useContext(Context);
  if (!router) throw new Error('RouterProvider is required');
  return router;
}
