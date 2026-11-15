import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { Order } from '../../services/models';
import { money } from '../../app/format';
import { Button, Loading, Modal } from '../../components/ui';

export function formatOrderDateTime(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(d).replace(',', '');
}

export default function ManagerOrderDetailDialog({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose(): void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError('');

    api<Order>(`/orders/${orderId}`)
      .then((data) => {
        if (!canceled) {
          setOrder(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!canceled) {
          setError(err?.message || 'Không thể tải thông tin đơn hàng.');
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [orderId]);

  const paymentDisplay = (() => {
    if (!order) return 'Chưa thanh toán';
    const successfulPayment = order.payments?.find(
      (p) => p.trang_thai === 'Thành công',
    );
    const method = successfulPayment?.phuong_thuc || order.phuong_thuc;
    if (!method) return 'Chưa thanh toán';
    return method === 'Chuyển khoản qua QR' ? 'Chuyển khoản' : method;
  })();

  return (
    <Modal
      title="Chi tiết đơn hàng"
      className="order-detail-modal"
      onClose={onClose}
    >
      <div className="order-detail-surface">
        <p className="order-detail-subtitle">
          Đơn đã hoàn tất pha chế. Thông tin chỉ để xem.
        </p>

        {loading && <Loading active />}
        {error && <div className="order-detail-error" role="alert">{error}</div>}

        {order && (
          <div className="order-detail-content">
            {/* Hộp thông tin nổi bật: Mã đơn, Thời gian lập đơn, Trạng thái */}
            <div className="order-detail-highlight-card">
              <div className="order-detail-highlight-col">
                <span className="order-detail-highlight-label">Mã đơn</span>
                <strong className="order-detail-highlight-code">
                  #{order.ma_don_hien_thi || order.ma_don}
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
                <span className="order-detail-highlight-label">Trạng thái</span>
                <span className="order-detail-status-pill">
                  <span className="order-detail-status-dot" />
                  {order.trang_thai_pha_che}
                </span>
              </div>
            </div>

            {/* Dòng thông tin nhân viên và phương thức thanh toán */}
            <div className="order-detail-meta-row">
              <div className="order-detail-meta-item">
                <span className="order-detail-meta-label">
                  Nhân viên lập đơn:
                </span>
                <strong className="order-detail-meta-value">
                  {order.nhan_vien_lap || '—'}
                </strong>
              </div>
              <div className="order-detail-meta-item">
                <span className="order-detail-meta-label">
                  Phương thức thanh toán:
                </span>
                <strong className="order-detail-meta-value">
                  {paymentDisplay}
                </strong>
              </div>
            </div>

            {/* Danh sách món */}
            <div className="order-detail-items-section">
              <h3 className="order-detail-items-title">Danh sách món</h3>
              <p className="order-detail-mobile-hint">Vuốt bảng sang ngang để xem đơn giá và thành tiền.</p>
              <div className="order-detail-table-wrapper" tabIndex={0} aria-label="Bảng món, cuộn ngang để xem toàn bộ cột">
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

            {/* Chú thích & Nút hành động */}
            <div className="order-detail-actions-row">
              <span className="order-detail-note">
                Đơn giá là giá tại thời điểm lập đơn.
              </span>
              <div className="order-detail-buttons">
                <Button
                  type="button"
                  className="order-detail-close-btn"
                  onClick={onClose}
                  autoFocus
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
