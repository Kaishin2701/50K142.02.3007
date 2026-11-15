import { useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  dateText,
  dateTimeText,
  money,
  numberText,
  shiftText,
  shortId,
  timeText,
} from '../../app/format';
import { ApiError, api } from '../../services/api';
import type { ClosingReport, CountLine } from '../../services/models';
import {
  Badge,
  Button,
  Confirm,
  DataTable,
  ErrorMessage,
  Loading,
  Modal,
  PageHeader,
  Panel,
  useNotice,
} from '../../components/ui';
import './closing-page.css';

export default function ClosingPage() {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const reports = useResource<ClosingReport[]>('/inventory/close-reports', []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (manager && selectedId)
    return (
      <ClosingReportPage
        key={selectedId}
        id={selectedId}
        manager
        onBack={() => setSelectedId(null)}
      />
    );

  if (manager)
    return (
      <main className="closing-page">
        <p className="breadcrumb">KHO / DUYỆT BÁO CÁO CUỐI CA</p>
        <PageHeader title="Báo cáo cuối ca" />
        <Panel className="closing-list-panel">
          <Loading active={reports.loading} />
          <ErrorMessage message={reports.error} />
          {!reports.loading && !reports.error && reports.data.length > 0 && (
            <p className="closing-list-description">
              {closingListDescription(reports.data)}
            </p>
          )}
          {!reports.loading && !reports.error && !reports.data.length && (
            <p className="ui-empty">Chưa có báo cáo cuối ca.</p>
          )}
          {reports.data.map((report) => (
            <article className="closing-report-row" key={report.ma_bao_cao}>
              <div className="closing-report-id">
                <strong>{shortId(report.ma_bao_cao)}</strong>
                {reports.data.length > 1 && (
                  <span>{dateText(report.ngay_kiem_ke)}</span>
                )}
              </div>
              <strong className="closing-report-author">
                {report.ho_ten_nguoi_lap}
              </strong>
              <Badge>{report.trang_thai}</Badge>
              <Button
                variant="primary"
                onClick={() => setSelectedId(report.ma_bao_cao)}
              >
                Xem
              </Button>
            </article>
          ))}
        </Panel>
      </main>
    );

  if (reports.loading)
    return (
      <main className="closing-page">
        <p className="breadcrumb">KHO / LẬP VÀ GỬI BÁO CÁO CUỐI CA</p>
        <PageHeader title="Báo cáo cuối ca" />
        <Panel>
          <Loading active />
        </Panel>
      </main>
    );

  if (reports.error)
    return (
      <main className="closing-page">
        <p className="breadcrumb">KHO / LẬP VÀ GỬI BÁO CÁO CUỐI CA</p>
        <PageHeader title="Báo cáo cuối ca" />
        <Panel>
          <ErrorMessage message={reports.error} />
        </Panel>
      </main>
    );

  const report = reports.data[0];
  if (!report)
    return (
      <main className="closing-page">
        <p className="breadcrumb">KHO / LẬP VÀ GỬI BÁO CÁO CUỐI CA</p>
        <PageHeader title="Báo cáo cuối ca" />
        <Panel className="closing-empty-panel">
          <p>
            Chưa có phiếu kiểm kho của ca này. Vui lòng kiểm kê nguyên liệu
            trước.
          </p>
        </Panel>
      </main>
    );

  return <ClosingReportPage id={report.ma_bao_cao} manager={false} />;
}

function closingListDescription(reports: ClosingReport[]) {
  if (reports.length !== 1) {
    return `Danh sách ${reports.length} báo cáo cuối ca`;
  }
  const report = reports[0];
  if (!report) return 'Danh sách báo cáo cuối ca';
  return `Báo cáo cuối ca ngày ${dateText(report.ngay_kiem_ke)} ${report.trang_thai.toLocaleLowerCase('vi-VN')}`;
}

function ClosingReportPage({
  id,
  manager,
  onBack,
}: {
  id: string;
  manager: boolean;
  onBack?: () => void;
}) {
  const report = useResource<ClosingReport | null>(
    '/inventory/close-reports/' + id,
    null,
  );
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const [confirming, setConfirming] = useState(false);
  const value = report.data;
  const lowStock = Boolean(
    value?.items.some(
      (item) =>
        Number(item.ton_thuc_te) < Number(item.muc_ton_toi_thieu),
    ),
  );

  const send = () =>
    void task.run(async () => {
      await api(`/inventory/close-reports/${id}/send`, { method: 'POST' });
      refresh();
      notice('Đã gửi báo cáo cuối ca cho quản lý.', 'inventory-success');
    });
  const sendLowStock = () =>
    void task.run(async () => {
      await api(`/inventory/close-reports/${id}/low-stock`, {
        method: 'POST',
      });
      notice('Đã gửi thông tin nguyên liệu cần nhập cho quản lý.', 'inventory-success');
    });
  const confirm = () =>
    void task.run(async () => {
      try {
        await api(`/inventory/close-reports/${id}/confirm`, { method: 'POST' });
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'STOCK_RECONCILIATION_CONFLICT')) {
          setConfirming(false);
        }
        throw error;
      }
      setConfirming(false);
      refresh();
      notice('Xác nhận báo cáo cuối ca thành công.', 'inventory-success');
    });

  return (
    <main className="closing-page">
      <p className="breadcrumb">
        {manager
          ? 'KHO / DUYỆT BÁO CÁO CUỐI CA'
          : 'KHO / LẬP VÀ GỬI BÁO CÁO CUỐI CA'}
      </p>
      <PageHeader
        title="Báo cáo cuối ca"
        actions={
          onBack ? (
            <Button onClick={onBack}>Quay lại danh sách</Button>
          ) : undefined
        }
      />
      <Loading active={report.loading} />
      <ErrorMessage message={report.error} />
      {value && (
        <>
          <ReportInformation report={value} />
          <MoneyReconciliation report={value} />
          <MaterialResults items={value.items} />
          <section className="closing-status-actions">
            <div className="closing-status-fields">
              <div>
                <span className="closing-field-label">Trạng thái báo cáo</span>
                <Badge>{value.trang_thai}</Badge>
              </div>
              {value.trang_thai === 'Đã xác nhận' && (
                <>
                  <div>
                    <span className="closing-field-label">Người xác nhận</span>
                    <strong>{value.ho_ten_nguoi_xac_nhan || '—'}</strong>
                  </div>
                  <div>
                    <span className="closing-field-label">
                      Thời gian xác nhận
                    </span>
                    <strong>
                      {closingConfirmationTime(value.thoi_gian_xac_nhan)}
                    </strong>
                  </div>
                </>
              )}
            </div>
            {!manager && value.trang_thai === 'Nháp' && (
              <Button
                variant="primary"
                disabled={task.pending}
                onClick={send}
              >
                Gửi báo cáo
              </Button>
            )}
            {!manager &&
              value.trang_thai === 'Chờ xác nhận' &&
              lowStock && (
                <Button
                  className="closing-low-stock-action"
                  variant="primary"
                  disabled={task.pending}
                  onClick={sendLowStock}
                >
                  Gửi thông tin nguyên liệu cần nhập
                </Button>
              )}
            {manager && value.trang_thai === 'Chờ xác nhận' && (
              <Button
                variant="primary"
                onClick={() => {
                  task.setError('');
                  setConfirming(true);
                }}
              >
                Xác nhận báo cáo
              </Button>
            )}
          </section>
        </>
      )}
      {confirming && (
        <Confirm
          title="Xác nhận báo cáo"
          pending={task.pending}
          error={task.error}
          onClose={() => setConfirming(false)}
          onConfirm={confirm}
        >
          Bạn có chắc chắn xác nhận báo cáo cuối ca này?
        </Confirm>
      )}
      {!confirming && task.error && (
        <div className="closing-error-toast" role="alert">
          {task.error}
        </div>
      )}
    </main>
  );
}

