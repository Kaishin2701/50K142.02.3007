import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useResource } from '../../app/data';
import { money } from '../../app/format';
import { query } from '../../services/api';
import type { Order } from '../../services/models';
import { Loading } from '../../components/ui';
import ManagerOrderDetailDialog, {
  formatOrderDateTime,
} from './ManagerOrderDetailDialog';

const PAGE_SIZE = 8;
const paymentMethods = [
  { value: '', label: 'Tất cả' },
  { value: 'Tiền mặt', label: 'Tiền mặt' },
  { value: 'Chuyển khoản qua QR', label: 'Chuyển khoản' },
] as const;

type ValidationError = {
  field: 'code' | 'from' | 'to';
  title: string;
  subtitle: string;
};

function parseDateInput(value: string): {
  valid: boolean;
  iso?: string;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true };

  // Yêu cầu định dạng chính xác dd/MM/yyyy
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return { valid: false, error: 'FORMAT' };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return { valid: false, error: 'FORMAT' };
  }

  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return { valid: false, error: 'FORMAT' };
  }

  const iso = `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return { valid: true, iso };
}

export default function ManagerOrderHistory() {
  const fromPicker = useRef<HTMLInputElement>(null);
  const toPicker = useRef<HTMLInputElement>(null);
  const methodWrapper = useRef<HTMLDivElement>(null);
  const methodTrigger = useRef<HTMLButtonElement>(null);
  const methodOptions = useRef<Array<HTMLButtonElement | null>>([]);
  const [methodOpen, setMethodOpen] = useState(false);
  const [activeMethod, setActiveMethod] = useState(0);
  const [form, setForm] = useState({
    code: '',
    from: '',
    to: '',
    method: '',
  });

  const [appliedFilters, setAppliedFilters] = useState<{
    code: string;
    from: string;
    to: string;
    method: string;
  }>({
    code: '',
    from: '',
    to: '',
    method: '',
  });

  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [validationError, setValidationError] =
    useState<ValidationError | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!methodOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!methodWrapper.current?.contains(event.target as Node)) {
        setMethodOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    methodOptions.current[activeMethod]?.focus();
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [methodOpen]);

  const selectMethod = (index: number) => {
    setForm((previous) => ({ ...previous, method: paymentMethods[index].value }));
    setActiveMethod(index);
    setMethodOpen(false);
    methodTrigger.current?.focus();
  };

  const moveMethodFocus = (index: number) => {
    const next = Math.max(0, Math.min(paymentMethods.length - 1, index));
    setActiveMethod(next);
    methodOptions.current[next]?.focus();
  };

  const requestQuery: Record<string, any> = {
    page,
    limit: PAGE_SIZE,
  };
  if (appliedFilters.code) {
    requestQuery.code = appliedFilters.code.replace(/^#/, '').trim();
  }
  if (appliedFilters.from) {
    requestQuery.from = appliedFilters.from;
  }
  if (appliedFilters.to) {
    requestQuery.to = appliedFilters.to;
  }
  if (appliedFilters.method) {
    requestQuery.method = appliedFilters.method;
  }

  const path = '/orders/history?' + query(requestQuery);
  const orders = useResource<Order[]>(path, []);

  useEffect(() => {
    if (page > 1 && !orders.loading && !orders.error && orders.data.length === 0) {
      setPage(1);
    }
  }, [page, orders.loading, orders.error, orders.data.length]);

  const total = orders.data[0]?.total ?? orders.data.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();

    // 1. Kiểm tra Mã đơn: chỉ cho phép chữ, số, dấu #, gạch nối, khoảng trắng
    const trimmedCode = form.code.trim();
    if (trimmedCode) {
      const validCodeRegex = /^[a-zA-Z0-9#\-_ ]+$/;
      if (!validCodeRegex.test(trimmedCode)) {
        setValidationError({
          field: 'code',
          title: 'Điều kiện tra cứu không hợp lệ. Vui lòng kiểm tra lại Mã đơn',
          subtitle:
            'Định dạng mã đơn không hợp lệ. Danh sách kết quả trước đó được giữ nguyên.',
        });
        return;
      }
    }

    // 2. Kiểm tra định dạng Từ ngày
    const fromCheck = parseDateInput(form.from);
    if (!fromCheck.valid) {
      setValidationError({
        field: 'from',
        title: 'Điều kiện tra cứu không hợp lệ. Vui lòng kiểm tra lại Từ ngày',
        subtitle:
          'Nhập Từ ngày theo định dạng dd/MM/yyyy. Danh sách kết quả trước đó được giữ nguyên.',
      });
      return;
    }

    // 3. Kiểm tra định dạng Đến ngày
    const toCheck = parseDateInput(form.to);
    if (!toCheck.valid) {
      setValidationError({
        field: 'to',
        title: 'Điều kiện tra cứu không hợp lệ. Vui lòng kiểm tra lại Đến ngày',
        subtitle:
          'Nhập Đến ngày theo định dạng dd/MM/yyyy. Danh sách kết quả trước đó được giữ nguyên.',
      });
      return;
    }

    // 4. Kiểm tra Từ ngày không được sau Đến ngày
    if (fromCheck.iso && toCheck.iso && fromCheck.iso > toCheck.iso) {
      setValidationError({
        field: 'from',
        title: 'Điều kiện tra cứu không hợp lệ. Vui lòng kiểm tra lại Từ ngày',
        subtitle:
          'Từ ngày không được sau Đến ngày. Danh sách kết quả trước đó được giữ nguyên.',
      });
      return;
    }

    // Hợp lệ: Xóa lỗi và áp dụng điều kiện lọc mới
    setValidationError(null);
    setHasSearched(true);
    setPage(1);
    setAppliedFilters({
      code: trimmedCode,
      from: fromCheck.iso || '',
      to: toCheck.iso || '',
      method: form.method,
    });
    // Re-run a search even when the submitted values have not changed.
    orders.refresh();
  };

  const getSectionTitle = () => {
    if (validationError) {
      return 'Lịch sử đơn hàng · Kết quả trước đó';
    }
    if (hasSearched) {
      return 'Kết quả tra cứu';
    }
    return 'Lịch sử đơn hàng';
  };

  // Tính số lượng dòng đang hiển thị
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  // Danh sách các trang hiển thị trong phân trang
  const renderPaginationPages = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('…');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="order-history-page">
      {/* Breadcrumb & Tiêu đề */}
      <div className="order-history-header">
        <p className="order-history-breadcrumb">
          QUẢN LÝ ĐƠN HÀNG / LỊCH SỬ ĐƠN HÀNG
        </p>
        <h1 className="order-history-title">Tra cứu lịch sử đơn hàng</h1>
      </div>

      {/* Khối lọc */}
      <div className="order-history-filter-card">
        <form onSubmit={handleSearch} noValidate>
          <div className="order-history-filter-row">
            {/* Mã đơn */}
            <div className="order-history-filter-field">
              <label htmlFor="filter-code" className="order-history-label">
                Mã đơn
              </label>
              <input
                id="filter-code"
                type="text"
                placeholder="Nhập mã đơn"
                className={`order-history-input${
                  validationError?.field === 'code' ? ' is-error' : ''
                }`}
                value={form.code}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, code: e.target.value }));
                  if (validationError?.field === 'code') setValidationError(null);
                }}
                maxLength={30}
              />
            </div>

            {/* Từ ngày */}
            <div className="order-history-filter-field">
              <label htmlFor="filter-from" className="order-history-label">
                Từ ngày
              </label>
              <div className="order-history-date-wrapper">
                <input
                  id="filter-from"
                  type="text"
                  placeholder="dd/MM/yyyy"
                  className={`order-history-input${
                    validationError?.field === 'from' ? ' is-error' : ''
                  }`}
                  value={form.from}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, from: e.target.value }));
                    if (validationError?.field === 'from') setValidationError(null);
                  }}
                  maxLength={10}
                />
                <span className="order-history-calendar-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="3"
                      stroke="#A18875"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M16 2V6M8 2V6M3 10H21"
                      stroke="#A18875"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <input
                  ref={fromPicker}
                  type="date"
                  className="order-history-native-date"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={parseDateInput(form.from).iso ?? ''}
                  onChange={(event) => {
                    const [year, month, day] = event.target.value.split('-');
                    setForm((prev) => ({
                      ...prev,
                      from: year ? `${day}/${month}/${year}` : '',
                    }));
                    if (validationError?.field === 'from') setValidationError(null);
                  }}
                />
                <button
                  type="button"
                  className="order-history-calendar-button"
                  aria-label="Chọn Từ ngày"
                  onClick={() => fromPicker.current?.showPicker?.()}
                />
              </div>
            </div>

            {/* Đến ngày */}
            <div className="order-history-filter-field">
              <label htmlFor="filter-to" className="order-history-label">
                Đến ngày
              </label>
              <div className="order-history-date-wrapper">
                <input
                  id="filter-to"
                  type="text"
                  placeholder="dd/MM/yyyy"
                  className={`order-history-input${
                    validationError?.field === 'to' ? ' is-error' : ''
                  }`}
                  value={form.to}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, to: e.target.value }));
                    if (validationError?.field === 'to') setValidationError(null);
                  }}
                  maxLength={10}
                />
                <span className="order-history-calendar-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="3"
                      stroke="#A18875"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M16 2V6M8 2V6M3 10H21"
                      stroke="#A18875"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <input
                  ref={toPicker}
                  type="date"
                  className="order-history-native-date"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={parseDateInput(form.to).iso ?? ''}
                  onChange={(event) => {
                    const [year, month, day] = event.target.value.split('-');
                    setForm((prev) => ({
                      ...prev,
                      to: year ? `${day}/${month}/${year}` : '',
                    }));
                    if (validationError?.field === 'to') setValidationError(null);
                  }}
                />
                <button
                  type="button"
                  className="order-history-calendar-button"
                  aria-label="Chọn Đến ngày"
                  onClick={() => toPicker.current?.showPicker?.()}
                />
              </div>
            </div>

            {/* Phương thức thanh toán */}
            <div className="order-history-filter-field is-select">
              <label htmlFor="filter-method" className="order-history-label">
                Phương thức thanh toán
              </label>
              <div className="order-history-select-wrapper" ref={methodWrapper}>
                <button
                  id="filter-method"
                  ref={methodTrigger}
                  type="button"
                  className="order-history-select"
                  aria-haspopup="listbox"
                  aria-expanded={methodOpen}
                  aria-controls="order-history-method-options"
                  onClick={() => {
                    setActiveMethod(paymentMethods.findIndex((item) => item.value === form.method));
                    setMethodOpen((open) => !open);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      const selected = paymentMethods.findIndex((item) => item.value === form.method);
                      const next = event.key === 'ArrowDown'
                        ? Math.min(selected + 1, paymentMethods.length - 1)
                        : Math.max(selected - 1, 0);
                      setActiveMethod(next);
                      setMethodOpen(true);
                    }
                  }}
                >
                  <span>{paymentMethods.find((item) => item.value === form.method)?.label}</span>
                  <span className="order-history-select-chevron" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M6 9L12 15L18 9"
                        stroke="#7D6657"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                {methodOpen && (
                  <div
                    id="order-history-method-options"
                    className="order-history-select-menu"
                    role="listbox"
                    aria-label="Phương thức thanh toán"
                  >
                    {paymentMethods.map((item, index) => (
                      <button
                        key={item.value}
                        ref={(element) => { methodOptions.current[index] = element; }}
                        type="button"
                        role="option"
                        aria-selected={form.method === item.value}
                        className="order-history-select-option"
                        onClick={() => selectMethod(index)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setMethodOpen(false);
                            methodTrigger.current?.focus();
                          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            moveMethodFocus(activeMethod + (event.key === 'ArrowDown' ? 1 : -1));
                          } else if (event.key === 'Home' || event.key === 'End') {
                            event.preventDefault();
                            moveMethodFocus(event.key === 'Home' ? 0 : paymentMethods.length - 1);
                          } else if (event.key === 'Tab') {
                            setMethodOpen(false);
                          }
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Nút Tra cứu */}
            <div className="order-history-filter-action">
              <button type="submit" className="order-history-submit-btn">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span>Tra cứu</span>
              </button>
            </div>
          </div>

          {/* Dòng ghi chú tra cứu */}
          <div className="order-history-filter-hint">
            <span className="order-history-hint-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="#7D6657"
                  strokeWidth="1.8"
                />
                <path
                  d="M12 16V12M12 8H12.01"
                  stroke="#7D6657"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>
              Tra cứu theo ngày lập đơn · Tính trọn ngày từ 00:00 đến 23:59 của
              các ngày đã chọn.
            </span>
          </div>

          {/* Banner thông báo lỗi nếu nhập sai điều kiện */}
          {validationError && (
            <div className="order-history-error-banner" role="alert">
              <div className="order-history-error-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="#B8332A"
                    strokeWidth="2"
                  />
                  <line
                    x1="12"
                    y1="8"
                    x2="12"
                    y2="12"
                    stroke="#B8332A"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="16" r="1" fill="#B8332A" />
                </svg>
              </div>
              <div className="order-history-error-text">
                <strong className="order-history-error-title">
                  {validationError.title}
                </strong>
                <p className="order-history-error-sub">
                  {validationError.subtitle}
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Bảng danh sách kết quả */}
      <div className="order-history-table-card">
        <h2 className="order-history-section-title">{getSectionTitle()}</h2>

        {orders.loading && (
          <div className="order-history-loading">
            <Loading active />
          </div>
        )}

        {orders.error && (
          <div className="order-history-api-error" role="alert">
            {orders.error}
          </div>
        )}

        {!orders.loading && !orders.error && (
          <>
            <div className="order-history-table-wrapper">
              <table className="order-history-table">
                <thead>
                  <tr>
                    <th className="th-stt">STT</th>
                    <th className="th-code">Mã đơn</th>
                    <th className="th-time">Thời gian lập đơn</th>
                    <th className="th-total">Tổng tiền</th>
                    <th className="th-method">Phương thức thanh toán</th>
                    <th className="th-status">Trạng thái</th>
                    {orders.data.length > 0 && (
                      <th className="th-action" aria-label="Thao tác" />
                    )}
                  </tr>
                </thead>
                {orders.data.length > 0 && (
                  <tbody>
                    {orders.data.map((order, index) => {
                      const paymentText =
                        order.phuong_thuc === 'Chuyển khoản qua QR'
                          ? 'Chuyển khoản'
                          : order.phuong_thuc || 'Chưa thanh toán';

                      return (
                        <tr
                          key={order.ma_don}
                          className="order-history-row"
                          onClick={() => setSelectedOrderId(order.ma_don)}
                        >
                          <td className="td-stt">
                            {(page - 1) * PAGE_SIZE + index + 1}
                          </td>
                          <td className="td-code">
                            <strong>
                              #{order.ma_don_hien_thi || order.ma_don}
                            </strong>
                          </td>
                          <td className="td-time">
                            {formatOrderDateTime(order.thoi_gian_lap)}
                          </td>
                          <td className="td-total">
                            <strong>{money(order.tong_tien)}</strong>
                          </td>
                          <td className="td-method">{paymentText}</td>
                          <td className="td-status">
                            <span className="order-status-pill">
                              <span className="order-status-dot" />
                              {order.trang_thai_pha_che}
                            </span>
                          </td>
                          <td className="td-action">
                            <button
                              type="button"
                              className="order-row-action-btn"
                              aria-label={`Chi tiết đơn #${order.ma_don_hien_thi || order.ma_don}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderId(order.ma_don);
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
                                <path
                                  d="M9 18L15 12L9 6"
                                  stroke="#7D6657"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                )}
              </table>
            </div>

            {orders.data.length === 0 && (
              <div className="order-history-empty-state">
                <div className="order-history-empty-icon" aria-hidden="true">
                  {hasSearched ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle
                        cx="11"
                        cy="11"
                        r="8"
                        stroke="#A18875"
                        strokeWidth="1.8"
                      />
                      <line
                        x1="21"
                        y1="21"
                        x2="16.65"
                        y2="16.65"
                        stroke="#A18875"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8.5 8.5L13.5 13.5M13.5 8.5L8.5 13.5"
                        stroke="#A18875"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#A18875"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 2.5H18V21L16 19.5L14 21L12 19.5L10 21L8 19.5L6 21V2.5Z" />
                      <path d="M9 7.5H15M9 11H15M9 14.5H13.5" />
                    </svg>
                  )}
                </div>
                <h3 className="order-history-empty-title">
                  {hasSearched
                    ? 'Không tìm thấy đơn hàng phù hợp với điều kiện tra cứu'
                    : 'Chưa có đơn hàng nào trong lịch sử đơn hàng'}
                </h3>
                <p className="order-history-empty-desc">
                  {hasSearched
                    ? 'Vui lòng kiểm tra mã đơn, khoảng ngày hoặc phương thức thanh toán rồi tra cứu lại.'
                    : 'Các đơn hoàn tất pha chế sẽ xuất hiện tại đây để Quản lý tra cứu.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Thanh phân trang và số lượng */}
        <div className="order-history-footer">
          <div className="order-history-count">
            {total === 0
              ? 'Hiển thị 0 đơn hàng'
              : `Hiển thị ${startItem}–${endItem} trên ${total} đơn`}
          </div>

          {totalPages > 1 && (
            <div className="order-history-pagination" aria-label="Phân trang">
              <button
                type="button"
                className="order-pagination-btn prev-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trang trước
              </button>

              <div className="order-pagination-pages">
                {renderPaginationPages().map((p, idx) =>
                  typeof p === 'number' ? (
                    <button
                      key={idx}
                      type="button"
                      className={`order-pagination-page-btn${
                        p === page ? ' is-active' : ''
                      }`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ) : (
                    <span key={idx} className="order-pagination-ellipsis">
                      {p}
                    </span>
                  ),
                )}
              </div>

              <button
                type="button"
                className="order-pagination-btn next-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Trang sau &gt;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hộp thoại Chi tiết đơn hàng */}
      {selectedOrderId && (
        <ManagerOrderDetailDialog
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </div>
  );
}
