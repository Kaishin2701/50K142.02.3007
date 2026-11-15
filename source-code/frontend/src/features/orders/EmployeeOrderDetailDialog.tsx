import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { Order } from '../../services/models';
import { money } from '../../app/format';
import { Button, Loading, Modal } from '../../components/ui';
import { formatOrderDateTime } from './ManagerOrderDetailDialog';

export default function EmployeeOrderDetailDialog({
  orderId,
  orderCode,
  onClose,
  onOrderUnavailable,
}: {
  orderId: string;
  orderCode?: string;
  onClose(): void;
  onOrderUnavailable?(orderId: string, code?: string): void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError('');

    // Chỉ đọc thông tin chi tiết qua GET /orders/:id, tuyệt đối không gọi API đổi trạng thái
    api<Order>(`/orders/${orderId}`)
      .then((data) => {
        if (!canceled) {
          setOrder(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!canceled) {
          setLoading(false);
          // A 404 does not identify why the order disappeared.
          if (err?.status === 404) {
            onClose();
            onOrderUnavailable?.(orderId, orderCode);
          } else {
            setError(err?.message || 'Không thể tải thông tin đơn hàng.');
          }
        }
      });

    return () => {
      canceled = true;
    };
  }, [orderId, orderCode]);

  const displayCode = order?.ma_don_hien_thi
    ? `#${order.ma_don_hien_thi}`
    : orderCode
      ? (orderCode.startsWith('#') ? orderCode : `#${orderCode}`)
      : `#${order?.ma_don || orderId}`;

  return (
    <Modal
      title="Chi tiết đơn hàng"
      className="order-detail-modal employee-order-detail-modal"
      onClose={onClose}
    >
      <div className="order-detail-surface">
        <p className="order-detail-subtitle">
          Thông tin chỉ để xem, không thay đổi trạng thái đơn hàng.
        </p>

        {loading && <Loading active />}
        {error && (
          <div className="order-detail-error" role="alert">
            {error}
          </div>
        )}

        {order && (
          <div className="order-detail-content">
            {/* Hộp thông tin nổi bật: Mã đơn, Thời gian lập đơn, Trạng thái hiện tại */}
            <div className="order-detail-highlight-card">
              <div className="order-detail-highlight-col">
                <span className="order-detail-highlight-label">Mã đơn</span>
                <strong className="order-detail-highlight-code">
                  {displayCode}
                </strong>
              </div>
              <div className="order-detail-highlight-col">
                <span className="order-detail-highlight-label">
                  Thời gian lập đơn
                </span>
                <span className="order-detail-highlight-time">
                  {formatOrderDateTime(order.thoi_gian_lap)}
                </span>
              </div>
              <div className="order-detail-highlight-col is-status">
                <span className="order-detail-highlight-label">
                  Trạng thái hiện tại
                </span>
                <span
                  className={`order-status-pill ${
                    order.trang_thai_pha_che === 'Chưa pha chế'
                      ? 'is-pending'
                      : 'is-in-progress'
                  }`}
                >
                  <span
                    className={`order-status-dot ${
                      order.trang_thai_pha_che === 'Chưa pha chế'
                        ? 'is-pending'
                        : 'is-in-progress'
                    }`}
                  />
                  {order.trang_thai_pha_che}
                </span>
              </div>
            </div>

            {/* Danh sách món */}
            <div className="order-detail-items-section">
              <h3 className="order-detail-items-title">Danh sách món</h3>
              <p className="order-detail-mobile-hint">
                Vuốt bảng sang ngang để xem đơn giá và thành tiền.
              </p>
              <div
                className="order-detail-table-wrapper"
                tabIndex={0}
                aria-label="Bảng món, cuộn ngang để xem toàn bộ cột"
              >
                <table className="order-detail-items-table">
                  <thead>
                    <tr>
                      <th className="th-name">Tên món</th>
                      <th className="th-qty">Số lượng</th>
                      <th className="th-price">Đơn giá</th>
                      <th className="th-total">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items?.map((item) => (
                      <tr key={item.ma_mon}>
                        <td className="td-name">{item.ten_mon_luc_lap}</td>
                        <td className="td-qty">{item.so_luong}</td>
                        <td className="td-price">
                          {money(item.don_gia_luc_lap)}
                        </td>
                        <td className="td-total">
                          <strong>
                            {money(
                              Number(item.so_luong) *
                                Number(item.don_gia_luc_lap),
                            )}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tổng tiền */}
            <div className="order-detail-total-row">
              <span className="order-detail-total-label">Tổng tiền</span>
              <strong className="order-detail-total-value">
                {money(order.tong_tien)}
              </strong>
            </div>

            {/* Chú thích & Nút Đóng khớp ảnh mẫu tải xuống (1).png */}
            <div className="order-detail-actions-row">
              <span className="order-detail-note">
                Đơn giá là giá tại thời điểm lập đơn.
              </span>
              <div className="order-detail-buttons">
                <Button
                  type="button"
                  className="order-detail-close-btn"
                  onClick={onClose}
                >
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
