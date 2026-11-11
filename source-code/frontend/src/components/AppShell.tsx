import { useState, type ReactNode } from 'react';
import { useSession } from '../app/auth';
import { useTask } from '../app/data';
import { useRouter, type Page } from '../app/router';
import { Button, Confirm } from './ui';

type Link = {
  page: Page;
  label: string;
  icon: string;
  activeIcon: string;
  assets?: string;
};
const managerLinks: Link[] = [
  {
    page: 'reports',
    label: 'Tổng quan',
    icon: 'ed483.svg',
    activeIcon: '4d779.svg',
  },
  {
    page: 'orders',
    label: 'Quản lý đơn hàng',
    icon: '97b10.svg',
    activeIcon: '0094a.svg',
  },
  { page: 'stock', label: 'Kho', icon: '9090e.svg', activeIcon: '8bfd0.svg' },
  {
    page: 'accounts',
    label: 'Quản lý tài khoản',
    icon: 'bce45.svg',
    activeIcon: 'f0d04.svg',
  },
  {
    page: 'shifts',
    label: 'Quản lý ca',
    icon: 'be514.svg',
    activeIcon: 'c0874.svg',
  },
];
const employeeLinks: Link[] = [
  {
    page: 'sales',
    label: 'Bán hàng',
    icon: 'c2dde.svg',
    activeIcon: 'fa371.svg',
  },
  {
    page: 'orders',
    label: 'Quản lý đơn hàng',
    icon: '97b10.svg',
    activeIcon: '0094a.svg',
  },
  { page: 'count', label: 'Kho', icon: '9090e.svg', activeIcon: '8bfd0.svg' },
  {
    page: 'schedule',
    label: 'Lịch làm việc của tôi',
    icon: 'be514.svg',
    activeIcon: 'c0874.svg',
  },
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
  const breadcrumbs: Record<Page, string> = {
    reports: 'TỔNG QUAN / BÁO CÁO DOANH THU',
    accounts: 'QUẢN LÝ TÀI KHOẢN / DANH SÁCH TÀI KHOẢN',
    shifts: 'QUẢN LÝ CA / LỊCH LÀM VIỆC',
    schedule: 'LỊCH LÀM VIỆC CỦA TÔI',
    sales: 'BÁN HÀNG',
    orders: manager
      ? 'QUẢN LÝ ĐƠN HÀNG / LỊCH SỬ ĐƠN HÀNG'
      : 'QUẢN LÝ ĐƠN HÀNG / THEO DÕI TRẠNG THÁI',
    stock: 'KHO / TỔNG HỢP TỒN KHO',
    receipts: 'KHO / LỊCH SỬ NHẬP HÀNG',
    losses: 'KHO / LỊCH SỬ HAO HỤT',
    count: 'KHO / KIỂM KÊ NGUYÊN LIỆU',
    closing: manager
      ? 'KHO / DUYỆT BÁO CÁO CUỐI CA'
      : 'KHO / LẬP VÀ GỬI BÁO CÁO CUỐI CA',
  };
  const active = (next: Page) =>
    page === next ||
    ((next === 'stock' || next === 'count') && stockPages.includes(page));
  const iconPath = (filename: string) => {
    const folders: Record<string, string> = {
      '4d779.svg': '261-37926',
      '0094a.svg': '261-54234',
      '8bfd0.svg': '261-39479',
      'f0d04.svg': '261-28400',
      'c0874.svg': '261-31725',
      'b46ed.svg': '261-50660',
      'c2dde.svg': '261-46793',
      'ed483.svg': '261-28400',
      'daaae.svg': '261-37926',
      '5424e.svg': '261-39479',
    };
    if (filename === 'fa371.svg') return '/assets/figma/261-50660/fa371.svg';
    return `/assets/figma/${folders[filename] ?? '261-37926'}/${filename}`;
  };
  const initials = user!.ho_ten
    .trim()
    .split(/\s+/)
    .slice(-3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const navigate = (next: Page) => {
    setMenuOpen(false);
    if (next === page)
      window.dispatchEvent(
        new CustomEvent('me-page-reselect', { detail: next }),
      );
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
    <div
      className="app-shell"
      data-page={page}
      data-role={manager ? 'manager' : 'employee'}
    >
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
                aria-current={active(link.page) ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(link.page);
                }}
              >
                <span className="navigation-icon" aria-hidden="true">
                  <img
                    src={iconPath(
                      active(link.page) ? link.activeIcon : link.icon,
                    )}
                    alt=""
                  />
                </span>
                {link.label}
                {['orders', 'stock', 'count', 'schedule'].includes(
                  link.page,
                ) && (
                  <img
                    className="navigation-chevron"
                    src={iconPath(
                      active(link.page) ? '5424e.svg' : 'daaae.svg',
                    )}
                    alt=""
                  />
                )}
              </a>
              {link.page === 'orders' && page === 'orders' && (
                <nav className="sub-navigation" aria-label="Chức năng đơn hàng">
                  <a
                    href="#/orders"
                    aria-current="page"
                    onClick={(e) => e.preventDefault()}
                  >
                    {manager
                      ? 'Lịch sử đơn hàng'
                      : 'Theo dõi trạng thái đơn hàng'}
                  </a>
                </nav>
              )}
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
        <p className="app-breadcrumb">{breadcrumbs[page]}</p>
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
