import { useState, useEffect, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useResource } from '../../app/data';
import { addDays, money, shiftTime, weekStart } from '../../app/format';
import { useRouter } from '../../app/router';
import type {
  CalendarData,
  MenuItem,
  OrderLine,
  Payment,
  QrMode,
} from '../../services/models';
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorMessage,
  Field,
  Loading,
  PageHeader,
  Panel,
} from '../../components/ui';
import { useCheckout } from './CheckoutContext';
import { ThermalReceipt } from './ThermalReceipt';
import trashIcon from '../../assets/sales-icons/trash.png';
import cashIcon from '../../assets/sales-icons/cash.png';
import lockIcon from '../../assets/sales-icons/lock.png';
import printerIcon from '../../assets/sales-icons/printer.png';
import successIcon from '../../assets/sales-icons/success.png';

const categories = [
  'Cà phê',
  'Mê Soda',
  'Trà sữa',
  'Cam ép & Trà tắc',
  'Sữa tươi',
  'Matcha',
  'Cacao',
  'Khoai môn',
  'Sữa chua',
  'Topping',
];

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="7.3" />
      <path d="m16.2 16.2 4.3 4.3" />
    </svg>
  );
}

function TrashIcon() {
  return <img src={trashIcon} className="sales-icon-trash" alt="" aria-hidden="true" />;
}

function QrIcon() {
  return (
    <svg className="sales-icon-payment-qr" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="5" width="26" height="26" rx="5" />
      <rect x="65" y="5" width="26" height="26" rx="5" />
      <rect x="5" y="65" width="26" height="26" rx="5" />
      <circle cx="48" cy="8" r="1" fill="currentColor" />
      <path d="M48 25v18c0 8-5 13-13 13H24" />
      <circle cx="8" cy="48" r="1" fill="currentColor" />
      <circle cx="67" cy="48" r="1" fill="currentColor" />
      <circle cx="88" cy="48" r="1" fill="currentColor" />
      <circle cx="48" cy="67" r="1" fill="currentColor" />
      <path d="M48 84v5M88 67H76c-8 0-12 5-12 13v9" />
      <circle cx="88" cy="88" r="1" fill="currentColor" />
    </svg>
  );
}

function paymentMatchesQrMode(
  payment: Payment | undefined,
  mode: QrMode | undefined,
) {
  if (!payment || !mode) return false;
  if (mode === 'demo') return payment.qr_mo_phong === true;
  return mode === 'live' && payment.qr_mo_phong === false;
}

