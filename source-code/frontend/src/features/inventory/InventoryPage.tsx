import { useEffect, useState } from 'react';
import { useResource } from '../../app/data';
import { dateText, money, numberText, shortId } from '../../app/format';
import type { Page } from '../../app/router';
import type { RecordData } from '../../services/api';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  Loading,
  Modal,
  PageHeader,
  Panel,
  Pagination,
  type Column,
} from '../../components/ui';

export default function InventoryPage({ page: mode }: { page: Page }) {
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => {
    setPage(1);
    setReceipt(null);
  }, [mode]);
  const path =
    mode === 'stock'
      ? '/inventory/materials'
      : `/inventory/${mode === 'receipts' ? 'receipts' : 'losses'}?page=${page}&limit=20`;
  const result = useResource<RecordData[]>(path, []);
  const title =
    mode === 'stock'
      ? 'Tổng hợp tồn kho'
      : mode === 'receipts'
        ? 'Lịch sử nhập hàng'
        : 'Lịch sử hao hụt kho';
  const columns: Column<RecordData>[] =
    mode === 'stock'
      ? [
          { key: 'index', label: 'STT', render: (_row, index) => index + 1 },
          {
            key: 'code',
            label: 'Mã nguyên liệu',
            render: (row) => shortId(row.ma_nguyen_lieu),
          },
          {
            key: 'name',
            label: 'Tên nguyên liệu',
            render: (row) => row.ten_nguyen_lieu,
          },
          {
            key: 'unit',
            label: 'Đơn vị tính',
            render: (row) => row.don_vi_tinh,
          },
          {
            key: 'stock',
            label: 'Tồn lý thuyết',
            render: (row) => numberText(row.ton_ly_thuyet),
          },
          {
            key: 'counted',
            label: 'Tồn thực tế (lần kiểm kho gần nhất)',
            render: (row) => numberText(row.ton_thuc_te_gan_nhat),
          },
          {
            key: 'minimum',
            label: 'Mức tồn tối thiểu',
            render: (row) => numberText(row.muc_ton_toi_thieu),
          },
          {
            key: 'status',
            label: 'Trạng thái',
            render: (row) => <Badge>{row.trang_thai}</Badge>,
          },
        ]
      : mode === 'receipts'
        ? [
            {
              key: 'index',
              label: 'STT',
              render: (_row, index) => (page - 1) * 20 + index + 1,
            },
            {
              key: 'code',
              label: 'Mã PO',
              render: (row) => (
                <Button variant="quiet" onClick={() => setReceipt(row.ma_po)}>
                  {shortId(row.ma_po)}
                </Button>
              ),
            },
            {
              key: 'date',
              label: 'Ngày nhập',
              render: (row) => dateText(row.ngay_nhap),
            },
            {
              key: 'supplier',
              label: 'Nhà cung cấp',
              render: (row) => row.ten_nha_cung_cap,
            },
            {
              key: 'total',
              label: 'Tổng tiền',
              render: (row) => money(row.tong_tien),
            },
            {
              key: 'status',
              label: 'Trạng thái thanh toán',
              render: (row) => <Badge>{row.trang_thai_thanh_toan}</Badge>,
            },
            {
              key: 'method',
              label: 'Hình thức thanh toán',
              render: (row) => row.hinh_thuc_thanh_toan ?? 'Chưa có',
            },
          ]
        : [
            {
              key: 'index',
              label: 'STT',
              render: (_row, index) => (page - 1) * 20 + index + 1,
            },
            {
              key: 'date',
              label: 'Ngày',
              render: (row) => dateText(row.ngay_kiem_ke),
            },
            { key: 'shift', label: 'Ca', render: (row) => shortId(row.ma_ca) },
            {
              key: 'name',
              label: 'Nguyên liệu',
              render: (row) => row.ten_nguyen_lieu,
            },
            {
              key: 'unit',
              label: 'Đơn vị tính',
              render: (row) => row.don_vi_tinh,
            },
            {
              key: 'theoretical',
              label: 'Tồn lý thuyết',
              render: (row) => numberText(row.ton_ly_thuyet_luc_kiem_ke),
            },
            {
              key: 'actual',
              label: 'Tồn thực tế',
              render: (row) => numberText(row.ton_thuc_te),
            },
            {
              key: 'difference',
              label: 'Chênh lệch',
              render: (row) => numberText(row.chenh_lech),
            },
            {
              key: 'reason',
              label: 'Lý do chênh lệch',
              render: (row) =>
                row.ly_do_chenh_lech === 'Khác'
                  ? `Khác - ${row.ghi_chu}`
                  : row.ly_do_chenh_lech,
            },
            {
              key: 'user',
              label: 'Người ghi nhận',
              render: (row) => row.nguoi_ghi_nhan,
            },
          ];
  return (
    <>
      <PageHeader title={title} />
      {mode === 'stock' && (
        <p
          className={
            'stock-alert' +
            (result.data.some((row) => row.trang_thai === 'Sắp hết')
              ? ' is-low'
              : '')
          }
        >
          Có {result.data.filter((row) => row.trang_thai === 'Sắp hết').length}{' '}
          nguyên liệu dưới mức tồn tối thiểu
        </p>
      )}
      <Panel
        title={
          mode === 'stock'
            ? undefined
            : mode === 'receipts'
              ? 'Lịch sử nhập hàng'
              : 'Lịch sử hao hụt'
        }
        className={'inventory-list-panel inventory-' + mode}
      >
        <Loading active={result.loading} />
        <ErrorMessage message={result.error} />
        <DataTable
          columns={columns}
          rows={result.data}
          rowClassName={(row) =>
            mode === 'stock' && row.trang_thai === 'Sắp hết'
              ? 'low-stock-row'
              : ''
          }
          rowKey={(row) =>
            mode === 'stock'
              ? row.ma_nguyen_lieu
              : mode === 'receipts'
                ? row.ma_po
                : row.ma_phieu + row.ma_nguyen_lieu
          }
          empty={
            mode === 'stock'
              ? 'Không có nguyên liệu.'
              : mode === 'receipts'
                ? 'Không có lịch sử nhập hàng.'
                : 'Không có lịch sử hao hụt.'
          }
        />
        {mode !== 'stock' && (
          <Pagination
            page={page}
            hasMore={result.data.length === 20}
            onChange={setPage}
          />
        )}
      </Panel>
      <p className="breadcrumb">KHO / {title.toLocaleUpperCase('vi-VN')}</p>
      {receipt && (
        <ReceiptDetails
          key={receipt}
          id={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </>
  );
}
function ReceiptDetails({ id, onClose }: { id: string; onClose(): void }) {
  const result = useResource<RecordData | null>(
    '/inventory/receipts/' + id,
    null,
  );
  const receipt = result.data;
  return (
    <Modal title="Chi tiết nhập hàng" onClose={onClose} wide>
      <div className="dialog-body">
        <Loading active={result.loading} />
        <ErrorMessage message={result.error} />
        {receipt && (
          <>
            <dl className="detail-grid">
              <dt>Mã nhập hàng</dt>
              <dd>{shortId(receipt.ma_po)}</dd>
              <dt>Nhà cung cấp</dt>
              <dd>{receipt.ten_nha_cung_cap}</dd>
              <dt>Ngày nhập</dt>
              <dd>{dateText(receipt.ngay_nhap)}</dd>
              <dt>Người xác nhận nhập hàng</dt>
              <dd>{receipt.nguoi_xac_nhan}</dd>
              <dt>Trạng thái thanh toán</dt>
              <dd>{receipt.trang_thai_thanh_toan}</dd>
              <dt>Hình thức thanh toán</dt>
              <dd>{receipt.hinh_thuc_thanh_toan ?? 'Chưa có'}</dd>
            </dl>
            <DataTable<RecordData>
              rows={receipt.items}
              rowKey={(row) => row.ma_nguyen_lieu}
              columns={[
                {
                  key: 'name',
                  label: 'Tên nguyên liệu',
                  render: (row) => row.ten_nguyen_lieu,
                },
                {
                  key: 'unit',
                  label: 'Đơn vị tính',
                  render: (row) => row.don_vi_tinh,
                },
                {
                  key: 'ordered',
                  label: 'Số lượng đặt',
                  render: (row) => numberText(row.so_luong_dat),
                },
                {
                  key: 'received',
                  label: 'Số lượng nhận',
                  render: (row) => numberText(row.so_luong_nhan),
                },
                {
                  key: 'price',
                  label: 'Đơn giá',
                  render: (row) => money(row.don_gia),
                },
                {
                  key: 'total',
                  label: 'Thành tiền',
                  render: (row) => money(row.thanh_tien),
                },
              ]}
            />
            <div className="order-total">
              <span>Tổng tiền</span>
              <strong>{money(receipt.tong_tien)}</strong>
            </div>
          </>
        )}
      </div>
      <footer className="dialog-actions">
        <Button onClick={onClose}>Đóng</Button>
      </footer>
    </Modal>
  );
}
