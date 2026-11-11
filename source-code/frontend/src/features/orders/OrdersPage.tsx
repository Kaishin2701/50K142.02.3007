import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import { dateTimeText, money } from '../../app/format';
import { api, download, query } from '../../services/api';
import type { Order } from '../../services/models';
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
  Pagination,
  SelectField,
  useNotice,
} from '../../components/ui';

const emptyFilters = { code: '', from: '', to: '', method: '', status: '' };
export default function OrdersPage() {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const [form, setForm] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const path =
    '/orders' +
    (manager ? '/history' : '') +
    '?' +
    query({ ...filters, page, limit: 20 });
  const orders = useResource<Order[]>(path, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ ...form });
    setPage(1);
    orders.refresh();
  };
  const field = (name: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [name]: value }));
  return (
    <>
      <PageHeader
        title={
          manager ? 'Tra cứu lịch sử đơn hàng' : 'Theo dõi trạng thái đơn hàng'
        }
      />
      <Panel className="order-filter-panel">
        <form className="filter-bar" onSubmit={submit}>
          <Field
            label="Mã đơn"
            placeholder="Nhập mã đơn"
            value={form.code}
            onChange={(event) => field('code', event.target.value)}
            maxLength={30}
          />
          {manager && (
            <Field
              label="Từ ngày"
              type="date"
              value={form.from}
              max={form.to || undefined}
              onChange={(event) => field('from', event.target.value)}
            />
          )}
          {manager && (
            <Field
              label="Đến ngày"
              type="date"
              value={form.to}
              min={form.from || undefined}
              onChange={(event) => field('to', event.target.value)}
            />
          )}
          {manager && (
            <SelectField
              label="Phương thức thanh toán"
              value={form.method}
              onChange={(event) => field('method', event.target.value)}
            >
              <option value="">Tất cả</option>
              <option>Tiền mặt</option>
              <option value="Chuyển khoản qua QR">Chuyển khoản</option>
            </SelectField>
          )}
          {!manager && (
            <SelectField
              label="Trạng thái"
              value={form.status}
              onChange={(event) => field('status', event.target.value)}
            >
              <option value="">Tất cả</option>
              <option>Chưa pha chế</option>
              <option>Bắt đầu pha chế</option>
            </SelectField>
          )}
          <Button type="submit" variant="primary">
            {manager ? 'Tra cứu' : 'Tìm kiếm'}
          </Button>
        </form>
        <p className="filter-help">
          {manager
            ? 'Tra cứu theo ngày lập đơn · Tính trọn ngày từ 00:00 đến 23:59 của các ngày đã chọn.'
            : 'Theo dõi các đơn đang xử lý. Việc xem chi tiết không làm thay đổi trạng thái đơn hàng.'}
        </p>
      </Panel>
      <Panel
        title={manager ? 'Lịch sử đơn hàng' : 'Đơn đang xử lý'}
        className="order-list-panel"
      >
        <Loading active={orders.loading} />
        <ErrorMessage message={orders.error} />
        <DataTable
          rows={orders.data}
          rowKey={(order) => order.ma_don}
          empty="Không có đơn hàng phù hợp."
          columns={[
            {
              key: 'index',
              label: 'STT',
              render: (_order, index) => (page - 1) * 20 + index + 1,
            },
            {
              key: 'code',
              label: 'Mã đơn',
              render: (order) => (
                <Button variant="quiet" onClick={() => setDetail(order.ma_don)}>
                  #{order.ma_don_hien_thi}
                </Button>
              ),
            },
            {
              key: 'time',
              label: 'Thời gian lập đơn',
              render: (order) => dateTimeText(order.thoi_gian_lap),
            },
            {
              key: 'total',
              label: 'Tổng tiền',
              render: (order) => money(order.tong_tien),
            },
            {
              key: 'method',
              label: 'Phương thức thanh toán',
              render: (order) => order.phuong_thuc ?? 'Chưa thanh toán',
            },
            {
              key: 'status',
              label: 'Trạng thái',
              render: (order) => <Badge>{order.trang_thai_pha_che}</Badge>,
            },
            {
              key: 'view',
              label: '',
              render: (order) => (
                <Button
                  variant="quiet"
                  aria-label={'Chi tiết đơn #' + order.ma_don_hien_thi}
                  onClick={() => setDetail(order.ma_don)}
                >
                  ›
                </Button>
              ),
            },
          ]}
        />
        <Pagination
          page={page}
          hasMore={orders.data.length === 20}
          onChange={setPage}
        />
      </Panel>
      <p className="breadcrumb">QUẢN LÝ ĐƠN HÀNG</p>
      {detail && (
        <OrderDetails
          key={detail}
          id={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
function OrderDetails({ id, onClose }: { id: string; onClose(): void }) {
  const { user } = useSession();
  const employee = user!.vai_tro === 'Nhân viên';
  const detail = useResource<Order | null>('/orders/' + id, null);
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const [canceling, setCanceling] = useState(false);
  const order = detail.data;
  const phase = (action: 'start-preparing' | 'complete') =>
    void task.run(async () => {
      await api(`/orders/${id}/${action}`, { method: 'POST' });
      if (action === 'complete') onClose();
      refresh();
      notice(
        action === 'complete'
          ? 'Đã ghi nhận hoàn tất pha chế.'
          : 'Đã bắt đầu pha chế.',
      );
    });
  return (
    <>
      <Modal
        title={
          order?.ma_don_hien_thi
            ? 'Chi tiết đơn #' + order.ma_don_hien_thi
            : 'Chi tiết đơn hàng'
        }
        onClose={onClose}
        busy={task.pending}
        wide
      >
        <div className="dialog-body">
          <Loading active={detail.loading} />
          <ErrorMessage message={detail.error || task.error} />
          {order && (
            <>
              <dl className="detail-grid">
                <dt>Thời gian lập đơn</dt>
                <dd>{dateTimeText(order.thoi_gian_lap)}</dd>
                <dt>Nhân viên lập đơn</dt>
                <dd>{order.nhan_vien_lap}</dd>
                <dt>Phương thức thanh toán</dt>
                <dd>
                  {order.payments?.find(
                    (payment) => payment.trang_thai === 'Thành công',
                  )?.phuong_thuc ?? 'Chưa thanh toán'}
                </dd>
                <dt>Trạng thái</dt>
                <dd>
                  <Badge>{order.trang_thai_pha_che}</Badge>
                </dd>
              </dl>
              <h3>Danh sách món</h3>
              <DataTable
                rows={order.items}
                rowKey={(item) => item.ma_mon}
                columns={[
                  {
                    key: 'name',
                    label: 'Tên món',
                    render: (item) => item.ten_mon_luc_lap,
                  },
                  {
                    key: 'quantity',
                    label: 'Số lượng',
                    render: (item) => item.so_luong,
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
                        Number(item.so_luong) * Number(item.don_gia_luc_lap),
                      ),
                  },
                ]}
              />
              <div className="order-total">
                <span>Tổng tiền</span>
                <strong>{money(order.tong_tien)}</strong>
              </div>
            </>
          )}
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose} disabled={task.pending}>
            Đóng
          </Button>
          {order?.da_thanh_toan && (
            <Button
              disabled={task.pending}
              onClick={() =>
                void task.run(async () => {
                  await download(
                    `/orders/${id}/invoice.pdf`,
                    `hoa-don-${order.ma_don_hien_thi}.pdf`,
                  );
                })
              }
            >
              Xuất hóa đơn
            </Button>
          )}
          {employee &&
            order?.da_thanh_toan &&
            order.trang_thai_pha_che === 'Chưa pha chế' && (
              <Button
                variant="primary"
                disabled={task.pending}
                onClick={() => phase('start-preparing')}
              >
                Bắt đầu pha chế
              </Button>
            )}
          {employee && order?.trang_thai_pha_che === 'Bắt đầu pha chế' && (
            <Button
              variant="primary"
              disabled={task.pending}
              onClick={() => phase('complete')}
            >
              Hoàn tất pha chế
            </Button>
          )}
          {employee && order && !order.da_thanh_toan && (
            <Button
              variant="danger"
              onClick={() => {
                task.setError('');
                setCanceling(true);
              }}
            >
              Hủy đơn
            </Button>
          )}
        </footer>
      </Modal>
      {canceling && (
        <Confirm
          title="Hủy đơn"
          pending={task.pending}
          error={task.error}
          onClose={() => setCanceling(false)}
          onConfirm={() =>
            void task.run(async () => {
              await api('/orders/' + id, { method: 'DELETE' });
              setCanceling(false);
              onClose();
              refresh();
              notice('Hủy đơn thành công.');
            })
          }
        >
          Bạn có chắc chắn muốn hủy đơn #{order?.ma_don_hien_thi} không?
        </Confirm>
      )}
    </>
  );
}
