import { useState, type ReactNode } from 'react';
import { useSession } from '../app/auth';
import { useTask } from '../app/data';
import { useRouter, type Page } from '../app/router';
import { store } from '../app/store';
import accountsIcon from '../assets/sidebar/accounts.png';
import ordersIcon from '../assets/sidebar/orders.png';
import overviewIcon from '../assets/sidebar/overview.png';
import salesIcon from '../assets/sidebar/sales.png';
import scheduleIcon from '../assets/sidebar/schedule.png';
import stockIcon from '../assets/sidebar/stock.png';
import { Button, Confirm, useNotice } from './ui';

const navIcons = {
  overview: { image: overviewIcon, width: 20 },
  sales: { image: salesIcon, width: 20 },
  orders: { image: ordersIcon, width: 19.5 },
  stock: { image: stockIcon, width: 20 },
  accounts: { image: accountsIcon, width: 22 },
  shifts: { image: scheduleIcon, width: 20 },
};

type NavIconType = keyof typeof navIcons;

type Link = {
  page: Page;
  label: string;
  iconType: NavIconType;
  hasSub?: boolean;
};

const managerLinks: Link[] = [
  { page: 'reports', label: 'Tổng quan', iconType: 'overview' },
  { page: 'orders', label: 'Quản lý đơn hàng', iconType: 'orders', hasSub: true },
  { page: 'stock', label: 'Kho', iconType: 'stock', hasSub: true },
  { page: 'accounts', label: 'Quản lý tài khoản', iconType: 'accounts' },
  { page: 'shifts', label: 'Quản lý ca', iconType: 'shifts' },
];

const employeeLinks: Link[] = [
  { page: 'sales', label: 'Bán hàng', iconType: 'sales' },
  { page: 'orders', label: 'Quản lý đơn hàng', iconType: 'orders', hasSub: true },
  { page: 'count', label: 'Kho', iconType: 'stock', hasSub: true },
  { page: 'schedule', label: 'Lịch làm việc của tôi', iconType: 'shifts', hasSub: true },
];

const stockPages: Page[] = ['stock', 'receipts', 'losses', 'count', 'closing'];

