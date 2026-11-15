import { useCallback, useEffect, useState } from 'react';
import { useResource } from '../../app/data';
import { dateText, money, numberText, shortId } from '../../app/format';
import type { Page } from '../../app/router';
import { api, type RecordData } from '../../services/api';
import {
  Badge,
  Button,
  DataTable,
  ErrorMessage,
  Loading,
  PageHeader,
  Panel,
  Pagination,
  type Column,
} from '../../components/ui';
import './inventory-stock.css';
import './receipt-history.css';
import './inventory-loss-history.css';

const RECEIPT_PAGE_SIZE = 20;

export default function InventoryPage({ page: mode }: { page: Page }) {
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptDetailError, setReceiptDetailError] = useState(false);
  const [lastReceiptPage, setLastReceiptPage] = useState<number | null>(null);
  const showReceiptDetailError = useCallback(
    () => setReceiptDetailError(true),
    [],
  );
  useEffect(() => {
    setPage(1);
    setReceipt(null);
    setReceiptDetailError(false);
    setLastReceiptPage(null);
  }, [mode]);
  const path =
    mode === 'stock'
      ? '/inventory/materials'
      : `/inventory/${mode === 'receipts' ? 'receipts' : 'losses'}?page=${page}&limit=${RECEIPT_PAGE_SIZE}`;
  const result = useResource<RecordData[]>(path, []);
  const title =
    mode === 'stock'
      ? 'Tổng hợp tồn kho'
      : mode === 'receipts'
        ? 'Lịch sử nhập hàng'
        : 'Lịch sử hao hụt';
  const totalValue = result.data[0]?.total;
  const totalReceipts =
    totalValue === null || totalValue === undefined
      ? null
      : Number(totalValue);
  const totalReceiptPages =
    totalReceipts !== null && Number.isFinite(totalReceipts)
      ? Math.ceil(totalReceipts / RECEIPT_PAGE_SIZE)
      : null;
  useEffect(() => {
    if (
      mode !== 'receipts' ||
      page <= 1 ||
      result.loading ||
      result.error ||
      result.data.length > 0
    )
      return;
    const lastPage = totalReceiptPages !== null
      ? Math.max(1, totalReceiptPages)
      : page - 1;
    if (totalReceiptPages === null) setLastReceiptPage(lastPage);
    if (lastPage < page) setPage(lastPage);
  }, [
    mode,
    page,
    result.loading,
    result.error,
    result.data.length,
    totalReceiptPages,
  ]);
  const hasMoreReceipts = totalReceiptPages !== null
    ? page < totalReceiptPages
    : lastReceiptPage !== null
      ? page < lastReceiptPage
      : result.data.length === RECEIPT_PAGE_SIZE;
  const columns: Column<RecordData>[] =
    mode === 'receipts'
      ? [
            {
              key: 'index',
              label: 'STT',
              render: (_row, index) =>
                (page - 1) * RECEIPT_PAGE_SIZE + index + 1,
            },
            {
              key: 'code',
              label: 'Mã PO',
              render: (row) => (
                <Button
                  variant="quiet"
                  className="receipt-history-code"
                  aria-label={`Xem chi tiết phiếu ${row.ma_po}`}
                  onClick={() => {
                    setReceipt(row.ma_po);
                    setReceiptDetailError(false);
                  }}
                >
                  {row.ma_po}
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
              render: (row) => (
                <ReceiptPaymentStatus status={row.trang_thai_thanh_toan} />
              ),
            },
            {
              key: 'method',
              label: 'Hình thức thanh toán',
              render: (row) => row.hinh_thuc_thanh_toan ?? 'Chưa có',
            },
          ]
        : [
            {
              key: 'date',
              label: 'Ngày kiểm kê',
              render: (row) => dateText(row.ngay_kiem_ke),
            },
            { key: 'shift', label: 'Ca', render: (row) => shortId(row.ma_ca) },
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
      {mode === 'stock' ? (
        <main className="inventory-stock-page">
          <p className="breadcrumb inventory-stock-breadcrumb">
            KHO / TỔNG HỢP TỒN KHO
          </p>
          <PageHeader title={title} />
          <StockSummary
            rows={result.data}
            loading={result.loading}
            error={result.error}
            refresh={result.refresh}
          />
        </main>
      ) : mode === 'receipts' ? (
        <main className="receipt-history-page">
          <p className="breadcrumb receipt-history-breadcrumb">
            KHO / LỊCH SỬ NHẬP HÀNG
          </p>
          <PageHeader title={title} />
          {receipt && !receiptDetailError ? (
            <ReceiptDetails
              key={receipt}
              id={receipt}
              onClose={() => {
                setReceipt(null);
                setReceiptDetailError(false);
              }}
              onError={showReceiptDetailError}
            />
          ) : (
            <>
              {result.loading ? (
                <Panel className="receipt-history-state">
                  <Loading active />
                </Panel>
              ) : result.error ? (
                <Panel className="receipt-history-state receipt-history-error">
                  <p role="alert">
                    Không thể tải lịch sử nhập hàng. Vui lòng thử lại.
                  </p>
                  <Button
                    className="receipt-history-retry"
                    variant="primary"
                    onClick={result.refresh}
                  >
                    Tải lại
                  </Button>
                </Panel>
              ) : result.data.length === 0 ? (
                <Panel className="receipt-history-state">
                  <p>Chưa có lần nhập hàng nào.</p>
                </Panel>
              ) : (
                <Panel
                  className="receipt-history-list-panel"
                  title="Lịch sử nhập hàng"
                >
                  <DataTable
                    columns={columns}
                    rows={result.data}
                    rowKey={(row) => row.ma_po}
                  />
                  <ReceiptPagination
                    page={page}
                    hasMore={hasMoreReceipts}
                    onChange={setPage}
                  />
                </Panel>
              )}
              {receiptDetailError && (
                <div
                  className="receipt-detail-error-notice"
                  role="alert"
                >
                  Không thể tải chi tiết lần nhập hàng. Vui lòng thử lại.
                </div>
              )}
            </>
          )}
        </main>
      ) : mode === 'losses' ? (
        <LossHistory
          page={page}
          setPage={setPage}
          rows={result.data}
          loading={result.loading}
          error={result.error}
          refresh={result.refresh}
        />
      ) : (
        <>
          <PageHeader title={title} />
          <Panel>
            <Loading active={result.loading} />
            <ErrorMessage message={result.error} />
            <DataTable
              columns={columns}
              rows={result.data}
              rowKey={(row) => row.ma_phieu + row.ma_nguyen_lieu}
              empty="Không có lịch sử hao hụt."
            />
            <Pagination
              page={page}
              hasMore={result.data.length === 20}
              onChange={setPage}
            />
          </Panel>
          <p className="breadcrumb">KHO / {title.toLocaleUpperCase('vi-VN')}</p>
        </>
      )}
    </>
  );
}

