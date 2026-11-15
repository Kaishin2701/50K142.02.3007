import { useEffect, useState, type FormEvent } from 'react';
import { useResource } from '../../app/data';
import { addDays, money, shiftTime, weekStart } from '../../app/format';
import type { CalendarData, MenuItem, OrderLine } from '../../services/models';
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
  SelectField,
} from '../../components/ui';
import { useCheckout } from './CheckoutContext';
import { InvoicePreview } from './InvoicePreview';

const categories = [
  'Cà phê',
  'Mê Soda',
  'Trà sữa',
  'Trà trái cây',
  'Cam ép & Trà tắc',
  'Sữa tươi',
  'Matcha',
  'Cacao',
  'Khoai môn',
  'Sữa chua',
  'Topping',
];

export default function SalesPage() {
  const checkout = useCheckout();
  const menu = useResource<MenuItem[]>('/menu', []);
  const from = weekStart();
  const calendar = useResource<CalendarData>(
    `/shifts?from=${from}&to=${addDays(from, 6)}`,
    { shifts: [], registrations: [] },
  );
  const [category, setCategory] = useState(categories[0]);
  const [search, setSearch] = useState('');
  const [cashOpen, setCashOpen] = useState(false);
  const [cash, setCash] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [cashAttempted, setCashAttempted] = useState(false);
  const [printedCopies, setPrintedCopies] = useState(1);
  const order = checkout.order;
  const total = order
    ? Number(order.tong_tien)
    : checkout.cart.reduce(
        (sum, item) =>
          sum + Number(item.so_luong) * Number(item.don_gia_hien_tai),
        0,
      );
  const currentShift = calendar.data.shifts.find(
    (shift) =>
      shiftTime(shift) <= Date.now() && shiftTime(shift, true) > Date.now(),
  );
  const completed = order?.trang_thai_pha_che === 'Hoàn tất pha chế';
  const immutable = checkout.held || Boolean(order);
  const paid = order?.da_thanh_toan;
  useEffect(() => {
    if (paid) { setQrOpen(false); setCashOpen(false); }
  }, [paid]);
  useEffect(() => { setCashOpen(false); setQrOpen(false); setCashAttempted(false); setInvoiceOpen(false); }, [order?.ma_don]);
  const items = menu.data.filter(
    (item) =>
      item.danh_muc === category &&
      item.ten_mon
        .toLocaleLowerCase('vi')
        .includes(search.trim().toLocaleLowerCase('vi')),
  );
  const submitCash = async (event: FormEvent) => {
    event.preventDefault();
    setCashAttempted(true);
    if (!cashValid) return;
    if (await checkout.payCash(Number(cash))) setCashOpen(false);
  };
  const cashValid = Boolean(cash.trim()) && Number.isSafeInteger(Number(cash)) && Number(cash) >= total && Number(cash) <= 99999999999999;
  const cashError = cashAttempted || cash.trim() ? !cash.trim() ? 'Vui lòng nhập số tiền nhận được' : !Number.isSafeInteger(Number(cash)) || Number(cash) < 0 || Number(cash) > 99999999999999 ? 'Số tiền phải là số nguyên không âm' : Number(cash) < total ? 'Số tiền nhận được nhỏ hơn tổng tiền đơn hàng' : '' : '';
  if (invoiceOpen && paid && !completed) return <InvoicePreview onPrinted={copies => { setPrintedCopies(copies); setInvoiceOpen(false); }} />;
  return (
    <>
      <PageHeader title="Lập đơn bán hàng" />
      {paid && !completed && <p className="sale-payment-notice" role="status"><span className="asset-overlay" aria-hidden="true"><img src="/assets/figma/261-53473/df0aa.svg" alt="" /><img src="/assets/figma/261-53473/471e8.svg" alt="" /></span>Đã ghi nhận thanh toán thành công cho đơn #{order.ma_don_hien_thi}</p>}
      <Loading
        active={menu.loading || calendar.loading || checkout.restoring}
      />
      <ErrorMessage message={menu.error || calendar.error} />
      <div
        className={
          'sales-layout' +
          (checkout.reviewing || immutable ? ' is-processing' : '')
        }
      >
        <Panel
          title={!checkout.reviewing && !immutable ? 'Chọn món' : completed ? `Đơn hàng #${order.ma_don_hien_thi}` : 'Đơn hàng'}
          className="sales-main"
        >
          {!checkout.reviewing && !immutable ? (
            <>
              <p className="muted">
                Chọn món trong thực đơn và nhập số lượng khách gọi.
              </p>
              <div className="menu-search">
                <img src="/assets/figma/261-50660/b46ed.svg" alt="" />
                <Field
                  label="Tìm theo tên món"
                  placeholder="Tìm theo tên món..."
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <nav className="category-tabs" aria-label="Nhóm món">
                {categories.map((item) => (
                  <Button
                    key={item}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </Button>
                ))}
              </nav>
              <div className="menu-heading">
                {category} · {items.length} món
              </div>
              <div className="menu-list">
                {items.map((item) => (
                  <article className="menu-item" key={item.ma_mon}>
                    <div>
                      <strong>{item.ten_mon}</strong>
                      <small>{item.danh_muc}</small>
                    </div>
                    <Button
                      aria-label={`Thêm ${item.ten_mon}`}
                      disabled={checkout.task.pending}
                      onClick={() => checkout.add(item)}
                    >
                      +
                    </Button>
                  </article>
                ))}
                {!items.length && !menu.loading && (
                  <p className="ui-empty">Không có món trong danh mục này.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                {immutable
                  ? order?.da_xac_nhan ? 'Đơn đã xác nhận, không thể chỉnh sửa' : 'Đã kiểm tra - Đã giữ tồn. Món và số lượng chỉ đọc tại bước này.'
                  : 'Chọn món và số lượng khách gọi, sau đó bấm Kiểm tra đơn.'}
              </p>
              {order?.da_xac_nhan && (completed ? <Badge>Hoàn tất pha chế</Badge> : (
                <span className={'ui-badge sale-locked-badge' + (qrOpen ? ' is-qr' : '')}>
                  <span className="sale-lock-icon" aria-hidden="true">
                    <img className="sale-lock-body" src="/assets/figma/261-51396/0c41a.svg" alt="" />
                    <img className="sale-lock-shackle" src="/assets/figma/261-51396/e4883.svg" alt="" />
                  </span>
                  Đơn đã xác nhận, không thể chỉnh sửa
                </span>
              ))}
              <DataTable<OrderLine>
                className="sale-table"
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
                    render: (_item, index) => index + 1,
                  },
                  {
                    key: 'name',
                    label: 'Tên món',
                    render: (item, index) => (
                      <div className="sale-item-name">
                        <SelectField
                          label={`Tên món dòng ${index + 1}`}
                          aria-label={`Tên món dòng ${index + 1}`}
                          value={item.ma_mon}
                          disabled={immutable || checkout.task.pending}
                          onChange={event => {
                            const selected = menu.data.find(option => option.ma_mon === event.target.value);
                            if (selected) checkout.replaceItem(item.ma_mon, selected);
                          }}
                        >
                          {immutable ? <option value={item.ma_mon}>{item.ten_mon_luc_lap}</option> : <>
                            {!menu.data.some(option => option.ma_mon === item.ma_mon) && <option value={item.ma_mon}>{item.ten_mon_luc_lap}</option>}
                            {menu.data.map(option => <option key={option.ma_mon} value={option.ma_mon}>{option.ten_mon}</option>)}
                          </>}
                        </SelectField>
                        {!immutable && <img className="sale-item-chevron" src="/assets/figma/261-51059/1ba19.svg" alt="" />}
                      </div>
                    ),
                  },
                  {
                    key: 'quantity',
                    label: 'Số lượng',
                    render: (item) => (
                        <Field
                          label={`Số lượng ${item.ten_mon_luc_lap}`}
                          aria-label={`Số lượng ${item.ten_mon_luc_lap}`}
                          type={immutable ? 'text' : 'number'}
                          readOnly={immutable}
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
                    render: (item) => order ? money(item.don_gia_luc_lap) : '—',
                  },
                  {
                    key: 'total',
                    label: 'Thành tiền',
                    render: (item) =>
                      order
                        ? money(
                            Number(item.so_luong) *
                              Number(item.don_gia_luc_lap),
                          )
                        : '—',
                  },
                  ...(!immutable
                    ? [
                        {
                          key: 'remove',
                          label: '',
                          render: (item: { ma_mon: string }) => (
                            <Button
                              variant="quiet"
                              aria-label={`Xóa món ${item.ma_mon}`}
                              disabled={checkout.task.pending}
                              onClick={() => checkout.remove(item.ma_mon)}
                            >
                              <img src="/assets/figma/261-50834/3fee3.svg" alt="" />
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {completed && <p className="completed-order-count">{order.items.length} món / {order.items.reduce((sum, item) => sum + Number(item.so_luong), 0)} số lượng <span>Bán tại quầy</span></p>}
              {paid && order.trang_thai_pha_che !== 'Chưa pha chế' && <div className="printed-invoice-state"><img src="/assets/figma/261-52174/6e55f.svg" alt="" /><div><strong>Đã xuất hóa đơn giấy</strong><p>Giấy in nhiệt 80 mm · {printedCopies} bản</p></div><span>Đã xuất</span></div>}
              {!immutable && (
                <Button onClick={() => checkout.setReviewing(false)}>
                  + Thêm món
                </Button>
              )}
              <div className="order-total sale-check-footer">
                <span>Tổng tiền</span>
                <strong>{order ? money(total) : '—'}</strong>
                <Button
                  variant="primary"
                  disabled={
                    (!paid && immutable) || completed ||
                    checkout.task.pending ||
                    checkout.restoring ||
                    (!paid && !checkout.cart.length)
                  }
                  onClick={() => paid ? setInvoiceOpen(true) : void checkout.check(currentShift?.ma_ca)}
                >
                  {paid ? completed ? 'Đã thanh toán' : 'Xuất hóa đơn' : <><img src="/assets/figma/261-51236/337ff.svg" alt="" />Kiểm tra đơn</>}
                </Button>
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
          {!checkout.reviewing && !immutable && <Badge>Chưa kiểm tra</Badge>}
          {(checkout.reviewing || immutable) && (
            <p className="checkout-help">
              {completed ? 'Đồ uống sẵn sàng giao' : paid ? 'Thanh toán thành công' : 'Xác nhận, thanh toán hoặc hủy đơn đang lập.'}
            </p>
          )}
          {(checkout.reviewing || immutable) && (
            <dl className="checkout-order-metadata">
              <div>
                <dt>Mã đơn</dt>
                <dd>
                  {order?.ma_don_hien_thi
                    ? '#' + order.ma_don_hien_thi
                    : 'Chưa có'}
                </dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>
                  {order ? <Badge>{order.trang_thai_pha_che}</Badge> : '—'}
                </dd>
              </div>
              {(cashOpen || qrOpen || paid) && (
                <div>
                  <dt>Thanh toán</dt>
                  <dd>
                    {cashOpen
                      ? 'Tiền mặt'
                      : qrOpen
                        ? 'QR'
                        : checkout.payment?.phuong_thuc}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {!checkout.reviewing && !immutable && (
            <p className="checkout-order-code">
              {order?.ma_don_hien_thi
                ? '#' + order.ma_don_hien_thi
                : 'Chưa có mã đơn'}
            </p>
          )}
          {!checkout.reviewing && !immutable && (
            <>
              <p className="checkout-count">
                {checkout.cart.length} món · Tổng số lượng:{' '}
                {checkout.cart.reduce(
                  (sum, item) => sum + Number(item.so_luong),
                  0,
                )}
              </p>
              <div className="cart-list">
                {checkout.cart.map((item) => (
                  <article className="cart-item" key={item.ma_mon}>
                    <div>
                      <div>
                        <strong>{item.ten_mon}</strong>
                        <small>{item.danh_muc}</small>
                      </div>
                      <Button
                        variant="quiet"
                        aria-label={`Xóa ${item.ten_mon}`}
                        disabled={checkout.task.pending}
                        onClick={() => checkout.remove(item.ma_mon)}
                      >
                        <img src="/assets/figma/261-50834/3fee3.svg" alt="" />
                      </Button>
                    </div>
                    <div className="cart-quantity">
                      <span aria-hidden="true">Số lượng</span>
                      <div className="quantity-stepper">
                        <Button
                          variant="quiet"
                          aria-label={'Giảm số lượng ' + item.ten_mon}
                          disabled={
                            checkout.task.pending || Number(item.so_luong) <= 1
                          }
                          onClick={() =>
                            checkout.quantity(
                              item.ma_mon,
                              String(Number(item.so_luong) - 1),
                            )
                          }
                        >
                          −
                        </Button>
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
                        <Button
                          variant="quiet"
                          aria-label={'Tăng số lượng ' + item.ten_mon}
                          disabled={
                            checkout.task.pending ||
                            Number(item.so_luong) >= 1000
                          }
                          onClick={() =>
                            checkout.quantity(
                              item.ma_mon,
                              String(Number(item.so_luong) + 1),
                            )
                          }
                        >
                          +
                        </Button>
                      </div>
                      <span className="cart-price">—</span>
                    </div>
                  </article>
                ))}
                {!checkout.cart.length && (
                  <p className="ui-empty">Chưa có món nào trong giỏ.</p>
                )}
              </div>
              {!checkout.cart.length && (
                <p className="cart-help">
                  Số lượng là số nguyên từ 1 trở lên. Dùng biểu tượng thùng rác
                  để bỏ món; đơn cần ít nhất một món.
                </p>
              )}
              {!checkout.cart.length && <div className="empty-cart-total"><span>Tổng tiền</span><strong>—</strong><p>Chưa kiểm tra tồn, chưa giữ tồn và chưa chốt thành tiền.</p><Button variant="primary" disabled>Tiếp tục lập hóa đơn</Button></div>}
              {!!checkout.cart.length && (
                <Button
                  className="continue-sale-action"
                  variant="primary"
                  disabled={!checkout.cart.length}
                  onClick={() => checkout.setReviewing(true)}
                >
                  Tiếp tục lập hóa đơn <img src="/assets/figma/261-50834/91bfc.svg" alt="" />
                </Button>
              )}
            </>
          )}
          {checkout.reviewing && !immutable && (
            <>
              <p>
                Nhập món và số lượng, sau đó bấm Kiểm tra đơn để hệ thống tính
                tổng tiền.
              </p>
              <Button variant="primary" disabled><img src="/assets/figma/261-51236/c3ec6.svg" alt="" />Xác nhận đơn</Button>
            </>
          )}
          {immutable && !order && (
            <Button
              onClick={() => void checkout.check(currentShift?.ma_ca)}
              disabled={checkout.task.pending}
            >
              Tải lại đơn
            </Button>
          )}
          {order && !order.da_xac_nhan && (
            <>
              <p>
                Báo tổng tiền {money(total)} cho khách và chờ khách đồng ý, sau
                đó bấm Xác nhận đơn.
              </p>
              <Button
                variant="primary"
                disabled={checkout.task.pending}
                onClick={() => void checkout.confirm()}
              >
                <img src="/assets/figma/261-51236/c3ec6.svg" alt="" />Xác nhận đơn
              </Button>
            </>
          )}
          {(checkout.reviewing || immutable) && !paid && !cashOpen && !qrOpen && (
            <>
              {order?.da_xac_nhan && <p>Đơn đã có mã và đang giữ tồn kho. Chọn phương thức thanh toán của khách.</p>}
              <h3>Phương thức thanh toán</h3>
              <div className="payment-methods">
                <Button
                  disabled={checkout.task.pending || !order?.da_xac_nhan}
                  className="cash-method"
                  aria-label="Tiền mặt"
                  onClick={() => {
                    checkout.task.setError('');
                    setCash('');
                    setCashAttempted(false);
                    setCashOpen(true);
                  }}
                >
                  <span className="payment-cash-icon" aria-hidden="true">
                    <img src="/assets/figma/261-51236/9083f.svg" alt="" />
                    <img src="/assets/figma/261-51236/9ef59.svg" alt="" />
                    <img src="/assets/figma/261-51236/ad828.svg" alt="" />
                  </span>
                  <strong>Tiền mặt</strong>
                  <small>Nhận tại quầy</small>
                </Button>
                <Button
                  className="qr-method"
                  aria-label="QR"
                  disabled={checkout.task.pending || !order?.da_xac_nhan}
                  onClick={async () => {
                    if (
                      checkout.payment?.qrImageUrl ||
                      (await checkout.createQr())
                    )
                      setQrOpen(true);
                  }}
                >
                  <span className="payment-qr-icon" aria-hidden="true">
                    <img src="/assets/figma/261-51236/16916.svg" alt="" />
                    {[0, 1, 2].map((i) => (
                      <img
                        key={i}
                        src="/assets/figma/261-51236/41251.svg"
                        alt=""
                      />
                    ))}
                  </span>
                  <strong>QR</strong>
                  <small>Chuyển khoản</small>
                </Button>
              </div>
            </>
          )}
          {cashOpen && order?.da_xac_nhan && !paid && (
            <Modal
              inline
              className="payment-inline cash-payment"
              title="Thanh toán tiền mặt"
              onClose={() => setCashOpen(false)}
              busy={checkout.task.pending}
            >
              <form onSubmit={submitCash} noValidate>
                <div className="dialog-body">
                  <Field
                    label="Số tiền nhận được"
                    error={cashError ? <>
                      <span className="cash-warning-icon asset-overlay" aria-hidden="true"><img src="/assets/figma/261-53305/70c3f.svg" alt="" /><img src="/assets/figma/261-53305/bc055.svg" alt="" /></span>
                      <span>{cashError}</span>
                    </> : undefined}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99999999999999}
                    step={1}
                    disabled={checkout.task.pending}
                    value={cash}
                    onChange={(event) => { setCash(event.target.value); checkout.task.setError(''); }}
                    required
                  />
                  {cashValid && <div className="order-total cash-change">
                    <span>Tiền thừa trả khách</span>
                    <strong>{money(Math.max(0, Number(cash) - total))}</strong>
                  </div>}
                  {cashError && <p className="muted">Hoàn trả số tiền đã nhận cho khách, sau đó chọn lại phương thức thanh toán.</p>}
                  <ErrorMessage message={checkout.task.error} />
                </div>
                <footer className="dialog-actions">
                  <Button
                    variant="primary"
                    className="cash-confirm-action"
                    type="submit"
                    disabled={checkout.task.pending || !cashValid}
                  >
                    <img src={cashValid ? '/assets/figma/261-53147/c3ec6.svg' : '/assets/figma/261-53305/f6dcf.svg'} alt="" />Xác nhận số tiền
                  </Button>
                  <Button
                    className="cash-choose-method"
                    onClick={() => { setCashOpen(false); setCash(''); setCashAttempted(false); checkout.task.setError(''); }}
                    disabled={checkout.task.pending}
                  >
                    Chọn lại phương thức
                  </Button>
                </footer>
              </form>
            </Modal>
          )}
          {qrOpen && order?.da_xac_nhan && !paid && (
            <Modal
              inline
              className="payment-inline"
              title="Thanh toán QR"
              onClose={() => setQrOpen(false)}
              busy={checkout.task.pending}
            >
              <div className="dialog-body qr-payment">
                {checkout.payment?.qrImageUrl && (
                  <img src={checkout.payment.qrImageUrl} alt="QR thanh toán" />
                )}
                <p>Khách quét mã để thanh toán</p>
                <strong>{money(total)}</strong>
                <ErrorMessage message={checkout.task.error} />
              </div>
              <footer className="dialog-actions">
                <Button
                  variant="primary"
                  disabled={checkout.task.pending}
                  onClick={async () => {
                    if (await checkout.reconcile()) setQrOpen(false);
                  }}
                >
                  <img src="/assets/figma/261-51236/c3ec6.svg" alt="" />Đối soát thành công
                </Button>
                <Button onClick={() => { setQrOpen(false); checkout.task.setError('Đối soát chưa thành công. Vui lòng chọn lại phương thức thanh toán.'); }}>× Đối soát chưa thành công</Button>
              </footer>
            </Modal>
          )}
          {paid && !completed && (
            <>
              <div className="payment-success-panel"><span className="asset-overlay" aria-hidden="true"><img src="/assets/figma/261-53473/eac73.svg" alt="" /><img src="/assets/figma/261-53473/be167.svg" alt="" /></span><strong>Thanh toán thành công</strong><p>Vui lòng xuất hóa đơn cho khách trước khi chuyển phiếu pha chế.</p><strong>{money(total)}</strong></div>
              {order.trang_thai_pha_che === 'Bắt đầu pha chế' && (
                <Button
                  variant="primary"
                  disabled={checkout.task.pending}
                  onClick={() => void checkout.complete()}
                >
                  Hoàn tất pha chế
                </Button>
              )}
            </>
          )}
          {completed && (
            <>
              <div className="payment-success-panel preparation-success-panel"><img src="/assets/figma/261-52174/61733.svg" alt="" /><strong>Hoàn tất pha chế</strong><p>Đã ghi nhận hoàn tất pha chế cho đơn #{order.ma_don_hien_thi}</p></div>
              <div className="checkout-order-metadata"><span>Tổng tiền</span><strong>{money(total)}</strong></div>
              <p>Đã ghi nhận đồ uống sẵn sàng giao. Bạn có thể tiếp tục theo dõi đơn hàng hoặc lập đơn mới.</p>
              <Button variant="primary" onClick={checkout.clear}>
                Lập đơn mới
              </Button>
            </>
          )}
          {!paid && (
            <Button
              className={'checkout-cancel' + (order?.da_xac_nhan ? ' is-confirmed' : '')}
              disabled={checkout.task.pending || checkout.restoring}
              onClick={() => {
                checkout.task.setError('');
                setCancelOpen(true);
              }}
            >
              <img src="/assets/figma/261-50660/a79ec.svg" alt="" />
              {order?.da_xac_nhan ? 'Hủy đơn' : 'Dừng đặt hàng'}
            </Button>
          )}
          <ErrorMessage message={checkout.task.error} />
        </Panel>
      </div>
      {cancelOpen && (
        <Confirm
          title={order?.da_xac_nhan ? 'Hủy đơn' : 'Dừng đặt hàng'}
          confirmLabel="Xác nhận"
          pending={checkout.task.pending}
          error={checkout.task.error}
          onClose={() => setCancelOpen(false)}
          onConfirm={async () => {
            if (await checkout.cancel()) setCancelOpen(false);
          }}
        >
          Bạn có chắc chắn muốn{' '}
          {order?.da_xac_nhan ? 'hủy đơn đang lập' : 'dừng đặt hàng'} không?
        </Confirm>
      )}
      <p className="breadcrumb">BÁN HÀNG / LẬP ĐƠN BÁN HÀNG</p>
    </>
  );
}
