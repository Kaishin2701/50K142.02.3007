import { Component, Suspense, lazy, type ReactNode } from 'react';
import { SessionProvider, useSession } from './auth';
import { DataProvider } from './data';
import { RouterProvider, useRouter, type Page } from './router';
import { AppShell } from '../components/AppShell';
import { Button, ErrorMessage, NoticeProvider, Panel } from '../components/ui';
import { CheckoutProvider } from '../features/sales/CheckoutContext';
import LoginPage from '../features/auth/LoginPage';

const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));
const SalesPage = lazy(() => import('../features/sales/SalesPage'));
const OrdersPage = lazy(() => import('../features/orders/OrdersPage'));
const AccountsPage = lazy(() => import('../features/users/AccountsPage'));
const ShiftsPage = lazy(() => import('../features/shifts/ShiftsPage'));
const InventoryPage = lazy(() => import('../features/inventory/InventoryPage'));
const CountPage = lazy(() => import('../features/inventory/CountPage'));
const ClosingPage = lazy(() => import('../features/inventory/ClosingPage'));

class PageBoundary extends Component<
  { page: Page; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: { page: Page }) {
    if (previous.page !== this.props.page && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    if (this.state.failed)
      return (
        <Panel>
          <ErrorMessage message="Không thể tải giao diện. Vui lòng thử lại." />
          <Button onClick={() => location.reload()}>Tải lại</Button>
        </Panel>
      );
    return this.props.children;
  }
}
function PageContent() {
  const { page } = useRouter();
  if (page === 'reports') return <ReportsPage />;
  if (page === 'sales') return <SalesPage />;
  if (page === 'orders') return <OrdersPage />;
  if (page === 'accounts') return <AccountsPage />;
  if (page === 'shifts' || page === 'schedule') return <ShiftsPage />;
  if (page === 'count') return <CountPage />;
  if (page === 'closing') return <ClosingPage />;
  return <InventoryPage page={page} />;
}
function Workspace() {
  const { page } = useRouter();
  return (
    <AppShell>
      <PageBoundary page={page}>
        <Suspense
          fallback={
            <Panel>
              <p role="status">Đang tải…</p>
            </Panel>
          }
        >
          <PageContent />
        </Suspense>
      </PageBoundary>
    </AppShell>
  );
}
function SessionGate() {
  const { user, ready } = useSession();
  if (!ready)
    return (
      <main className="session-loading" role="status">
        <strong>Mê Cà Phê</strong>
        <span>Đang tải…</span>
      </main>
    );
  if (!user) return <LoginPage />;
  return (
    <DataProvider key={user.ma_nguoi_dung}>
      <RouterProvider>
        <CheckoutProvider>
          <NoticeProvider>
            <Workspace />
          </NoticeProvider>
        </CheckoutProvider>
      </RouterProvider>
    </DataProvider>
  );
}
export default function App() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}
