import { useState, type FormEvent } from 'react';
import { useResource } from '../../app/data';
import { addDays, money, shiftTime, weekStart } from '../../app/format';
import { useRouter } from '../../app/router';
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
} from '../../components/ui';
import { useCheckout } from './CheckoutContext';

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
  const { go } = useRouter();
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
  const items = menu.data.filter(
    (item) =>
      item.danh_muc === category &&
      item.ten_mon
        .toLocaleLowerCase('vi')
        .includes(search.trim().toLocaleLowerCase('vi')),
  );
  const submitCash = async (event: FormEvent) => {
    event.preventDefault();
    if (await checkout.payCash(Number(cash))) setCashOpen(false);
  };
  return (
    <>
      <PageHeader title="Lập đơn bán hàng" />
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
          title={!checkout.reviewing && !immutable ? 'Chọn món' : 'Đơn hàng'}
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
                  ? 'Đơn đã được kiểm tra. Món và số lượng chỉ đọc tại bước này.'
                  : 'Chọn món và số lượng khách gọi, sau đó bấm Kiểm tra đơn.'}
              </p>
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
                    render: (_item, index) => index + 1,
                  },
                  {
                    key: 'name',
                    label: 'Tên món',
                    render: (item) => item.ten_mon_luc_lap,
                  },
                  {
                    key: 'quantity',
                    label: 'Số lượng',
                    render: (item) =>
                      immutable ? (
                        item.so_luong
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
                          label: 'Thao tác',
                          render: (item: { ma_mon: string }) => (
                            <Button
                              variant="quiet"
                              disabled={checkout.task.pending}
                              onClick={() => checkout.remove(item.ma_mon)}
                            >
                              Xóa món
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {!immutable && (
                <Button onClick={() => checkout.setReviewing(false)}>
                  Thêm món
                </Button>
              )}
              <div className="order-total sale-check-footer">
                <span>Tổng tiền</span>
                <strong>{order ? money(total) : '—'}</strong>
                <Button
                  variant="primary"
                  disabled={
                    immutable ||
                    checkout.task.pending ||
                    checkout.restoring ||
                    !checkout.cart.length
                  }
                  onClick={() => void checkout.check(currentShift?.ma_ca)}
                >
                  Kiểm tra đơn
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
              Xác nhận, thanh toán hoặc hủy đơn đang lập.
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
                        <img src="/assets/figma/261-51236/337ff.svg" alt="" />
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
              {!!checkout.cart.length && (
                <Button
                  className="continue-sale-action"
                  variant="primary"
                  disabled={!checkout.cart.length}
                  onClick={() => checkout.setReviewing(true)}
                >
                  Tiếp tục lập hóa đơn
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
                Xác nhận đơn
              </Button>
            </>
          )}
          {order?.da_xac_nhan && !paid && !cashOpen && !qrOpen && (
            <>
              <h3>Phương thức thanh toán</h3>
              <div className="payment-methods">
                <Button
                  disabled={checkout.task.pending}
                  className="cash-method"
                  aria-label="Tiền mặt"
                  onClick={() => {
                    checkout.task.setError('');
                    setCash('');
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
                  disabled={checkout.task.pending}
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
          {cashOpen && (
            <Modal
              inline
              className="payment-inline"
              title="Thanh toán tiền mặt"
              onClose={() => setCashOpen(false)}
              busy={checkout.task.pending}
            >
              <form onSubmit={submitCash}>
                <div className="dialog-body">
                  <div className="order-total">
                    <span>Tổng tiền</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <Field
                    label="Số tiền nhận được"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99999999999999}
                    step={1}
                    disabled={checkout.task.pending}
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                    required
                  />
                  <div className="order-total">
                    <span>Tiền thừa trả khách</span>
                    <strong>{money(Math.max(0, Number(cash) - total))}</strong>
                  </div>
                  <ErrorMessage message={checkout.task.error} />
                </div>
                <footer className="dialog-actions">
                  <Button
                    onClick={() => setCashOpen(false)}
                    disabled={checkout.task.pending}
                  >
                    Hủy
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={checkout.task.pending}
                  >
                    Xác nhận số tiền
                  </Button>
                </footer>
              </form>
            </Modal>
          )}
          {qrOpen && (
            <Modal
              inline
              className="payment-inline"
              title="Thanh toán QR"
              onClose={() => setQrOpen(false)}
              busy={checkout.task.pending}
            >
              <div className="dialog-body qr-payment">
                <strong>{money(total)}</strong>
                {checkout.payment?.qrImageUrl && (
                  <img src={checkout.payment.qrImageUrl} alt="QR thanh toán" />
                )}
                <p>{checkout.payment?.ma_tham_chieu_qr}</p>
                <ErrorMessage message={checkout.task.error} />
              </div>
              <footer className="dialog-actions">
                <Button onClick={() => setQrOpen(false)}>Đóng</Button>
                <Button
                  variant="primary"
                  disabled={checkout.task.pending}
                  onClick={async () => {
                    if (await checkout.reconcile()) setQrOpen(false);
                  }}
                >
                  Đối soát thành công
                </Button>
              </footer>
            </Modal>
          )}
          {paid && !completed && (
            <>
              <Badge>Thanh toán thành công</Badge>
              <p>
                Đã ghi nhận thanh toán thành công cho đơn #
                {order.ma_don_hien_thi}
              </p>
              <p className="muted">{checkout.payment?.phuong_thuc}</p>
              <Button
                variant="primary"
                disabled={checkout.task.pending}
                onClick={() => void checkout.print()}
              >
                Xuất hóa đơn
              </Button>
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
              <Badge>Hoàn tất pha chế</Badge>
              <p>
                Đã ghi nhận hoàn tất pha chế cho đơn #{order.ma_don_hien_thi}
              </p>
              <Button variant="primary" onClick={checkout.clear}>
                Lập đơn mới
              </Button>
              <Button onClick={() => go('orders')}>Theo dõi đơn hàng</Button>
            </>
          )}
          {!paid && (
            <Button
              className="checkout-cancel"
              disabled={checkout.task.pending || checkout.restoring}
              onClick={() => {
                checkout.task.setError('');
                setCancelOpen(true);
              }}
            >
              <img src="/assets/figma/261-50660/a79ec.svg" alt="" />
              {immutable ? 'Hủy đơn' : 'Dừng đặt hàng'}
            </Button>
          )}
          <ErrorMessage message={checkout.task.error} />
        </Panel>
      </div>
      {cancelOpen && (
        <Confirm
          title={immutable ? 'Hủy đơn' : 'Dừng đặt hàng'}
          confirmLabel="Xác nhận"
          pending={checkout.task.pending}
          error={checkout.task.error}
          onClose={() => setCancelOpen(false)}
          onConfirm={async () => {
            if (await checkout.cancel()) setCancelOpen(false);
          }}
        >
          Bạn có chắc chắn muốn{' '}
          {immutable ? 'hủy đơn đang lập' : 'dừng đặt hàng'} không?
        </Confirm>
      )}
      <p className="breadcrumb">BÁN HÀNG / LẬP ĐƠN BÁN HÀNG</p>
    </>
  );
}