export default function SalesPage() {
  const checkout = useCheckout();
  const { go } = useRouter();
  const menu = useResource<MenuItem[]>('/menu', []);
  const from = weekStart();
  const calendar = useResource<CalendarData>(
    `/shifts?from=${from}&to=${addDays(from, 6)}`,
    { shifts: [], registrations: [] },
  );

  const [category, setCategory] = useState(categories[0]);
  const [search, setSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'cash' | 'qr' | null>(null);
  const [cash, setCash] = useState('');
  const [cashError, setCashError] = useState('');
  const [qrAttempt, setQrAttempt] = useState(1);
  const [qrStatus, setQrStatus] = useState<'awaiting' | 'unreconciled'>('awaiting');
  const [copies, setCopies] = useState(1);
  const [paperSize, setPaperSize] = useState('80 mm');
  const [printer, setPrinter] = useState('Máy in hóa đơn tại quầy');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [paymentToast, setPaymentToast] = useState<string | null>(null);
  const [invoicePreview, setInvoicePreview] = useState(false);

  const order = checkout.order;
  const currentShift = calendar.data.shifts.find(
    (shift) =>
      shiftTime(shift) <= Date.now() && shiftTime(shift, true) > Date.now(),
  );

  const total = order
    ? Number(order.tong_tien)
    : checkout.cart.reduce(
      (sum, item) =>
        sum + Number(item.so_luong) * Number(item.don_gia_hien_tai),
      0,
    );

  const totalQuantity = (order?.items ?? checkout.cart).reduce(
    (sum, item) => sum + Number(item.so_luong || 0),
    0,
  );

  const completed = order?.trang_thai_pha_che === 'Hoàn tất pha chế';
  const preparing = order?.trang_thai_pha_che === 'Bắt đầu pha chế';
  const immutable = checkout.held || Boolean(order);
  const paid = order?.da_thanh_toan;
  const pendingQrPayment =
    checkout.payment?.phuong_thuc === 'Chuyển khoản qua QR' &&
    checkout.payment.trang_thai === 'Chờ xác nhận'
      ? checkout.payment
      : undefined;
  const isLocalQrImage = (imageUrl: string | undefined) =>
    imageUrl?.startsWith('data:image/png;base64,') ?? false;
  const isLegacyVietQrImage = (imageUrl: string | undefined) => {
    if (!imageUrl) return false;
    try {
      const parsed = new URL(imageUrl);
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'img.vietqr.io' &&
        parsed.pathname.startsWith('/image/')
      );
    } catch {
      return false;
    }
  };
  const isDisplayableQrImage = (imageUrl: string | undefined) =>
    isLocalQrImage(imageUrl) || isLegacyVietQrImage(imageUrl);
  const hasRestorableQr = (payment: Payment | undefined) =>
    Boolean(
      isDisplayableQrImage(payment?.qrImageUrl) ||
      (payment?.qrContent &&
        !(payment.qr_mo_phong && payment.qrContent.startsWith('DEMO|'))),
    );
  const qrModeMismatch = Boolean(
    pendingQrPayment &&
    !checkout.qrModeLoading &&
    !checkout.qrModeError &&
    checkout.qrMode &&
    !paymentMatchesQrMode(pendingQrPayment, checkout.qrMode),
  );
  const qrModeMismatchMessage =
    checkout.qrMode === 'demo'
      ? pendingQrPayment?.qr_mo_phong === false
        ? 'Đơn này đang có mã VietQR từ lần thanh toán trước. Chế độ hiện tại là QR mô phỏng.'
        : 'Đơn này đang có mã QR từ lần thanh toán trước. Chế độ hiện tại là QR mô phỏng.'
      : checkout.qrMode === 'live'
        ? 'Đơn này đang có mã QR mô phỏng từ lần thanh toán trước. Chế độ hiện tại là VietQR thật.'
        : 'QR đang tắt trong cấu hình hiện tại. Mã QR cũ không được hiển thị.';
  const qrCreateLabel =
    checkout.qrMode === 'demo'
      ? 'Tạo QR mô phỏng cho đơn này'
      : 'Tạo QR VietQR cho đơn này';
  const isQrPending = Boolean(
    !paid &&
    selectedMethod !== 'cash' &&
    (qrStatus === 'unreconciled' ||
      (pendingQrPayment && selectedMethod !== 'qr')),
  );

  // When payment succeeds, show payment success toast
  useEffect(() => {
    if (paid && order) {
      setPaymentToast(
        `Đã ghi nhận thanh toán thành công cho đơn #${order.ma_don_hien_thi ?? order.ma_don}`,
      );
    } else {
      setPaymentToast(null);
    }
  }, [paid, order?.ma_don_hien_thi, order?.ma_don]);

  useEffect(() => {
    if (!paid) setInvoicePreview(false);
  }, [paid]);

  // Synchronize payment method state when order restores with payment
  useEffect(() => {
    if (checkout.payment?.phuong_thuc === 'Tiền mặt' && !paid) {
      setSelectedMethod('cash');
    } else if (
      checkout.payment?.phuong_thuc === 'Chuyển khoản qua QR' &&
      !paid &&
      checkout.payment?.trang_thai === 'Chờ xác nhận'
    ) {
      // Pending QR
    }
  }, [checkout.payment, paid]);

  // Menu items filtering by category and search term
  const items = menu.data.filter((item) => {
    const matchesCategory = search.trim() ? true : item.danh_muc === category;
    const matchesSearch = search.trim()
      ? item.ten_mon.toLowerCase().includes(search.trim().toLowerCase())
      : true;
    return matchesCategory && matchesSearch;
  });

  // Out of stock detection from task error
  const isOutOfStockError = Boolean(
    checkout.task.error &&
    (checkout.task.error.toLowerCase().includes('tồn') ||
      checkout.task.error.toLowerCase().includes('nguyên liệu') ||
      checkout.task.error.toLowerCase().includes('không thể phục vụ')),
  );

  const outOfStockLine = (itemName: string) => {
    if (!isOutOfStockError || !checkout.task.error) return false;
    return checkout.task.error.toLowerCase().includes(itemName.toLowerCase());
  };

  const handleCashSubmit = async (e: FormEvent) => {
    e.preventDefault();
    checkout.task.setError('');
    const received = Number(cash);
    await checkout.payCash(received);
  };

  const handleStartQr = async () => {
    checkout.task.setError('');
    const mode = checkout.qrMode;
    if (checkout.qrModeLoading || checkout.qrModeError || !mode) return;
    if (mode === 'disabled') return;
    if (
      pendingQrPayment &&
      !paymentMatchesQrMode(pendingQrPayment, mode)
    ) return;
    if (
      pendingQrPayment &&
      !hasRestorableQr(pendingQrPayment)
    ) return;
    const payment =
      hasRestorableQr(checkout.payment)
        ? checkout.payment
        : await checkout.createQr();
    if (hasRestorableQr(payment)) {
      if (!paymentMatchesQrMode(payment, mode)) {
        checkout.task.setError(
          'Chế độ QR đã thay đổi. Hãy tải lại trang bán hàng trước khi tiếp tục.',
        );
        setSelectedMethod(null);
        return;
      }
      setSelectedMethod('qr');
      setQrStatus('awaiting');
    } else {
      if (payment) checkout.task.setError('Cổng thanh toán không trả ảnh hoặc nội dung QR hợp lệ.');
      setSelectedMethod(null);
    }
  };

  const handleCreateQr = async () => {
    checkout.task.setError('');
    if (
      checkout.qrModeLoading ||
      checkout.qrModeError ||
      !checkout.qrMode ||
      checkout.qrMode === 'disabled'
    ) return;
    const payment = await checkout.createQr();
    if (hasRestorableQr(payment)) {
      if (!paymentMatchesQrMode(payment, checkout.qrMode)) {
        checkout.task.setError(
          'Chế độ QR đã thay đổi. Hãy tải lại trang bán hàng trước khi tiếp tục.',
        );
        return;
      }
      setSelectedMethod('qr');
      setQrStatus('awaiting');
    }
  };

  const handleSelectCash = () => {
    checkout.task.setError('');
    setCash('');
    setCashError('');
    setSelectedMethod('cash');
  };

  const handleReconcileSuccess = async () => {
    checkout.task.setError('');
    await checkout.reconcile();
  };

  const handleReconcileFailed = () => {
    setQrStatus('unreconciled');
  };

  const handleReselectPayment = () => {
    setSelectedMethod(null);
    setCash('');
    setCashError('');
    setQrStatus('awaiting');
    setQrAttempt((prev) => prev + 1);
  };

  const handleChooseAnotherMenuItem = () => checkout.setReviewing(false);

  // Determine which major view to render
  const showCancelled = Boolean(checkout.cancelledOrder);
  const showBrewing = Boolean(paid && (preparing || completed));
  const showInvoice = Boolean(paid && !preparing && !completed && invoicePreview);
  const showPaidSuccess = Boolean(paid && !preparing && !completed && !invoicePreview);

  return (
    <>
      <div className="sales-page-header">
        <PageHeader
        title={showInvoice ? 'Xuất hóa đơn' : 'Lập đơn bán hàng'}
        subtitle="BÁN HÀNG"
        actions={
          <div className="sales-header-toasts">
            {checkout.cancelToast ? (
              <div
                className={`sales-cancel-toast sales-cancel-toast-${checkout.cancelToast.type}`}
                role="status"
              >
                <span className="sales-cancel-toast-icon" aria-hidden="true">
                  {checkout.cancelToast.type === 'success' ? (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M6 10l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
                      <path
                        d="M10 6v5M10 14h.01"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="sales-cancel-toast-text">
                  {checkout.cancelToast.message}
                </span>
              </div>
            ) : null}

            {checkout.stopNotice ? (
              <div
                className="sales-cancel-toast sales-cancel-toast-success"
                role="status"
              >
                <span className="sales-cancel-toast-icon" aria-hidden="true">
                  <img src={successIcon} className="sales-icon-toast-check" alt="" />
                </span>
                <span className="sales-cancel-toast-text">
                  {checkout.stopNotice}
                </span>
              </div>
            ) : null}

            {paymentToast && !checkout.cancelToast ? (
              <div
                className="sales-cancel-toast sales-payment-toast"
                role="status"
              >
                <span className="sales-cancel-toast-icon" aria-hidden="true">
                  <img src={successIcon} className="sales-icon-toast-check" alt="" />
                </span>
                <span className="sales-cancel-toast-text">
                  {paymentToast}
                </span>
              </div>
            ) : null}

            {isOutOfStockError && checkout.task.error ? (
              <div className="sales-alert-banner" role="alert">
                <span className="sales-alert-icon" aria-hidden="true">!</span>
                <span>{checkout.task.error}</span>
              </div>
            ) : null}
          </div>
        }
        />
      </div>

      <Loading
        active={
          menu.loading ||
          calendar.loading ||
          checkout.restoring ||
          checkout.qrModeLoading
        }
      />
      <ErrorMessage
        message={menu.error || calendar.error || checkout.qrModeError}
      />
      {checkout.orderSyncError ? (
        <div
          className="sales-cancel-toast sales-cancel-toast-success"
          role="status"
        >
          <span className="sales-cancel-toast-text">
            Thanh toán QR đã được xác nhận. {checkout.orderSyncError}
          </span>
          <Button
            variant="quiet"
            disabled={checkout.orderSyncPending}
            onClick={checkout.retryOrderSync}
          >
            {checkout.orderSyncPending
              ? 'Đang đồng bộ...'
              : 'Thử đồng bộ lại đơn'}
          </Button>
        </div>
      ) : null}

      {/* Case 1: Cancelled Order View (GD1.4-2-1) */}
      {showCancelled ? (
        <div className="sales-layout">
          <Panel title="Đơn hàng" className="sales-main">
            <p className="muted">
              Đã hủy đơn hàng {checkout.cancelledOrder!.code}
            </p>
            <div className="sales-cancelled-empty">
              <div className="sales-cancelled-icon" aria-hidden="true">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a04322"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                </svg>
              </div>
              <strong className="sales-cancelled-title">
                Đã hủy đơn hàng {checkout.cancelledOrder!.code}
              </strong>
              <p className="sales-cancelled-desc">
                Phần tồn đã được giải phóng.
              </p>
            </div>
          </Panel>
          <Panel title="Xử lý đơn" className="checkout-panel">
            <p className="muted">
              Kết quả hủy đơn {checkout.cancelledOrder!.code}.
            </p>
            <div className="sales-summary-box">
              <div className="sales-summary-row">
                <span className="sales-summary-label">Mã đơn</span>
                <strong className="sales-summary-code">
                  {checkout.cancelledOrder!.code}
                </strong>
              </div>
            </div>
            <p className="sales-cancel-result-desc">
              Đơn hàng bị hủy, không còn trong hệ thống và không được lưu vào
              lịch sử đơn hàng. Phần tồn đã giữ cho đơn được giải phóng, tồn
              khả dụng được cập nhật. Hãy thông báo cho khách hàng đơn đã được
              hủy.
            </p>
            <Button
              variant="primary"
              className="sales-new-order-button"
              onClick={checkout.resetNewOrder}
            >
              Lập đơn mới
            </Button>
          </Panel>
        </div>
      ) : showPaidSuccess && order ? (
        <div className="sales-layout">
          <Panel title="Đơn hàng" className="sales-main sales-paid-order">
            <div className="sales-panel-header-info">
              <p className="muted">Đơn đã xác nhận, không thể chỉnh sửa</p>
              <span className="sales-status-badge badge-preparing">Bắt đầu pha chế</span>
            </div>
            <DataTable<OrderLine>
              rows={order.items ?? []}
              rowKey={(item) => item.ma_mon}
              empty="Chưa có món nào."
              columns={[
                { key: 'index', label: 'STT', render: (_item, index) => index + 1 },
                { key: 'name', label: 'Tên món', render: (item) => <div className="sales-table-readonly-box">{item.ten_mon_luc_lap}</div> },
                { key: 'quantity', label: 'Số lượng', render: (item) => <div className="sales-table-readonly-qty">{item.so_luong}</div> },
                { key: 'price', label: 'Đơn giá', render: (item) => money(item.don_gia_luc_lap) },
                { key: 'total', label: 'Thành tiền', render: (item) => money(Number(item.so_luong) * Number(item.don_gia_luc_lap)) },
              ]}
            />
            <div className="sales-table-bottom-bar">
              <div className="sales-table-total-group">
                <span className="sales-table-total-label">Tổng tiền</span>
                <strong className="sales-table-total-val">{money(total)}</strong>
              </div>
              <Button variant="primary" className="sales-check-btn" onClick={() => setInvoicePreview(true)}>
                Xuất hóa đơn
              </Button>
            </div>
          </Panel>
          <Panel title="Xử lý đơn" className="checkout-panel">
            <p className="muted">Thanh toán thành công</p>
            <div className="sales-summary-box">
              <div className="sales-summary-row"><span className="sales-summary-label">Mã đơn</span><strong className="sales-summary-code">#{order.ma_don_hien_thi ?? order.ma_don}</strong></div>
              <div className="sales-summary-row"><span className="sales-summary-label">Trạng thái</span><span className="sales-status-badge badge-preparing">Bắt đầu pha chế</span></div>
              <div className="sales-summary-row"><span className="sales-summary-label">Thanh toán</span><strong className="sales-status-badge badge-paid">{checkout.payment?.phuong_thuc === 'Chuyển khoản qua QR' ? 'QR' : checkout.payment?.phuong_thuc ?? order.phuong_thuc ?? 'Đã thanh toán'}</strong></div>
            </div>
            <div className="sales-paid-result-card">
              <img src={successIcon} className="sales-paid-result-icon" alt="" aria-hidden="true" />
              <strong>Thanh toán thành công</strong>
              <p>Vui lòng xuất hóa đơn cho khách trước khi chuyển phiếu pha chế.</p>
              <strong className="sales-paid-result-amount">{money(total)}</strong>
            </div>
          </Panel>
        </div>
      ) : showInvoice && order ? (
        /* Case 2: Invoice Preview & Export View (GD1.3-16-1 / GD1.3-16-2) */
        <div className="sales-layout">
          <Panel title="Xem trước hóa đơn" className="sales-main">
            <p className="muted">
              Đơn #{order.ma_don_hien_thi ?? order.ma_don} · Giấy in nhiệt {paperSize}
            </p>
            <ThermalReceipt
              order={order}
              payment={checkout.payment}
              cashReceived={cash ? Number(cash) : undefined}
              change={cash ? Math.max(0, Number(cash) - total) : undefined}
              paperSize={paperSize}
              copies={copies}
            />
            <div className="sales-invoice-footer-lock">
              <span className="sales-lock-badge">
                <img src={lockIcon} className="sales-icon-lock" alt="" aria-hidden="true" />
                Đơn đã thanh toán. Vui lòng xuất hóa đơn cho khách.
              </span>
            </div>
          </Panel>
          <Panel title="Xuất hóa đơn" className="checkout-panel">
            <div className="sales-paid-banner">
              <div className="sales-paid-banner-header">
                <span className="sales-paid-banner-icon" aria-hidden="true"><img src={successIcon} className="sales-icon-toast-check" alt="" /></span>
                <strong>Thanh toán đã ghi nhận</strong>
              </div>
              <p className="sales-paid-banner-text">
                Đã ghi nhận thanh toán. Chưa chuyển phiếu pha chế. Hệ thống sẽ
                chuyển phiếu pha chế sau khi xuất hóa đơn thành công.
              </p>
            </div>

            <div className="sales-summary-box">
              <div className="sales-summary-row">
                <span className="sales-summary-label">Mã đơn</span>
                <strong className="sales-summary-code">
                  #{order.ma_don_hien_thi ?? order.ma_don}
                </strong>
              </div>
              <div className="sales-summary-row">
                <span className="sales-summary-label">Trạng thái</span>
                <span className="sales-status-badge badge-preparing">
                  Bắt đầu pha chế
                </span>
              </div>
              <div className="sales-summary-row">
                <span className="sales-summary-label">Thanh toán</span>
                <strong>
                  {checkout.payment?.phuong_thuc === 'Chuyển khoản qua QR'
                    ? 'QR'
                    : checkout.payment?.phuong_thuc ?? 'Tiền mặt'}
                </strong>
              </div>
              <div className="sales-summary-row">
                <span className="sales-summary-label">Tổng tiền</span>
                <strong className="sales-summary-amount">{money(total)}</strong>
              </div>
              {checkout.payment?.phuong_thuc === 'Tiền mặt' && (
                <>
                  <div className="sales-summary-row">
                    <span className="sales-summary-label">Số tiền nhận được</span>
                    <span>{money(cash ? Number(cash) : checkout.payment.so_tien_nhan)}</span>
                  </div>
                  <div className="sales-summary-row">
                    <span className="sales-summary-label">Tiền thừa trả khách</span>
                    <strong className="text-success">
                      {money(cash ? Math.max(0, Number(cash) - total) : checkout.payment.tien_thua)}
                    </strong>
                  </div>
                </>
              )}
            </div>

            <div className="sales-print-setup">
              <h4 className="sales-section-title">Thiết lập in</h4>
              <label className="sales-setup-field">
                <span className="sales-setup-label">Máy in</span>
                <div className="sales-select-wrapper">
                  <span className="sales-select-icon" aria-hidden="true"><img src={printerIcon} className="sales-icon-printer" alt="" /></span>
                  <select
                    className="sales-setup-select"
                    value={printer}
                    onChange={(e) => setPrinter(e.target.value)}
                  >
                    <option value="Máy in hóa đơn tại quầy">
                      Máy in hóa đơn tại quầy
                    </option>
                  </select>
                </div>
              </label>

              <div className="sales-print-params">
                <label className="sales-setup-field">
                  <span className="sales-setup-label">Khổ giấy</span>
                  <select
                    className="sales-setup-select"
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                  >
                    <option value="80 mm">80 mm</option>
                    <option value="58 mm">58 mm</option>
                  </select>
                </label>

                <div className="sales-setup-field">
                  <span className="sales-setup-label">Số bản</span>
                  <div className="sales-stepper">
                    <button
                      type="button"
                      className="sales-stepper-btn"
                      disabled={copies <= 1}
                      onClick={() => setCopies((c) => Math.max(1, c - 1))}
                    >
                      −
                    </button>
                    <span className="sales-stepper-val">{copies}</span>
                    <button
                      type="button"
                      className="sales-stepper-btn"
                      onClick={() => setCopies((c) => c + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="muted sales-print-helper">
              Bấm Xuất hóa đơn để xuất hóa đơn và chuyển phiếu pha chế.
            </p>

            <Button
              variant="primary"
              className="sales-export-invoice-btn"
              disabled={checkout.task.pending}
              aria-label="Xuất hóa đơn"
              onClick={async () => {
                await checkout.print();
              }}
            >
              <img src={printerIcon} className="sales-icon-printer sales-icon-printer-button" alt="" aria-hidden="true" />
              {checkout.task.pending ? 'Đang xuất hóa đơn...' : 'Xuất hóa đơn'}
            </Button>
            <ErrorMessage message={checkout.task.error} />
          </Panel>
        </div>
      ) : showBrewing && order ? (
        /* Case 3: Brewing Views (GD1.3-19-1 & GD1.3-21-1) */
        <div className="sales-layout">
          <Panel
            title={`Đơn hàng #${order.ma_don_hien_thi ?? order.ma_don}`}
            className="sales-main"
          >
            <div className="sales-panel-header-info">
              <p className="muted">Đơn đã thanh toán, không thể chỉnh sửa</p>
              {!completed && (
                <span className="sales-status-badge badge-preparing">
                  Bắt đầu pha chế
                </span>
              )}
            </div>

            <DataTable<OrderLine>
              rows={order.items ?? []}
              rowKey={(item) => item.ma_mon}
              empty="Chưa có món nào."
              columns={[
                {
                  key: 'index',
                  label: 'STT',
                  render: (_item, index) => index + 1,
                },
                {
                  key: 'name',
                  label: 'Tên món',
                  render: (item) => (
                    <div className="sales-table-readonly-box">
                      {item.ten_mon_luc_lap}
                    </div>
                  ),
                },
                {
                  key: 'quantity',
                  label: 'Số lượng',
                  render: (item) => (
                    <div className="sales-table-readonly-qty">
                      {item.so_luong}
                    </div>
                  ),
                },
                {
                  key: 'price',
                  label: 'Đơn giá',
                  render: (item) => money(item.don_gia_luc_lap),
                },
                {
                  key: 'total',
                  label: 'Thành tiền',
                  render: (item) =>
                    money(Number(item.so_luong) * Number(item.don_gia_luc_lap)),
                },
              ]}
            />

            <div className="sales-brewing-meta">
              <span>{order.items?.length ?? 0} món / {totalQuantity} số lượng</span>
              <span>Bán tại quầy</span>
            </div>

            <div className="sales-invoice-exported-note">
              <div className="sales-invoice-note-icon" aria-hidden="true">▤</div>
              <div className="sales-invoice-exported-details">
                <strong>Đã xuất hóa đơn giấy</strong>
                <p className="muted">Giấy in nhiệt {paperSize} · {copies} bản</p>
              </div>
              <span className="sales-invoice-exported-status">Đã xuất</span>
            </div>

            <div className="sales-brewing-total-bar">
              <div>
                <span className="sales-brewing-total-label">Tổng tiền</span>
                <strong className="sales-brewing-total-val">{money(total)}</strong>
              </div>
              <span className="sales-status-badge badge-paid">Đã thanh toán</span>
            </div>
          </Panel>

          <Panel title="Xử lý đơn" className="checkout-panel">
            <p className="muted">
              {completed ? 'Đồ uống sẵn sàng giao' : 'Đã chuyển phiếu pha chế'}
            </p>

            <div className="sales-summary-box">
              <div className="sales-summary-row">
                <span className="sales-summary-label">Mã đơn</span>
                <strong className="sales-summary-code">
                  #{order.ma_don_hien_thi ?? order.ma_don}
                </strong>
              </div>
              <div className="sales-summary-row">
                <span className="sales-summary-label">Trạng thái đơn</span>
                <span
                  className={`sales-status-badge ${completed ? 'badge-completed' : 'badge-preparing'
                    }`}
                >
                  {completed ? 'Hoàn tất pha chế' : 'Bắt đầu pha chế'}
                </span>
              </div>
              <div className="sales-summary-row">
                <span className="sales-summary-label">Thanh toán</span>
                <strong className="text-success">Đã thanh toán</strong>
              </div>
            </div>

            <div className="sales-brewing-status-card">
              <img src={successIcon} className="sales-brewing-status-icon" alt="" aria-hidden="true" />
              <strong className="sales-brewing-status-title">
                {completed ? 'Hoàn tất pha chế' : 'Bắt đầu pha chế'}
              </strong>
              <p className="sales-brewing-status-desc">
                {completed
                  ? `Đã ghi nhận hoàn tất pha chế cho đơn #${order.ma_don_hien_thi ?? order.ma_don}`
                  : 'Hóa đơn đã xuất thành công. Phiếu pha chế đã được chuyển.'}
              </p>
            </div>

            <div className="sales-summary-row sales-total-row-simple">
              <span className="sales-summary-label">Tổng tiền</span>
              <strong className="sales-summary-amount">{money(total)}</strong>
            </div>

            <p className="sales-brewing-instruction">
              {completed
                ? 'Đã ghi nhận đồ uống sẵn sàng giao. Bạn có thể lập đơn mới.'
                : 'Khi đồ uống sẵn sàng giao, Nhân viên nhấn Hoàn tất pha chế để ghi nhận hoàn tất cho đơn hàng.'}
            </p>

            {completed ? (
              <Button
                variant="primary"
                className="sales-action-btn-full"
                onClick={checkout.clear}
              >
                Lập đơn mới
              </Button>
            ) : (
              <div className="sales-action-column">
                <Button
                  variant="primary"
                  className="sales-action-btn-full"
                  disabled={checkout.task.pending}
                  onClick={() => void checkout.complete()}
                >
                  Hoàn tất pha chế
                </Button>
                <Button
                  variant="quiet"
                  className="sales-action-btn-outline"
                  onClick={() => go('orders')}
                >
                  Theo dõi đơn hàng
                </Button>
              </div>
            )}
            <ErrorMessage message={checkout.task.error} />
          </Panel>
        </div>
      ) : (
        /* Case 4: Standard POS Stages (Stage A: Chọn món & Stage B: Đơn hàng) */
        <div className="sales-layout">
          <Panel
            title={!checkout.reviewing && !immutable ? 'Chọn món' : 'Đơn hàng'}
            className="sales-main"
          >
            {!checkout.reviewing && !immutable ? (
              /* Stage A: Chọn món */
              <>
                <p className="muted">
                  Chọn món trong thực đơn và nhập số lượng khách gọi.
                </p>

                <div className="sales-search-bar">
                  <span className="sales-search-icon"><SearchIcon /></span>
                  <input
                    type="text"
                    className="sales-search-input"
                    placeholder="Tìm theo tên món..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      className="sales-search-clear"
                      onClick={() => setSearch('')}
                      aria-label="Xóa tìm kiếm"
                    >
                      ×
                    </button>
                  )}
                </div>

                <nav className="category-tabs" aria-label="Nhóm món">
                  {categories.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`category-pill ${category === item && !search.trim() ? 'is-active' : ''}`}
                      onClick={() => {
                        setCategory(item);
                        setSearch('');
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </nav>

                <div className="menu-heading">
                  {search.trim() ? `Kết quả tìm kiếm: "${search.trim()}"` : category} · {items.length} món
                </div>

                <div className="menu-list">
                  {items.map((item) => (
                    <article className="menu-item" key={item.ma_mon}>
                      <div className="menu-item-info">
                        <strong>{item.ten_mon}</strong>
                        <small>{item.danh_muc}</small>
                      </div>
                      <button
                        type="button"
                        className="menu-item-add-btn"
                        aria-label={`Thêm ${item.ten_mon}`}
                        disabled={checkout.task.pending}
                        onClick={() => checkout.add(item)}
                      >
                        +
                      </button>
                    </article>
                  ))}
                  {!items.length && !menu.loading && (
                    <p className="ui-empty">Không có món trong danh mục này.</p>
                  )}
                </div>
              </>
            ) : (
              /* Stage B: Đơn hàng Table */
              <>
                <div className="sales-panel-header-info">
                  <p className="muted">
                    {order?.da_xac_nhan
                      ? 'Đơn đã xác nhận, không thể chỉnh sửa'
                      : immutable
                        ? 'Đã kiểm tra · Đã giữ tồn. Món và số lượng chỉ đọc tại bước này.'
                        : 'Chọn món và số lượng khách gọi, sau đó bấm Kiểm tra đơn.'}
                  </p>
                  {order?.da_xac_nhan && (
                    <span className="sales-lock-badge">
                      <img src={lockIcon} className="sales-icon-lock" alt="" aria-hidden="true" />
                      {isQrPending ? 'Chỉ xem' : 'Đơn đã xác nhận, không thể chỉnh sửa'}
                    </span>
                  )}
                </div>

                <DataTable<OrderLine>
                  rows={
                    order?.items ??
                    checkout.cart.map((item) => ({
                      ma_mon: item.ma_mon,
                      ten_mon_luc_lap: item.ten_mon,
                      so_luong: item.so_luong,
                      don_gia_luc_lap: item.don_gia_hien_tai,
                    }))
                  }
                  rowKey={(item) => item.ma_mon}
                  empty="Chưa có món nào trong giỏ."
                  columns={[
                    {
                      key: 'index',
                      label: 'STT',
                      render: (item, index) => {
                        const isOutOfStock = outOfStockLine(item.ten_mon_luc_lap);
                        return (
                          <span className={isOutOfStock ? 'sales-cell-out-of-stock-label' : ''}>
                            {index + 1}
                            {isOutOfStock && ' ⚠️'}
                          </span>
                        );
                      },
                    },
                    {
                      key: 'name',
                      label: 'Tên món',
                      render: (item) => {
                        const isOutOfStock = outOfStockLine(item.ten_mon_luc_lap);
                        return immutable ? (
                          <div
                            className={`sales-table-readonly-box ${isOutOfStock ? 'sales-input-out-of-stock' : ''
                              }`}
                          >
                            {item.ten_mon_luc_lap}
                          </div>
                        ) : (
                          <div className="sales-name-cell-wrap">
                            <select
                              className={`sales-table-select ${isOutOfStock ? 'sales-input-out-of-stock' : ''
                                }`}
                              value={item.ma_mon}
                              disabled={checkout.task.pending}
                              onChange={(e) => {
                                const found = menu.data.find(
                                  (m) => m.ma_mon === e.target.value,
                                );
                                if (found) checkout.replaceItem(item.ma_mon, found);
                              }}
                            >
                              {menu.data.map((m) => (
                                <option key={m.ma_mon} value={m.ma_mon}>
                                  {m.ten_mon}
                                </option>
                              ))}
                            </select>
                            {isOutOfStock && (
                              <span className="sales-stock-alert-tag">Tạm hết tồn</span>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      key: 'quantity',
                      label: 'Số lượng',
                      render: (item) =>
                        immutable ? (
                          <div className="sales-table-readonly-qty">
                            {item.so_luong}
                          </div>
                        ) : (
                          <Field
                            label={`Số lượng ${item.ten_mon_luc_lap}`}
                            aria-label={`Số lượng ${item.ten_mon_luc_lap}`}
                            type="number"
                            min={1}
                            max={1000}
                            step={1}
                            disabled={checkout.task.pending}
                            value={item.so_luong}
                            onChange={(event) =>
                              checkout.quantity(item.ma_mon, event.target.value)
                            }
                            required
                          />
                        ),
                    },
                    {
                      key: 'price',
                      label: 'Đơn giá',
                      render: (item) => money(item.don_gia_luc_lap),
                    },
                    {
                      key: 'total',
                      label: 'Thành tiền',
                      render: (item) =>
                        money(
                          Number(item.so_luong) *
                            Number(item.don_gia_luc_lap),
                        ),
                    },
                    ...(!immutable
                      ? [
                        {
                          key: 'remove',
                          label: '',
                          render: (item: {
                            ma_mon: string;
                            ten_mon_luc_lap: string;
                          }) => (
                            <button
                              type="button"
                              className="sales-trash-btn"
                              aria-label={`Xóa ${item.ten_mon_luc_lap}`}
                              disabled={checkout.task.pending}
                              onClick={() => checkout.remove(item.ma_mon)}
                            >
                              <TrashIcon />
                            </button>
                          ),
                        },
                      ]
                      : []),
                  ]}
                />

                {!immutable && (
                  <button
                    type="button"
                    className="sales-add-row-btn"
                    onClick={handleChooseAnotherMenuItem}
                  >
                    <span className="sales-add-row-plus" aria-hidden="true">+</span>
                    <span>Thêm món</span>
                  </button>
                )}

                <div className="sales-table-bottom-bar">
                  <div className="sales-table-total-group">
                    <span className="sales-table-total-label">Tổng tiền</span>
                    <strong className="sales-table-total-val">
                      {money(total)}
                    </strong>
                  </div>

                  {!order?.da_xac_nhan && (
                    <Button
                      variant="primary"
                      className="sales-check-btn"
                      aria-label="Kiểm tra đơn"
                      disabled={
                        immutable ||
                        checkout.task.pending ||
                        checkout.restoring ||
                        !checkout.cart.length
                      }
                      onClick={() => void checkout.check(currentShift?.ma_ca)}
                    >
                      <span aria-hidden="true">✓ </span>Kiểm tra đơn
                    </Button>
                  )}
                </div>
              </>
            )}
          </Panel>

          <Panel
            title={
              !checkout.reviewing && !immutable ? 'Món đang chọn' : 'Xử lý đơn'
            }
            className="checkout-panel"
          >
            {!checkout.reviewing && !immutable ? (
              /* Right Panel for Stage A: Món đang chọn */
              <>
                <div className="sales-cart-badge-header">
                  <span className="sales-status-badge badge-unverified">
                    Chưa kiểm tra
                  </span>
                </div>

                <div className="sales-cart-summary-bar">
                  <span>
                    {checkout.cart.length} món · Tổng số lượng: {totalQuantity}
                  </span>
                  <span className="muted">Chưa có mã đơn</span>
                </div>

                <div className="cart-list">
                  {checkout.cart.map((item) => (
                    <article className="cart-item" key={item.ma_mon}>
                      <div className="cart-item-header">
                        <strong className="cart-item-name">{item.ten_mon}</strong>
                        <button
                          type="button"
                          className="sales-trash-btn"
                          aria-label={`Xóa ${item.ten_mon}`}
                          disabled={checkout.task.pending}
                          onClick={() => checkout.remove(item.ma_mon)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <small className="cart-item-category">{item.danh_muc}</small>

                      <div className="cart-item-controls">
                        <div className="cart-item-stepper">
                          <span className="cart-stepper-label">Số lượng</span>
                          <div className="sales-stepper">
                            <button
                              type="button"
                              className="sales-stepper-btn"
                              disabled={Number(item.so_luong) <= 1}
                              onClick={() =>
                                checkout.quantity(
                                  item.ma_mon,
                                  String(Math.max(1, Number(item.so_luong) - 1)),
                                )
                              }
                            >
                              −
                            </button>
                            <Field
                              label={`Số lượng ${item.ten_mon}`}
                              type="number"
                              min={1}
                              max={1000}
                              step={1}
                              disabled={checkout.task.pending}
                              required
                              value={item.so_luong}
                              onChange={(event) =>
                                checkout.quantity(item.ma_mon, event.target.value)
                              }
                            />
                            <button
                              type="button"
                              className="sales-stepper-btn"
                              onClick={() =>
                                checkout.quantity(
                                  item.ma_mon,
                                  String(Number(item.so_luong) + 1),
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <span className="cart-item-dash">—</span>
                      </div>
                    </article>
                  ))}
                  {!checkout.cart.length && (
                    <div className="cart-empty-notice">
                      <p>Chưa có món nào trong giỏ.</p>
                      <small className="muted">
                        Số lượng là số nguyên từ 1 trở lên. Dùng biểu tượng
                        thùng rác để bỏ món; đơn cần ít nhất một món.
                      </small>
                    </div>
                  )}
                </div>

                <div className="sales-cart-actions">
                  {checkout.cart.length > 0 && (
                    <>
                      <div className="sales-cart-total">
                        <span>Tổng tiền</span>
                        <strong>{money(total)}</strong>
                      </div>
                      <Button
                        variant="primary"
                        className="sales-review-order"
                        disabled={checkout.task.pending}
                        onClick={() => checkout.setReviewing(true)}
                      >
                        Tiếp tục lập đơn
                      </Button>
                    </>
                  )}
                  <button
                    type="button"
                    className="sales-action-btn-outline"
                    onClick={() => setCancelOpen(true)}
                  >
                    ✕ Dừng đặt hàng
                  </button>
                </div>
              </>
            ) : (
              /* Right Panel for Stage B: Xử lý đơn */
              <>
                <p className="muted">
                  Xác nhận, thanh toán hoặc hủy đơn đang lập.
                </p>

                <div className="sales-summary-box">
                  <div className="sales-summary-row">
                    <span className="sales-summary-label">Mã đơn</span>
                    <strong className="sales-summary-code">
                      {!order?.da_xac_nhan
                        ? 'Chưa có'
                        : order?.ma_don_hien_thi
                        ? `#${order.ma_don_hien_thi}`
                        : order?.ma_don
                          ? `#${order.ma_don}`
                          : 'Chưa có'}
                    </strong>
                  </div>
                  <div className="sales-summary-row">
                    <span className="sales-summary-label">Trạng thái</span>
                    {order?.da_xac_nhan ? (
                      <span className="sales-status-badge badge-preparing">
                        {order.trang_thai_pha_che}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  {selectedMethod === 'cash' && (
                    <div className="sales-summary-row">
                      <span className="sales-summary-label">Thanh toán</span>
                      <strong>Tiền mặt</strong>
                    </div>
                  )}
                  {selectedMethod === 'qr' && (
                    <>
                      <div className="sales-summary-row">
                        <span className="sales-summary-label">Thanh toán</span>
                        <span className="sales-status-badge badge-qr">QR</span>
                      </div>
                      {qrAttempt > 1 && (
                        <div className="sales-summary-row">
                          <span className="sales-summary-label">Mã QR mới</span>
                          <span>Lần thanh toán {qrAttempt}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Error Box when Check fails (e.g. Out of stock) */}
                {isOutOfStockError && checkout.task.error && (
                  <div className="sales-error-card">
                    <span className="sales-alert-icon" aria-hidden="true">!</span>
                    <span>{checkout.task.error}</span>
                  </div>
                )}

                {/* State 1: Before check */}
                {!immutable && !isOutOfStockError && (
                  <p className="sales-processing-help">
                    Nhập món và số lượng, sau đó bấm Kiểm tra đơn để hệ thống
                    tính tổng tiền.
                  </p>
                )}

                {/* State 2: Checked, waiting for order confirmation */}
                {immutable && !order?.da_xac_nhan && (
                  <>
                    <p className="sales-processing-help">
                      Báo tổng tiền {money(total)} cho khách và chờ khách đồng
                      ý, sau đó bấm Xác nhận đơn.
                    </p>
                    <Button
                      variant="primary"
                      className="sales-action-btn-full"
                      aria-label="Xác nhận đơn"
                      disabled={checkout.task.pending}
                      onClick={() => void checkout.confirm()}
                    >
                      <span aria-hidden="true">✓ </span>Xác nhận đơn
                    </Button>
                  </>
                )}

                {/* Button Xác nhận đơn disabled placeholder when unverified */}
                {!immutable && (
                  <div
                    aria-hidden="true"
                    className="ui-button ui-button-quiet sales-action-btn-disabled"
                  >
                    <span aria-hidden="true">✓ </span>Xác nhận đơn
                  </div>
                )}

                {/* State 3: Payment Section */}
                <div className="sales-payment-section">
                  <h4 className="sales-section-title">Phương thức thanh toán</h4>

                  {/* Payment selection view */}
                  {order?.da_xac_nhan && !selectedMethod && !isQrPending && (
                    <>
                      <p className="muted sales-payment-helper">
                        Đơn đã có mã và đang giữ tồn kho. Chọn phương thức thanh
                        toán của khách.
                      </p>
                      <div className="sales-payment-methods">
                        <button
                          type="button"
                          className="sales-payment-option"
                          aria-label="QR"
                          disabled={
                            checkout.task.pending ||
                            checkout.qrModeLoading ||
                            Boolean(checkout.qrModeError) ||
                            checkout.qrMode === 'disabled'
                          }
                          onClick={handleStartQr}
                        >
                          <span className="sales-payment-icon" aria-hidden="true">
                            <QrIcon />
                          </span>
                          <strong className="sales-payment-option-title">QR</strong>
                          <small className="sales-payment-option-subtitle">
                            {checkout.qrMode === 'disabled'
                              ? 'QR đang tắt'
                              : 'Chuyển khoản'}
                          </small>
                        </button>

                        <button
                          type="button"
                          className="sales-payment-option"
                          aria-label="Tiền mặt"
                          disabled={checkout.task.pending}
                          onClick={() => {
                            checkout.task.setError('');
                            setCash('');
                            setCashError('');
                            setSelectedMethod('cash');
                          }}
                        >
                          <span className="sales-payment-icon" aria-hidden="true">
                            <img src={cashIcon} className="sales-icon-payment-cash" alt="" />
                          </span>
                          <strong className="sales-payment-option-title">
                            Tiền mặt
                          </strong>
                          <small className="sales-payment-option-subtitle">
                            Nhận tại quầy
                          </small>
                        </button>
                      </div>
                      {checkout.qrMode === 'disabled' && (
                        <p className="muted" role="status">
                          QR đang tắt. Bạn vẫn có thể thanh toán tiền mặt.
                        </p>
                      )}
                    </>
                  )}

                  {/* Payment placeholder cards shown before confirmation */}
                  {!order?.da_xac_nhan && (
                    <div className="sales-payment-methods" aria-hidden="true">
                      <div className="sales-payment-option disabled">
                        <span className="sales-payment-icon">
                          <QrIcon />
                        </span>
                        <strong className="sales-payment-option-title">QR</strong>
                        <small className="sales-payment-option-subtitle">
                          Chuyển khoản
                        </small>
                      </div>
                      <div className="sales-payment-option disabled">
                        <span className="sales-payment-icon">
                          <img src={cashIcon} className="sales-icon-payment-cash" alt="" />
                        </span>
                        <strong className="sales-payment-option-title">Tiền mặt</strong>
                        <small className="sales-payment-option-subtitle">
                          Nhận tại quầy
                        </small>
                      </div>
                    </div>
                  )}

                  {/* Cash Payment View (In-place Dialog for testing & accessibility) */}
                  {selectedMethod === 'cash' && !paid && (
                    <div
                      role="dialog"
                      aria-label="Thanh toán tiền mặt"
                      className="sales-cash-container"
                    >
                      <form onSubmit={handleCashSubmit}>
                        <div className="sales-cash-form-body">
                          <div className="sales-cash-field-label">
                            <Field
                              label="Số tiền nhận được"
                              aria-label="Số tiền nhận được"
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={99999999999999}
                              step={1}
                              disabled={checkout.task.pending}
                              value={cash}
                              onChange={(e) => {
                                setCash(e.target.value);
                                if (Number(e.target.value) >= total) {
                                  setCashError('');
                                }
                              }}
                              className={
                                cash && Number(cash) < total
                                  ? 'sales-cash-input-error'
                                  : ''
                              }
                              required
                            />
                          </div>

                          {cash && Number(cash) < total && (
                            <p className="sales-cash-inline-error" role="alert">
                              <span aria-hidden="true">!</span>
                              Số tiền nhận được nhỏ hơn tổng tiền đơn hàng.
                            </p>
                          )}

                          <ErrorMessage
                            message={cashError || checkout.task.error}
                          />

                          {cash && Number(cash) < total && (
                            <p className="sales-cash-warning">
                              Hoàn trả toàn bộ số tiền đã nhận cho khách, sau đó chọn lại phương thức thanh toán.
                            </p>
                          )}

                          {cash && Number(cash) >= total && (
                            <div className="sales-change-box">
                              <span>Tiền thừa trả khách</span>
                              <strong className="sales-change-amount">
                                {money(Number(cash) - total)}
                              </strong>
                            </div>
                          )}
                        </div>

                        <div className="sales-cash-actions">
                          <Button
                            variant="primary"
                            type="submit"
                            className="sales-action-btn-full"
                            disabled={checkout.task.pending || !cash || Number(cash) < total}
                            aria-label="Xác nhận lại số tiền"
                          >
                            ✓ Xác nhận lại số tiền
                          </Button>
                          <Button
                            variant="quiet"
                            type="button"
                            className="sales-action-btn-outline"
                            onClick={handleReselectPayment}
                          >
                            Chọn lại phương thức
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* QR Payment View (Awaiting reconciliation) */}
                  {selectedMethod === 'qr' && qrStatus === 'awaiting' && !paid && (
                    <div
                      role="dialog"
                      aria-label="Thanh toán QR"
                      className="sales-qr-container"
                    >
                      <div className="sales-qr-card">
                        {isDisplayableQrImage(checkout.payment?.qrImageUrl) ? (
                          <img
                            src={checkout.payment?.qrImageUrl ?? ''}
                            alt={checkout.payment?.qr_mo_phong ? 'Mã QR mô phỏng' : 'QR thanh toán'}
                            className="sales-qr-image"
                          />
                        ) : checkout.payment?.qrContent &&
                          !(checkout.payment.qr_mo_phong &&
                            checkout.payment.qrContent.startsWith('DEMO|')) ? (
                          <QRCodeSVG
                            className="sales-qr-image"
                            value={checkout.payment.qrContent}
                            size={160}
                            level="L"
                            title={
                              checkout.payment.qr_mo_phong
                                ? 'Mã QR mô phỏng'
                                : 'Mã QR thanh toán'
                            }
                          />
                        ) : (
                          <div className="sales-qr-missing" role="alert">
                            Cổng thanh toán chưa trả ảnh hoặc nội dung QR.
                          </div>
                        )}
                        {checkout.payment?.qr_mo_phong && (
                          <p className="sales-qr-caption">
                            {isDisplayableQrImage(checkout.payment.qrImageUrl)
                              ? 'Khách quét mã để thanh toán'
                              : 'QR mô phỏng · không chuyển tiền'}
                          </p>
                        )}
                        {!checkout.payment?.qr_mo_phong && (
                          <p className="sales-qr-caption">
                            VietQR thật · chờ xác nhận từ SePay
                          </p>
                        )}
                        <strong className="sales-qr-amount">
                          {money(checkout.payment?.so_tien_thanh_toan ?? total)}
                        </strong>
                      </div>

                      <div className="sales-qr-actions">
                        <Button
                          variant="primary"
                          className="sales-action-btn-full"
                          disabled={checkout.task.pending}
                          onClick={handleReconcileSuccess}
                        >
                          ✓ Đối soát thành công
                        </Button>
                        <Button
                          variant="quiet"
                          className="sales-action-btn-outline"
                          aria-label="Đóng"
                          onClick={handleReconcileFailed}
                        >
                          ✕ Đối soát chưa thành công
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* QR Pending / Unreconciled / Failed View */}
                  {isQrPending && !paid && (
                    <div className="sales-qr-pending-wrapper">
                      {qrModeMismatch ? (
                        <div
                          className="sales-qr-pending-card"
                          role="status"
                        >
                          <p>{qrModeMismatchMessage}</p>
                          {checkout.qrMode === 'disabled' ? (
                            <p>
                              Hãy chọn tiền mặt nếu cần hoàn tất đơn trong lúc QR đang tắt.
                            </p>
                          ) : (
                            <Button
                              variant="primary"
                              className="sales-action-btn-full"
                              disabled={checkout.task.pending}
                              onClick={handleCreateQr}
                            >
                              {qrCreateLabel}
                            </Button>
                          )}
                        </div>
                      ) : checkout.qrModeLoading ? (
                        <p className="muted" role="status">
                          Đang kiểm tra chế độ QR…
                        </p>
                      ) : pendingQrPayment &&
                        paymentMatchesQrMode(
                          pendingQrPayment,
                          checkout.qrMode,
                        ) &&
                        !hasRestorableQr(pendingQrPayment) ? (
                        <div className="sales-qr-pending-card" role="status">
                          <p>
                            {checkout.qrMode === 'demo'
                              ? 'Không thể khôi phục ảnh VietQR của giao dịch mô phỏng cũ.'
                              : 'Không thể khôi phục ảnh VietQR cũ của giao dịch này.'}
                            Hãy tạo mã mới cho đơn này.
                          </p>
                          <Button
                            variant="primary"
                            className="sales-action-btn-full"
                            disabled={
                              checkout.task.pending ||
                              checkout.qrMode === 'disabled'
                            }
                            onClick={handleCreateQr}
                          >
                            {qrCreateLabel}
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="sales-payment-option sales-payment-option-selected"
                          aria-label="QR"
                          disabled={
                            checkout.task.pending ||
                            checkout.qrModeLoading ||
                            Boolean(checkout.qrModeError) ||
                            checkout.qrMode === 'disabled'
                          }
                          onClick={handleStartQr}
                        >
                          <span className="sales-payment-icon" aria-hidden="true">
                            <QrIcon />
                          </span>
                          <strong className="sales-payment-option-title">QR</strong>
                          <small className="sales-payment-option-subtitle">
                            Chuyển khoản
                          </small>
                        </button>
                      )}

                      <div className="sales-qr-pending-card">
                        <div className="sales-qr-pending-header">
                          <span className="sales-qr-clock-icon" aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <circle cx="10" cy="10" r="9" stroke="#c62828" strokeWidth="2" />
                              <path d="M10 5v5l3 2" stroke="#c62828" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </span>
                          <div>
                            <strong className="sales-qr-pending-title">
                              QR đang chờ hoặc chưa rõ kết quả
                            </strong>
                            <p className="sales-qr-pending-sub">
                              Chưa ghi nhận thanh toán thành công.
                            </p>
                          </div>
                        </div>
                        <div className="sales-qr-pending-amount">
                          {money(total)}
                        </div>
                      </div>

                      <div className="sales-qr-pending-notes">
                        <p>Chưa chuyển phiếu pha chế.</p>
                        <p>Đang giữ tồn.</p>
                      </div>

                      <Button
                        variant="quiet"
                        className="sales-action-btn-outline"
                        onClick={handleSelectCash}
                      >
                        Chọn tiền mặt
                      </Button>
                    </div>
                  )}
                </div>

                {/* Bottom Cancel / Stop Order Button */}
                {!paid && (
                  immutable ? (
                    <button
                      type="button"
                      className="sales-cancel-order-button"
                      aria-label="Hủy đơn"
                      disabled={checkout.task.pending || checkout.restoring}
                      onClick={() => {
                        checkout.task.setError('');
                        setCancelOpen(true);
                      }}
                    >
                      <span aria-hidden="true">✕ </span>Hủy đơn
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={
                        isOutOfStockError
                          ? 'sales-stop-btn-prominent'
                          : 'sales-action-btn-outline'
                      }
                      aria-label="Dừng đặt hàng"
                      disabled={checkout.task.pending || checkout.restoring}
                      onClick={() => void checkout.stopOrder()}
                    >
                      ✕ Dừng đặt hàng
                    </button>
                  )
                )}

                <ErrorMessage message={checkout.task.error} />
              </>
            )}
          </Panel>
        </div>
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancelOpen && (
        <Confirm
          title={immutable ? 'Hủy đơn' : 'Dừng đặt hàng'}
          confirmLabel="Xác nhận"
          pending={checkout.task.pending}
          error={checkout.task.error}
          onClose={() => setCancelOpen(false)}
          onConfirm={async () => {
            try {
              if (immutable) {
                await checkout.cancel();
              } else {
                await checkout.stopOrder();
              }
            } finally {
              setCancelOpen(false);
            }
          }}
        >
          Bạn có chắc chắn muốn{' '}
          {immutable ? 'hủy đơn đang lập' : 'dừng đặt hàng'} không?
        </Confirm>
      )}

    </>
  );
}