function NavIcon({ type }: { type: NavIconType }) {
  const { image, width } = navIcons[type];
  return (
    <span className="nav-icon" aria-hidden="true">
      <span
        className="nav-icon-image"
        style={{ maskImage: `url("${image}")`, width }}
      />
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const { page, go } = useRouter();
  const notice = useNotice();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const task = useTask();
  const manager = user!.vai_tro === 'Quản lý';
  const links = manager ? managerLinks : employeeLinks;

  const initials = user!.ho_ten
    .trim()
    .split(/\s+/)
    .slice(-3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  const navigate = (next: Page) => {
    setMenuOpen(false);
    go(next);
  };

  const isStockActive = stockPages.includes(page);
  const isOrdersActive = page === 'orders';
  const confirmLogout = async () => {
    const succeeded = await task.run(logout);
    setLoggingOut(false);
    notice(
      succeeded
        ? 'Đăng xuất thành công!'
        : 'Đăng xuất chưa thành công. Vui lòng thử lại',
      succeeded ? 'logout-success' : 'logout-error',
    );
  };

  const stockSubLinks: { page: Page; label: string }[] = manager
    ? [
        { page: 'stock', label: 'Tổng hợp tồn kho' },
        { page: 'receipts', label: 'Lịch sử nhập hàng' },
        { page: 'losses', label: 'Lịch sử hao hụt' },
        { page: 'closing', label: 'Duyệt báo cáo cuối ca' },
      ]
    : [
        { page: 'count', label: 'Kiểm kê nguyên liệu' },
        { page: 'closing', label: 'Lập và gửi báo cáo cuối ca' },
      ];

  const orderSubLinks: { page: Page; label: string }[] = manager
    ? [{ page: 'orders', label: 'Lịch sử đơn hàng' }]
    : [{ page: 'orders', label: 'Theo dõi trạng thái đơn hàng' }];

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <strong>{store.shortName}</strong>
        <Button
          aria-label="Mở menu điều hướng"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          ☰
        </Button>
      </header>

      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng menu điều hướng"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`app-sidebar ${manager ? 'is-manager' : 'is-employee'}${menuOpen ? ' is-open' : ''}`}
        aria-label="Thanh điều hướng"
      >
        <a
          className="brand"
          href={manager ? '#/reports' : '#/sales'}
          onClick={(event) => {
            event.preventDefault();
            navigate(manager ? 'reports' : 'sales');
          }}
        >
          <div className="brand-logo-card">
            <img src="/logo.png" alt={store.name} />
          </div>
        </a>

        <nav className="main-navigation" aria-label="Điều hướng chính">
          {links.map((link) => {
            const isStockLink = link.page === 'stock' || link.page === 'count';
            const isOrdersLink = link.page === 'orders';

            const isActive =
              (isStockLink && isStockActive) ||
              (isOrdersLink && isOrdersActive) ||
              (!isStockLink && !isOrdersLink && page === link.page);

            const isExpanded =
              (isStockLink && isStockActive) || (isOrdersLink && isOrdersActive);

            return (
              <div key={link.page} className="nav-item-wrapper">
                <a
                  href={'#/' + link.page}
                  className={`nav-main-link${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(link.page);
                  }}
                >
                  <NavIcon type={link.iconType} />
                  <span className="nav-label">{link.label}</span>
                  {link.hasSub && (
                    <span
                      className={`nav-chevron${isExpanded ? ' is-expanded' : ''}`}
                      aria-hidden="true"
                    >
                      <svg
                        width="6"
                        height="9"
                        viewBox="0 0 6 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 1l3.5 3.5L1 8" />
                      </svg>
                    </span>
                  )}
                </a>

                {isOrdersLink && isOrdersActive && (
                  <nav
                    className="sub-navigation"
                    aria-label="Chức năng đơn hàng"
                  >
                    {orderSubLinks.map((sub) => (
                      <a
                        href={'#/' + sub.page}
                        key={sub.label}
                        className={`sub-nav-link${page === sub.page ? ' is-active' : ''}`}
                        aria-current={page === sub.page ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(sub.page);
                        }}
                      >
                        {sub.label}
                      </a>
                    ))}
                  </nav>
                )}

                {isStockLink && isStockActive && (
                  <nav
                    className="sub-navigation"
                    aria-label="Chức năng kho"
                  >
                    {stockSubLinks.map((sub) => (
                      <a
                        href={'#/' + sub.page}
                        key={sub.page}
                        className={`sub-nav-link${page === sub.page ? ' is-active' : ''}`}
                        aria-current={page === sub.page ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(sub.page);
                        }}
                      >
                        {sub.label}
                      </a>
                    ))}
                  </nav>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-card">
            <span className="profile-avatar">{initials}</span>
            <div className="profile-info">
              <strong className="profile-name">{user!.ho_ten}</strong>
              <small className="profile-role">{user!.vai_tro}</small>
            </div>
          </div>
          <button
            className="logout-button"
            onClick={() => {
              task.setError('');
              setLoggingOut(true);
            }}
          >
            <span className="logout-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7.5 6.5 4 10a2 2 0 0 0 1.4 3.4H20m-5-5 5 5-5 5" />
              </svg>
            </span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <main className="app-main" id="main-content">
        {children}
      </main>

      {loggingOut && (
        <Confirm
          title="Đăng xuất"
          className="logout-confirm-modal"
          onClose={() => setLoggingOut(false)}
          onConfirm={() => void confirmLogout()}
          pending={task.pending}
        >
          Bạn có chắc chắn muốn đăng xuất không?
        </Confirm>
      )}
    </div>
  );
}
