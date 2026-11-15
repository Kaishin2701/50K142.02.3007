import { useState } from 'react';
import { money } from '../../app/format';
import { Button, ErrorMessage, PageHeader, Panel, SelectField } from '../../components/ui';
import { useCheckout } from './CheckoutContext';

export function InvoicePreview({ onPrinted }: { onPrinted(copies: number): void }) {
  const checkout = useCheckout();
  const [copies, setCopies] = useState(1);
  const order = checkout.order!;
  const payment = checkout.payment;
  const rule = <div className="receipt-rule"><img src="/assets/figma/261-53624/cf266.png" width="332" height="1" alt="" /></div>;
  return <>
    <PageHeader title="Xuất hóa đơn" />
    <div className="sales-layout invoice-layout">
      <Panel title="Xem trước hóa đơn" className="invoice-preview-panel">
        <p className="muted">Đơn #{order.ma_don_hien_thi} · Giấy in nhiệt 80 mm</p>
        <div className="invoice-paper-area"><article className="invoice-paper" aria-label="Xem trước hóa đơn">
          <header><strong>MÊ</strong><h2>HÓA ĐƠN GIẤY</h2><p>#{order.ma_don_hien_thi}</p></header>
          {rule}
          <dl><dt>Hình thức</dt><dd>Bán tại quầy</dd><dt>Số món / số lượng</dt><dd>{order.items.length} / {order.items.reduce((n, item) => n + Number(item.so_luong), 0)}</dd></dl>
          {rule}
          <table className="invoice-lines"><thead><tr><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>
            {order.items.map(item => <tr key={item.ma_mon}><td colSpan={3}><p>{item.ten_mon_luc_lap}</p><div><span>{item.so_luong}</span><span>{money(item.don_gia_luc_lap)}</span><span>{money(Number(item.so_luong) * Number(item.don_gia_luc_lap))}</span></div></td></tr>)}
          </tbody></table>
          {rule}
          <div className="invoice-total"><strong>TỔNG TIỀN</strong><strong>{money(order.tong_tien)}</strong></div>
          <dl><dt>Phương thức</dt><dd>{payment?.phuong_thuc}</dd>{payment?.phuong_thuc === 'Tiền mặt' && <><dt>Tiền khách đưa</dt><dd>{money(payment.so_tien_nhan)}</dd><dt>Tiền thừa trả khách</dt><dd>{money(Number(payment.so_tien_nhan) - Number(order.tong_tien))}</dd></>}</dl>
          {rule}
          <footer><strong>ĐÃ THANH TOÁN</strong><p>Cảm ơn bạn đã ghé Mê!</p><p>Hẹn gặp lại bạn.</p></footer>
        </article><p className="muted">Bản xem trước · Chưa xuất · {copies} bản · Khổ 80 mm</p></div>
        <p className="invoice-help"><img src="/assets/figma/261-53624/91501.svg" alt="" />Đơn đã thanh toán. Vui lòng xuất hóa đơn cho khách.</p>
      </Panel>
      <Panel title="Xuất hóa đơn" className="checkout-panel invoice-settings">
        <div className="invoice-confirmation"><img src="/assets/figma/261-53624/6a087.svg" alt="" /><div><strong>Thanh toán đã ghi nhận</strong><p>Đã ghi nhận thanh toán. Chưa chuyển phiếu pha chế. Hệ thống sẽ chuyển phiếu pha chế sau khi xuất hóa đơn thành công.</p></div></div>
        <dl className="checkout-order-metadata">
          <div><dt>Mã đơn</dt><dd>#{order.ma_don_hien_thi}</dd></div><div><dt>Trạng thái</dt><dd>{order.trang_thai_pha_che}</dd></div><div><dt>Thanh toán</dt><dd>{payment?.phuong_thuc}</dd></div><div><dt>Tổng tiền</dt><dd>{money(order.tong_tien)}</dd></div>
          {payment?.phuong_thuc === 'Tiền mặt' && <><div><dt>Số tiền nhận được</dt><dd>{money(payment.so_tien_nhan)}</dd></div><div><dt>Tiền thừa trả khách</dt><dd>{money(Number(payment.so_tien_nhan) - Number(order.tong_tien))}</dd></div></>}
        </dl>
        <h3>Thiết lập in</h3>
        <SelectField label="Máy in" leadingIcon="/assets/figma/261-53624/4c58b.svg" chevronSrc="/assets/figma/261-53624/8eef1.svg" value="counter" onChange={() => {}}><option value="counter">Máy in hóa đơn tại quầy</option></SelectField>
        <div className="invoice-print-grid"><SelectField label="Khổ giấy" chevronSrc="/assets/figma/261-53624/8eef1.svg" value="80mm" onChange={() => {}}><option value="80mm">80 mm</option></SelectField>
          <div className="ui-field"><span>Số bản</span><div className="quantity-stepper"><Button aria-label="Giảm số bản" disabled={copies === 1} onClick={() => setCopies(n => n - 1)}>−</Button><output aria-label="Số bản">{copies}</output><Button aria-label="Tăng số bản" disabled={copies === 10} onClick={() => setCopies(n => n + 1)}>+</Button></div></div>
        </div>
        <p className="muted">Bấm Xuất hóa đơn để xuất hóa đơn và chuyển phiếu pha chế.</p>
        <ErrorMessage message={checkout.task.error} />
        <Button className="invoice-export-action" variant="primary" disabled={checkout.task.pending} onClick={async () => { if (await checkout.print(copies)) onPrinted(copies); }}><img src="/assets/figma/261-53624/a0aad.svg" alt="" />Xuất hóa đơn</Button>
      </Panel>
    </div>
  </>;
}
