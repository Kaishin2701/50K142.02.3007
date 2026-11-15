import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useDataStore, useTask } from '../../app/data';
import { money } from '../../app/format';
import { api, query } from '../../services/api';
import type { Order } from '../../services/models';
import { Loading, useNotice } from '../../components/ui';
import EmployeeOrderDetailDialog from './EmployeeOrderDetailDialog';
import { formatOrderDateTime } from './ManagerOrderDetailDialog';

const PAGE_SIZE = 8;

const statusOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'Chưa pha chế', label: 'Chưa pha chế' },
  { value: 'Bắt đầu pha chế', label: 'Bắt đầu pha chế' },
] as const;

export default function EmployeeOrderTracking() {
  const { version, refresh: refreshStore } = useDataStore();
  const notice = useNotice();
  const task = useTask();

  // Custom select dropdown cho Trạng thái
  const statusWrapper = useRef<HTMLDivElement>(null);
  const statusTrigger = useRef<HTMLButtonElement>(null);
  const statusOptionsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState(0);

  // Form input state (chưa commit khi chưa bấm Tìm kiếm)
  const [form, setForm] = useState({
    code: '',
    status: '',
  });

  // Filter đã commit qua form submit
  const [appliedFilters, setAppliedFilters] = useState<{
    code: string;
    status: string;
    rawCode: string;
  }>({
    code: '',
    status: '',
    rawCode: '',
  });

  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog & Thao tác
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderCode, setSelectedOrderCode] = useState<string | undefined>(
    undefined,
  );
  const [orderNotice, setOrderNotice] = useState<{
    code: string;
    reason: 'cancelled' | 'unavailable';
  } | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  // Đóng dropdown Trạng thái khi click ra ngoài
  useEffect(() => {
    if (!statusOpen) return;
    const handleOutsideClick = (event: PointerEvent) => {
      if (!statusWrapper.current?.contains(event.target as Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [statusOpen]);

  // Focus option đang chọn khi mở dropdown Trạng thái
  useEffect(() => {
    if (statusOpen) {
      statusOptionsRef.current[activeStatus]?.focus();
    }
  }, [statusOpen, activeStatus]);

  const selectStatus = (index: number) => {
    setForm((previous) => ({
      ...previous,
      status: statusOptions[index].value,
    }));
    setActiveStatus(index);
    setStatusOpen(false);
    statusTrigger.current?.focus();
  };

  const moveStatusFocus = (index: number) => {
    const next = Math.max(0, Math.min(statusOptions.length - 1, index));
    setActiveStatus(next);
    statusOptionsRef.current[next]?.focus();
  };

  // Fetch dữ liệu từ GET /orders
  const fetchOrders = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const q = query({
        code: appliedFilters.code || undefined,
        status: appliedFilters.status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      const result = await api<Order[]>(`/orders?${q}`, { signal });
      if (signal.aborted) return;
      setOrders(result);
      if (result.length === 0 && page > 1) {
        setPage(page - 1);
        return;
      }
      const total = result.length > 0
        ? Number(result[0].total ?? result.length)
        : 0;
      setTotalOrders(total);
    } catch (err: unknown) {
      if (signal.aborted) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách đơn hàng.',
      );
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [appliedFilters, page]);

  // Tự động tải lại khi filter/page đổi hoặc khi hệ thống phát sự kiện làm mới dữ liệu (version)
  useEffect(() => {
    const controller = new AbortController();
    void fetchOrders(controller.signal);
    return () => controller.abort();
  }, [fetchOrders, version, searchVersion]);

  // Submit tìm kiếm
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setStatusOpen(false);
    const raw = form.code.trim();
    const normalizedCode = raw.replace(/^#/, '');
    setAppliedFilters({
      code: normalizedCode,
      status: form.status,
      rawCode: raw,
    });
    setHasSearched(Boolean(raw || form.status));
    setPage(1);
    setOrderNotice(null);
    setSearchVersion((value) => value + 1);
  };

  const handleOpenDetail = (order: Order) => {
    setSelectedOrderId(order.ma_don);
    setSelectedOrderCode(order.ma_don_hien_thi || order.ma_don);
  };

  const handleOrderUnavailableFromDetail = (
    _id: string,
    code?: string,
  ) => {
    setSelectedOrderId(null);
    setSelectedOrderCode(undefined);
    setOrderNotice({
      code: code ? code.replace(/^#/, '') : 'đơn',
      reason: 'unavailable',
    });
    refreshStore();
  };

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const startIndex = orders.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex =
    orders.length === 0 ? 0 : Math.min(page * PAGE_SIZE, totalOrders);

  return (
    <div className="order-history-page">
      {/* Breadcrumb và Tiêu đề */}
      <div className="order-history-header">
        <div className="order-history-breadcrumb">
          QUẢN LÝ ĐƠN HÀNG / THEO DÕI TRẠNG THÁI
        </div>
        <h1 className="order-history-title">Theo dõi trạng thái đơn hàng</h1>
      </div>

      {/* Khối lọc: Chỉ gồm Mã đơn, Trạng thái (3 lựa chọn), và Nút Tìm kiếm */}
      <div className="order-history-filter-card">
        <form onSubmit={handleSubmit} noValidate>
          <div className="order-employee-filter-row">
            <div className="order-history-filter-field">
              <label
                className="order-history-label"
                htmlFor="filter-order-code"
              >
                Mã đơn
              </label>
              <input
                id="filter-order-code"
                type="text"
                className="order-history-input"
                placeholder="Nhập mã đơn"
                value={form.code}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, code: e.target.value }))
                }
                maxLength={30}
              />
            </div>

            <div className="order-history-filter-field is-select">
              <label
                className="order-history-label"
                htmlFor="filter-order-status"
              >
                Trạng thái
              </label>
              <div
                className="order-history-select-wrapper"
                ref={statusWrapper}
              >
                <button
                  id="filter-order-status"
                  ref={statusTrigger}
                  type="button"
                  className="order-history-select"
                  aria-haspopup="listbox"
                  aria-expanded={statusOpen}
                  aria-controls="order-employee-status-options"
                  onClick={() => {
                    const currentIndex = statusOptions.findIndex(
                      (item) => item.value === form.status,
                    );
                    setActiveStatus(currentIndex >= 0 ? currentIndex : 0);
                    setStatusOpen((open) => !open);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'ArrowDown' ||
                      event.key === 'ArrowUp'
                    ) {
                      event.preventDefault();
                      const selected = statusOptions.findIndex(
                        (item) => item.value === form.status,
                      );
                      const next =
                        event.key === 'ArrowDown'
                          ? Math.min(selected + 1, statusOptions.length - 1)
                          : Math.max(selected - 1, 0);
                      setActiveStatus(next);
                      setStatusOpen(true);
                    }
                  }}
                >
                  <span>
                    {statusOptions.find((item) => item.value === form.status)
                      ?.label ?? 'Tất cả'}
                  </span>
                  <span
                    className="order-history-select-chevron"
                    aria-hidden="true"
                  >
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

                {statusOpen && (
                  <div
                    id="order-employee-status-options"
                    className="order-history-select-menu"
                    role="listbox"
                    aria-label="Trạng thái"
                  >
                    {statusOptions.map((item, index) => (
                      <button
                        key={item.value}
                        ref={(element) => {
                          statusOptionsRef.current[index] = element;
                        }}
                        type="button"
                        role="option"
                        aria-selected={form.status === item.value}
                        className="order-history-select-option"
                        onClick={() => selectStatus(index)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setStatusOpen(false);
                            statusTrigger.current?.focus();
                          } else if (
                            event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp'
                          ) {
                            event.preventDefault();
                            moveStatusFocus(
                              activeStatus +
                                (event.key === 'ArrowDown' ? 1 : -1),
                            );
                          } else if (
                            event.key === 'Home' ||
                            event.key === 'End'
                          ) {
                            event.preventDefault();
                            moveStatusFocus(
                              event.key === 'Home'
                                ? 0
                                : statusOptions.length - 1,
                            );
                          } else if (event.key === 'Tab') {
                            setStatusOpen(false);
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

            <div className="order-history-filter-action">
              <button type="submit" className="order-history-submit-btn">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Tìm kiếm
              </button>
            </div>
          </div>

          <div className="order-history-filter-hint">
            <span className="order-history-hint-icon">ⓘ</span>
            Theo dõi các đơn đang xử lý. Việc xem chi tiết không làm thay đổi
            trạng thái đơn hàng.
          </div>
        </form>
      </div>

      {/* Cảnh báo: Đơn hàng không còn tồn tại vì đã bị hủy (khớp ảnh tải xuống (5).png) */}
      {orderNotice && (
        <div className="order-cancelled-banner" role="alert">
          <div className="order-cancelled-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="order-cancelled-content">
            <strong className="order-cancelled-title">
              {orderNotice.reason === 'cancelled'
                ? 'Đơn hàng không còn tồn tại vì đã bị hủy'
                : 'Đơn hàng không còn khả dụng'}
            </strong>
            <p className="order-cancelled-desc">
              Đơn{' '}
              {orderNotice.code.startsWith('#')
                ? orderNotice.code
                : `#${orderNotice.code}`}{' '}
              {orderNotice.reason === 'cancelled'
                ? 'đã được hủy và loại khỏi danh sách. Danh sách đơn đang xử lý đã được cập nhật.'
                : 'không thể mở lúc này. Danh sách đơn đang xử lý đã được cập nhật.'}
            </p>
          </div>
        </div>
      )}

      {/* Bảng kết quả */}
      <div className="order-history-table-card">
        <h2 className="order-history-section-title">
          {hasSearched ? 'Kết quả tìm kiếm' : 'Đơn hàng đang xử lý'}
        </h2>
        <p className="order-employee-subtitle">
          Chỉ gồm đơn chưa pha chế và bắt đầu pha chế. Chọn một dòng để xem chi
          tiết.
        </p>

        {loading && (
          <div className="order-history-loading">
            <Loading active />
          </div>
        )}

        {error && (
          <div className="order-history-api-error" role="alert">
            {error}
          </div>
        )}

        {/* Khung bảng luôn hiển thị cấu trúc tiêu đề theo ảnh */}
        <div
          className="order-history-table-wrapper"
          tabIndex={0}
          aria-label="Danh sách đơn hàng đang xử lý"
        >
          <table className="order-history-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>STT</th>
                <th>Mã đơn</th>
                <th>Thời gian lập đơn</th>
                <th style={{ textAlign: 'right' }}>Tổng tiền</th>
                <th>Trạng thái hiện tại</th>
                <th style={{ width: '70px', textAlign: 'right' }}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            {orders.length > 0 && (
              <tbody>
                {orders.map((order, idx) => {
                  const isPending =
                    order.trang_thai_pha_che === 'Chưa pha chế';
                  return (
                    <tr
                      key={order.ma_don}
                      className="order-history-row"
                      onClick={() => handleOpenDetail(order)}
                    >
                      <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td>
                        <strong className="order-code-cell">
                          #{order.ma_don_hien_thi || order.ma_don}
                        </strong>
                      </td>
                      <td>{formatOrderDateTime(order.thoi_gian_lap)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {money(order.tong_tien)}
                      </td>
                      <td>
                        <span
                          className={`order-status-pill ${
                            isPending ? 'is-pending' : 'is-in-progress'
                          }`}
                        >
                          <span
                            className={`order-status-dot ${
                              isPending ? 'is-pending' : 'is-in-progress'
                            }`}
                          />
                          {order.trang_thai_pha_che}
                        </span>
                      </td>
                      <td
                        style={{ textAlign: 'right' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="order-row-action-cell"
                        >
                          {/* Mũi tên mở chi tiết theo ảnh mẫu */}
                          <button
                            type="button"
                            className="order-row-action-btn"
                            title="Xem chi tiết đơn hàng"
                            aria-label={`Xem chi tiết đơn ${order.ma_don_hien_thi || order.ma_don}`}
                            onClick={() => handleOpenDetail(order)}
                          >
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>

                          {/* Menu thao tác nhanh gọn cho các chức năng trong code hiện tại */}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>

        {/* Trạng thái trống khớp từng ảnh */}
        {!loading && orders.length === 0 && (
          <div className="order-history-empty-state">
            <div className="order-history-empty-icon">
              {hasSearched ? (
                // Icon tìm kiếm có dấu x (tải xuống (4).png)
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7d6657"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  <line x1="9" y1="9" x2="13" y2="13" />
                  <line x1="13" y1="9" x2="9" y2="13" />
                </svg>
              ) : (
                // Icon tách cà phê (tải xuống (3).png)
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7d6657"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="2" x2="6" y2="4" />
                  <line x1="10" y1="2" x2="10" y2="4" />
                  <line x1="14" y1="2" x2="14" y2="4" />
                </svg>
              )}
            </div>

            <h3 className="order-history-empty-title">
              {hasSearched
                ? 'Không tìm thấy đơn hàng phù hợp'
                : 'Hiện không có đơn hàng đang xử lý'}
            </h3>
            <p className="order-history-empty-desc">
              {hasSearched
                ? 'Vui lòng kiểm tra mã đơn hoặc chọn trạng thái khác rồi tìm kiếm lại.'
                : 'Các đơn chưa pha chế hoặc bắt đầu pha chế sẽ được hiển thị tại đây.'}
            </p>
          </div>
        )}

        {/* Footer: Thông tin đếm đơn và phân trang */}
        <div className="order-history-footer">
          <div className="order-history-count">
            {orders.length === 0
              ? 'Hiển thị 0 đơn hàng'
              : `Hiển thị ${startIndex}–${endIndex} trên ${totalOrders} đơn`}
          </div>

          {totalPages > 1 && (
            <div className="order-history-pagination">
              <button
                type="button"
                className="order-pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <div className="order-pagination-pages">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      className={`order-pagination-page-btn ${
                        pageNum === page ? 'is-active' : ''
                      }`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="order-pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Hộp thoại Chi tiết đơn hàng (Chế độ chỉ xem, khớp ảnh tải xuống (1) & (2)) */}
      {selectedOrderId && (
        <EmployeeOrderDetailDialog
          orderId={selectedOrderId}
          orderCode={selectedOrderCode}
          onClose={() => {
            setSelectedOrderId(null);
            setSelectedOrderCode(undefined);
          }}
          onOrderUnavailable={handleOrderUnavailableFromDetail}
        />
      )}

    </div>
  );
}
