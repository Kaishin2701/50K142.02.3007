import type { Order, Payment } from '../../services/models';
import { money } from '../../app/format';

type ThermalReceiptProps = {
  order: Order;
  payment?: Payment;
  cashReceived?: number;
  change?: number;
  paperSize?: string;
  copies?: number;
};

export function ThermalReceipt({
  order,
  payment,
  cashReceived,
  change,
  paperSize = '80 mm',
  copies = 1,
}: ThermalReceiptProps) {
  const lines = order.items ?? [];
  const totalQuantity = lines.reduce(
    (sum, line) => sum + Number(line.so_luong || 0),
    0,
  );
  const orderCode = order.ma_don_hien_thi
    ? `#${order.ma_don_hien_thi}`
    : `#${order.ma_don}`;
  const paymentMethod =
    payment?.phuong_thuc === 'Chuyển khoản qua QR'
      ? 'QR'
      : payment?.phuong_thuc ?? 'Tiền mặt';
  const effectiveCashReceived =
    cashReceived ?? (payment?.so_tien_nhan ? Number(payment.so_tien_nhan) : undefined);
  const effectiveChange =
    change ?? (payment?.tien_thua ? Number(payment.tien_thua) : undefined);

  return (
    <div className="thermal-receipt-wrapper">
      <div className="thermal-receipt">
        <header className="thermal-receipt-header">
          <h2 className="thermal-receipt-logo">MÊ</h2>
          <p className="thermal-receipt-title">HÓA ĐƠN GIẤY</p>
          <p className="thermal-receipt-code">{orderCode}</p>
        </header>

        <div className="thermal-receipt-divider" />

        <div className="thermal-receipt-meta">
          <div className="thermal-receipt-meta-row">
            <span>Hình thức</span>
            <strong>Bán tại quầy</strong>
          </div>
          <div className="thermal-receipt-meta-row">
            <span>Số món / số lượng</span>
            <strong>
              {lines.length} / {totalQuantity}
            </strong>
          </div>
        </div>

        <div className="thermal-receipt-divider" />

        <table className="thermal-receipt-table">
          <thead>
            <tr>
              <th className="col-qty">SL</th>
              <th className="col-price">Đơn giá</th>
              <th className="col-total">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item) => (
              <tr key={item.ma_mon}>
                <td colSpan={3} className="thermal-receipt-item-row">
                  <div className="thermal-receipt-item-name">
                    {item.ten_mon_luc_lap}
                  </div>
                  <div className="thermal-receipt-item-values">
                    <span className="col-qty">{item.so_luong}</span>
                    <span className="col-price">
                      {money(item.don_gia_luc_lap).replace(' đ', '')}
                    </span>
                    <span className="col-total">
                      {money(
                        Number(item.so_luong) * Number(item.don_gia_luc_lap),
                      ).replace(' đ', '')}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="thermal-receipt-divider" />

        <div className="thermal-receipt-total-row">
          <span>TỔNG TIỀN</span>
          <strong>{money(order.tong_tien)}</strong>
        </div>

        <div className="thermal-receipt-meta-row">
          <span>Phương thức</span>
          <span>{paymentMethod}</span>
        </div>

        {paymentMethod === 'Tiền mặt' && effectiveCashReceived !== undefined && (
          <>
            <div className="thermal-receipt-meta-row">
              <span>Số tiền nhận được</span>
              <span>{money(effectiveCashReceived)}</span>
            </div>
            {effectiveChange !== undefined && (
              <div className="thermal-receipt-meta-row">
                <span>Tiền thừa trả khách</span>
                <span>{money(effectiveChange)}</span>
              </div>
            )}
          </>
        )}

        <div className="thermal-receipt-divider" />

        <footer className="thermal-receipt-footer">
          <p className="thermal-receipt-paid-stamp">ĐÃ THANH TOÁN</p>
          <p className="thermal-receipt-thanks">Cảm ơn bạn đã ghé Mê!</p>
          <p className="thermal-receipt-subthanks">Hẹn gặp lại bạn.</p>
        </footer>
      </div>

      <p className="thermal-receipt-footnote">
        Bản xem trước · Chưa xuất · {copies} bản · Khổ {paperSize}
      </p>
    </div>
  );
}