function LossHistory({
  page,
  setPage,
  rows,
  loading,
  error,
  refresh,
}: {
  page: number;
  setPage(page: number): void;
  rows: RecordData[];
  loading: boolean;
  error: string;
  refresh(): void;
}) {
  const [lastPopulatedPage, setLastPopulatedPage] = useState<number | null>(
    null,
  );
  const totalValue = rows[0]?.total;
  const totalRows =
    totalValue === null || totalValue === undefined ? null : Number(totalValue);
  const totalPages =
    totalRows !== null && Number.isFinite(totalRows)
      ? Math.ceil(totalRows / RECEIPT_PAGE_SIZE)
      : null;

  useEffect(() => {
    if (loading || error || !rows.length || totalPages !== null) return;
    setLastPopulatedPage(page);
  }, [page, loading, error, rows.length, totalPages]);

  useEffect(() => {
    if (page <= 1 || loading || error || rows.length > 0) return;
    const lastPage =
      totalPages !== null
        ? Math.max(1, totalPages)
        : Math.max(1, page - 1);
    if (totalPages === null) setLastPopulatedPage(lastPage);
    if (lastPage < page) setPage(lastPage);
  }, [page, loading, error, rows.length, totalPages, setPage]);

  const hasMore =
    totalPages !== null
      ? page < totalPages
      : page < (lastPopulatedPage ?? 1) || rows.length === RECEIPT_PAGE_SIZE;

  if (loading)
    return (
      <main className="inventory-loss-page">
        <LossPageHeader />
        <Panel className="inventory-loss-state">
          <Loading active />
        </Panel>
      </main>
    );

  if (error)
    return (
      <main className="inventory-loss-page">
        <LossPageHeader />
        <Panel className="inventory-loss-state inventory-loss-error">
          <p role="alert">
            Không thể tải lịch sử hao hụt. Vui lòng thử lại.
          </p>
          <Button
            className="inventory-loss-retry"
            variant="primary"
            onClick={refresh}
          >
            Tải lại
          </Button>
        </Panel>
      </main>
    );

  if (!rows.length)
    return (
      <main className="inventory-loss-page">
        <LossPageHeader />
        <Panel className="inventory-loss-state">
          <p>Chưa có dữ liệu hao hụt.</p>
        </Panel>
      </main>
    );

  return (
    <main className="inventory-loss-page">
      <LossPageHeader />
      <Panel className="inventory-loss-list-panel" title="Lịch sử hao hụt">
        <div className="inventory-loss-table-scroll">
          <table className="inventory-loss-table">
            <thead>
              <tr>
                <th scope="col">STT</th>
                <th scope="col">Ngày</th>
                <th scope="col">Ca</th>
                <th scope="col">Nguyên liệu</th>
                <th scope="col">Đơn vị tính</th>
                <th scope="col">Tồn lý thuyết</th>
                <th scope="col">Tồn thực tế</th>
                <th scope="col">Chênh lệch</th>
                <th scope="col">Lý do chênh lệch</th>
                <th scope="col">Người ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const difference = Number(row.chenh_lech);
                const differenceText =
                  Number.isFinite(difference) && difference > 0
                    ? `+${numberText(row.chenh_lech)}`
                    : numberText(row.chenh_lech);
                return (
                  <tr
                    key={`${row.ma_phieu ?? row.ma_kiem_kho ?? `${row.ma_ca ?? ''}-${row.ma_nguyen_lieu ?? ''}`}-${index}`}
                  >
                    <td>{(page - 1) * RECEIPT_PAGE_SIZE + index + 1}</td>
                    <td>{dateText(row.ngay_kiem_ke)}</td>
                    <td>{shortId(row.ma_ca)}</td>
                    <td>{row.ten_nguyen_lieu}</td>
                    <td>{row.don_vi_tinh}</td>
                    <td>{numberText(row.ton_ly_thuyet_luc_kiem_ke)}</td>
                    <td>{numberText(row.ton_thuc_te)}</td>
                    <td
                      className={
                        Number.isFinite(difference) && difference < 0
                          ? 'is-negative'
                          : undefined
                      }
                    >
                      {differenceText}
                    </td>
                    <td>
                      {row.ly_do_chenh_lech === 'Khác'
                        ? `Khác - ${row.ghi_chu}`
                        : row.ly_do_chenh_lech}
                    </td>
                    <td>{row.nguoi_ghi_nhan}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <LossPagination page={page} hasMore={hasMore} onChange={setPage} />
      </Panel>
    </main>
  );
}

function LossPageHeader() {
  return (
    <>
      <p className="breadcrumb inventory-loss-breadcrumb">
        KHO / LỊCH SỬ HAO HỤT
      </p>
      <PageHeader title="Lịch sử hao hụt kho" />
    </>
  );
}

function LossPagination({
  page,
  hasMore,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  onChange(page: number): void;
}) {
  return (
    <nav
      className="inventory-loss-pagination"
      aria-label="Phân trang hao hụt"
    >
      <Button onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Trang trước
      </Button>
      <span aria-current="page">{page}</span>
      <Button onClick={() => onChange(page + 1)} disabled={!hasMore}>
        Trang sau
      </Button>
    </nav>
  );
}

function StockSummary({
  rows,
  loading,
  error,
  refresh,
}: {
  rows: RecordData[];
  loading: boolean;
  error: string;
  refresh(): void;
}) {
  if (loading)
    return (
      <Panel className="inventory-stock-state">
        <Loading active />
      </Panel>
    );

  if (error)
    return (
      <Panel className="inventory-stock-state inventory-stock-error">
        <p role="alert">
          Không thể tải dữ liệu tồn kho. Vui lòng thử lại.
        </p>
        <Button variant="primary" onClick={refresh}>
          Tải lại
        </Button>
      </Panel>
    );

  if (!rows.length)
    return (
      <Panel className="inventory-stock-state inventory-stock-empty">
        <p>Chưa có nguyên liệu nào trong kho.</p>
      </Panel>
    );

  const lowStockCount = rows.filter(
    (row) => row.trang_thai === 'Sắp hết',
  ).length;

  return (
    <>
      <div
        className={`inventory-stock-notice${lowStockCount ? ' is-warning' : ' is-normal'}`}
        role="status"
      >
        {lowStockCount
          ? `Có ${lowStockCount} nguyên liệu dưới mức tồn tối thiểu`
          : 'Tất cả nguyên liệu đều trên mức tồn tối thiểu.'}
      </div>
      <Panel className="inventory-stock-table-panel">
        <div className="inventory-stock-table-scroll">
          <table className="inventory-stock-table">
            <thead>
              <tr>
                <th scope="col">STT</th>
                <th scope="col">Mã nguyên liệu</th>
                <th scope="col">Tên nguyên liệu</th>
                <th scope="col">Đơn vị tính</th>
                <th scope="col">Tồn lý thuyết</th>
                <th scope="col">
                  Tồn thực tế
                  <br />
                  (lần kiểm kho gần nhất)
                </th>
                <th scope="col">Mức tồn tối thiểu</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isLow = row.trang_thai === 'Sắp hết';
                const status =
                  row.trang_thai === 'Đủ tồn'
                    ? 'Bình thường'
                    : row.trang_thai;
                return (
                  <tr
                    key={row.ma_nguyen_lieu}
                    className={isLow ? 'is-low-stock' : undefined}
                  >
                    <td>{index + 1}</td>
                    <td>{shortId(row.ma_nguyen_lieu)}</td>
                    <td>{row.ten_nguyen_lieu}</td>
                    <td>{row.don_vi_tinh}</td>
                    <td>{numberText(row.ton_ly_thuyet)}</td>
                    <td>{numberText(row.ton_thuc_te_gan_nhat)}</td>
                    <td>{numberText(row.muc_ton_toi_thieu)}</td>
                    <td>
                      <span
                        className={`inventory-stock-badge${isLow ? ' is-warning' : ' is-normal'}`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function ReceiptDetails({
  id,
  onClose,
  onError,
}: {
  id: string;
  onClose(): void;
  onError(): void;
}) {
  const result = useResource<RecordData | null>(
    '/inventory/receipts/' + encodeURIComponent(id),
    null,
  );
  const receipt = result.data;
  useEffect(() => {
    if (result.error) onError();
  }, [result.error, onError]);
  return (
    <>
      <Button
        className="receipt-history-back"
        onClick={onClose}
        aria-label="Quay lại danh sách nhập hàng"
      >
        Quay lại
      </Button>
      <Panel className="receipt-history-detail-panel" title="Chi tiết lần nhập hàng">
        {result.loading ? (
          <Loading active />
        ) : result.error ? (
          <p className="receipt-history-error-message" role="alert">
            Không thể tải chi tiết lần nhập hàng. Vui lòng thử lại.
          </p>
        ) : (
          receipt && (
            <>
              <dl className="receipt-history-meta">
                <div>
                  <dt>Mã PO</dt>
                  <dd>{receipt.ma_po}</dd>
                </div>
                <div>
                  <dt>Nhà cung cấp</dt>
                  <dd>{receipt.ten_nha_cung_cap}</dd>
                </div>
                <div>
                  <dt>Ngày nhập</dt>
                  <dd>{dateText(receipt.ngay_nhap)}</dd>
                </div>
                <div>
                  <dt>Người xác nhận nhập hàng</dt>
                  <dd>{receipt.nguoi_xac_nhan}</dd>
                </div>
                <div>
                  <dt>Trạng thái thanh toán</dt>
                  <dd>
                    <ReceiptPaymentStatus
                      status={receipt.trang_thai_thanh_toan}
                    />
                  </dd>
                </div>
                <div>
                  <dt>Hình thức thanh toán</dt>
                  <dd>{receipt.hinh_thuc_thanh_toan ?? 'Chưa có'}</dd>
                </div>
                <div>
                  <dt>Tổng tiền</dt>
                  <dd>{money(receipt.tong_tien)}</dd>
                </div>
              </dl>
              <DataTable<RecordData>
                rows={receipt.items}
                rowKey={(row) => row.ma_nguyen_lieu}
                empty="Phiếu nhập hàng chưa có nguyên liệu."
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
            </>
          )
        )}
      </Panel>
    </>
  );
}

function ReceiptPaymentStatus({ status }: { status: string }) {
  return (
    <span
      className={`receipt-history-payment${status === 'Công nợ' ? ' is-debt' : ''}`}
    >
      {status}
    </span>
  );
}

function ReceiptPagination({
  page,
  hasMore,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  onChange(page: number): void;
}) {
  return (
    <nav
      className="receipt-history-pagination"
      aria-label="Phân trang nhập hàng"
    >
      <Button onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Trang trước
      </Button>
      <span aria-current="page">{page}</span>
      <Button onClick={() => onChange(page + 1)} disabled={!hasMore}>
        Trang sau
      </Button>
    </nav>
  );
}
