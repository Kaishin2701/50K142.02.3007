import { useState, type ReactNode } from 'react';
import { useSession } from '../app/auth';
import { useTask } from '../app/data';
import { useRouter, type Page } from '../app/router';
import { Button, Confirm } from './ui';

type Link = { page: Page; label: string; icon: string };
const managerLinks: Link[] = [
  { page: 'reports', label: 'Tổng quan', icon: '4d779.svg' },
  { page: 'orders', label: 'Quản lý đơn hàng', icon: '97b10.svg' },
  { page: 'stock', label: 'Kho', icon: '9090e.svg' },
  { page: 'accounts', label: 'Quản lý tài khoản', icon: 'bce45.svg' },
  { page: 'shifts', label: 'Quản lý ca', icon: 'be514.svg' },
];
const employeeLinks: Link[] = [
  { page: 'sales', label: 'Bán hàng', icon: '97b10.svg' },
  { page: 'orders', label: 'Quản lý đơn hàng', icon: '97b10.svg' },
  { page: 'count', label: 'Kho', icon: '9090e.svg' },
  { page: 'schedule', label: 'Lịch làm việc của tôi', icon: 'be514.svg' },
];
const stockPages: Page[] = ['stock', 'receipts', 'losses', 'count', 'closing'];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const { page, go } = useRouter();
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
  const subLinks: { page: Page; label: string }[] = manager
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
  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <strong>Mê Cà Phê</strong>
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
        className={'app-sidebar' + (menuOpen ? ' is-open' : '')}
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
          <img src="/assets/figma/261-37926/b4c0b.png" alt="Mê Cà Phê" />
        </a>
        <nav className="main-navigation" aria-label="Điều hướng chính">
          {links.map((link) => (
            <div key={link.page}>
              <a
                href={'#/' + link.page}
                aria-current={
                  page === link.page ||
                  ((link.page === 'stock' || link.page === 'count') &&
                    stockPages.includes(page))
                    ? 'page'
                    : undefined
                }
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.page);
                }}
              >
                <span
                  className="navigation-icon"
                  aria-hidden="true"
                  style={{
                    maskImage: `url(/assets/figma/261-37926/${link.icon})`,
                  }}
                />
                {link.label}
              </a>
              {(link.page === 'stock' || link.page === 'count') &&
                stockPages.includes(page) && (
                  <nav className="sub-navigation" aria-label="Chức năng kho">
                    {subLinks.map((sub) => (
                      <a
                        href={'#/' + sub.page}
                        key={sub.page}
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
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{user!.ho_ten}</strong>
              <small>{user!.vai_tro}</small>
            </div>
          </div>
          <button
            className="logout-button"
            onClick={() => {
              task.setError('');
              setLoggingOut(true);
            }}
          >
            <span aria-hidden="true">↪</span>Đăng xuất
          </button>
        </div>
      </aside>
      <main className="app-main" id="main-content">
        {children}
      </main>
      {loggingOut && (
        <Confirm
          title="Đăng xuất"
          onClose={() => setLoggingOut(false)}
          onConfirm={() => void task.run(logout)}
          pending={task.pending}
          error={task.error}
        >
          Bạn có chắc chắn muốn đăng xuất không?
        </Confirm>
      )}
    </div>
  );
}