function closingConfirmationTime(value?: string) {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

function ReportInformation({ report }: { report: ClosingReport }) {
  const shift =
    report.gio_bat_dau && report.gio_ket_thuc
      ? `${timeText(report.gio_bat_dau)}–${timeText(report.gio_ket_thuc)}`
      : '—';
  return (
    <Panel className="closing-report-information">
      <ReportField label="Mã báo cáo" value={shortId(report.ma_bao_cao)} />
      <ReportField label="Ngày" value={dateText(report.ngay_kiem_ke)} />
      <ReportField label="Ca" value={shift} />
      <ReportField label="Người lập" value={report.ho_ten_nguoi_lap} />
    </Panel>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="closing-report-field">
      <span className="closing-field-label">{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function MoneyReconciliation({ report }: { report: ClosingReport }) {
  const actual =
    Number(report.tien_mat_thuc_thu) + Number(report.chuyen_khoan_thuc_thu);
  const difference = actual - Number(report.doanh_thu_ca_luc_doi_chieu);
  return (
    <Panel title="Kết quả đối chiếu tiền" className="closing-money-panel">
      <div className="closing-money-grid">
        <ReportField
          label="Doanh thu ca"
          value={money(report.doanh_thu_ca_luc_doi_chieu)}
        />
        <ReportField label="Tiền thực thu" value={money(actual)} />
        <ReportField label="Chênh lệch tiền" value={money(difference)} />
        <ReportField
          label="Lý do chênh lệch tiền"
          value={report.ly_do_chenh_lech_tien?.trim() || '—'}
        />
      </div>
    </Panel>
  );
}

function MaterialResults({ items }: { items: CountLine[] }) {
  return (
    <Panel title="Nguyên liệu" className="closing-materials-panel">
      <DataTable
        rows={items}
        rowKey={(item) => item.ma_nguyen_lieu}
        columns={[
          {
            key: 'name',
            label: 'Nguyên liệu',
            render: (item) => item.ten_nguyen_lieu,
          },
          {
            key: 'unit',
            label: 'Đơn vị tính',
            render: (item) => item.don_vi_tinh,
          },
          {
            key: 'actual',
            label: 'Tồn thực tế',
            render: (item) => numberText(item.ton_thuc_te),
          },
          {
            key: 'difference',
            label: 'Chênh lệch',
            render: (item) => {
              const difference = Number(item.chenh_lech);
              const value = numberText(item.chenh_lech);
              return (
                <span
                  className={
                    difference < 0 ? 'closing-difference-negative' : undefined
                  }
                >
                  {difference > 0 ? `+${value}` : value}
                </span>
              );
            },
          },
          {
            key: 'reason',
            label: 'Lý do chênh lệch',
            render: (item) =>
              item.ly_do_chenh_lech === 'Khác'
                ? `Khác - ${item.ghi_chu?.trim() || '—'}`
                : item.ly_do_chenh_lech?.trim() || '—',
          },
        ]}
      />
    </Panel>
  );
}

export function ClosingDetails({
  id,
  onClose,
}: {
  id: string;
  onClose(): void;
}) {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const report = useResource<ClosingReport | null>(
    '/inventory/close-reports/' + id,
    null,
  );
  const task = useTask();
  const notice = useNotice();
  const { refresh } = useDataStore();
  const [confirming, setConfirming] = useState(false);
  const value = report.data;
  const send = () =>
    void task.run(async () => {
      await api(`/inventory/close-reports/${id}/send`, { method: 'POST' });
      refresh();
      notice('Đã gửi báo cáo cuối ca cho quản lý.', 'inventory-success');
    });
  const confirm = () =>
    void task.run(async () => {
      await api(`/inventory/close-reports/${id}/confirm`, { method: 'POST' });
      setConfirming(false);
      refresh();
      notice('Xác nhận báo cáo cuối ca thành công.', 'inventory-success');
    });
  return (
    <>
      <Modal title="Báo cáo cuối ca" onClose={onClose} busy={task.pending} wide>
        <div className="dialog-body">
          <Loading active={report.loading} />
          <ErrorMessage message={report.error || task.error} />
          {value && (
            <>
              <dl className="detail-grid">
                <dt>Mã báo cáo</dt>
                <dd>{shortId(value.ma_bao_cao)}</dd>
                <dt>Ngày</dt>
                <dd>{dateText(value.ngay_kiem_ke)}</dd>
                <dt>Ca</dt>
                <dd>{shiftText(value)}</dd>
                <dt>Người lập</dt>
                <dd>{value.ho_ten_nguoi_lap}</dd>
              </dl>
              <h3>Kết quả đối chiếu tiền</h3>
              <div className="metric-grid metric-grid-three">
                <div className="metric">
                  <span>Doanh thu ca</span>
                  <strong>{money(value.doanh_thu_ca_luc_doi_chieu)}</strong>
                </div>
                <div className="metric">
                  <span>Tiền thực thu</span>
                  <strong>
                    {money(
                      Number(value.tien_mat_thuc_thu) +
                        Number(value.chuyen_khoan_thuc_thu),
                    )}
                  </strong>
                </div>
                <div className="metric">
                  <span>Chênh lệch tiền</span>
                  <strong>
                    {money(
                      Number(value.tien_mat_thuc_thu) +
                        Number(value.chuyen_khoan_thuc_thu) -
                        Number(value.doanh_thu_ca_luc_doi_chieu),
                    )}
                  </strong>
                </div>
              </div>
              <p>
                Lý do chênh lệch tiền · {value.ly_do_chenh_lech_tien ?? '—'}
              </p>
              <h3>Nguyên liệu</h3>
              <DataTable
                rows={value.items}
                rowKey={(item) => item.ma_nguyen_lieu}
                columns={[
                  {
                    key: 'name',
                    label: 'Nguyên liệu',
                    render: (item) => item.ten_nguyen_lieu,
                  },
                  {
                    key: 'unit',
                    label: 'Đơn vị tính',
                    render: (item) => item.don_vi_tinh,
                  },
                  {
                    key: 'actual',
                    label: 'Tồn thực tế',
                    render: (item) => numberText(item.ton_thuc_te),
                  },
                  {
                    key: 'difference',
                    label: 'Chênh lệch',
                    render: (item) => numberText(item.chenh_lech),
                  },
                  {
                    key: 'reason',
                    label: 'Lý do chênh lệch',
                    render: (item) =>
                      item.ly_do_chenh_lech === 'Khác'
                        ? `Khác - ${item.ghi_chu}`
                        : (item.ly_do_chenh_lech ?? '—'),
                  },
                ]}
              />
              <div className="ui-actions">
                <span>Trạng thái báo cáo</span>
                <Badge>{value.trang_thai}</Badge>
              </div>
              {value.trang_thai === 'Đã xác nhận' && (
                <dl className="detail-grid">
                  <dt>Người xác nhận</dt>
                  <dd>{value.ho_ten_nguoi_xac_nhan}</dd>
                  <dt>Thời gian xác nhận</dt>
                  <dd>{dateTimeText(value.thoi_gian_xac_nhan)}</dd>
                </dl>
              )}
            </>
          )}
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose} disabled={task.pending}>
            Đóng
          </Button>
          {value && !manager && value.trang_thai === 'Nháp' && (
            <Button variant="primary" disabled={task.pending} onClick={send}>
              Gửi báo cáo
            </Button>
          )}
          {value && !manager && value.trang_thai !== 'Nháp' && (
            <Button
              disabled={task.pending}
              onClick={() =>
                void task.run(async () => {
                  await api(`/inventory/close-reports/${id}/low-stock`, {
                    method: 'POST',
                  });
                  notice('Đã gửi thông tin nguyên liệu cần nhập.', 'inventory-success');
                })
              }
            >
              Gửi thông tin nguyên liệu cần nhập
            </Button>
          )}
          {value && manager && value.trang_thai === 'Chờ xác nhận' && (
            <Button
              variant="primary"
              onClick={() => {
                task.setError('');
                setConfirming(true);
              }}
            >
              Xác nhận báo cáo
            </Button>
          )}
        </footer>
      </Modal>
      {confirming && (
        <Confirm
          title="Xác nhận báo cáo"
          pending={task.pending}
          error={task.error}
          onClose={() => setConfirming(false)}
          onConfirm={confirm}
        >
          Xác nhận báo cáo cuối ca và cập nhật tồn kho?
        </Confirm>
      )}
    </>
  );
}
