import { useEffect, useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  dateText,
  dateTimeText,
  money,
  numberText,
  shiftLabel,
  shortId,
} from '../../app/format';
import { api, type RecordData } from '../../services/api';
import type { ClosingReport } from '../../services/models';
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

export default function ClosingPage() {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const reports = useResource<ClosingReport[]>('/inventory/close-reports', []);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const reset = (event: Event) => {
      if ((event as CustomEvent).detail === 'closing') setSelected(null);
    };
    window.addEventListener('me-page-reselect', reset);
    return () => window.removeEventListener('me-page-reselect', reset);
  }, []);
  return (
    <>
      <PageHeader title="Báo cáo cuối ca" />
      <LowStockMessages manager={manager} onReport={setSelected} />
      {!selected && (
        <Panel className="closing-list-panel">
          <Loading active={reports.loading} />
          <ErrorMessage message={reports.error} />
          {!reports.data.length && !reports.loading && (
            <div className="closing-empty"><p>Chưa có báo cáo cuối ca.</p>{!manager && <p>Chưa có phiếu kiểm kho của ca. Vui lòng kiểm kê nguyên liệu trước khi lập báo cáo.</p>}</div>
          )}
          {reports.data.map((report) => (
            <div className="closing-list-item" key={report.ma_bao_cao}>
              <p>
                Báo cáo cuối ca {shiftLabel(report)}{' '}
                {manager && report.trang_thai === 'Chờ xác nhận'
                  ? 'chờ xác nhận'
                  : ''}
              </p>
              <div className="closing-report-row">
                <strong>{shortId(report.ma_bao_cao)}</strong>
                <span>{report.ho_ten_nguoi_lap}</span>
                <Badge>{report.trang_thai}</Badge>
                <Button
                  variant="primary"
                  onClick={() => setSelected(report.ma_bao_cao)}
                >
                  Xem
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      )}
      <p className="breadcrumb">KHO / BÁO CÁO CUỐI CA</p>
      {selected && (
        <ClosingDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          inline
        />
      )}
    </>
  );
}
export function ClosingDetails({
  id,
  onClose,
  inline = false,
}: {
  id: string;
  onClose(): void;
  inline?: boolean;
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
      notice('Đã gửi báo cáo cuối ca cho quản lý.');
    });
  const confirm = () =>
    void task.run(async () => {
      await api(`/inventory/close-reports/${id}/confirm`, { method: 'POST' });
      setConfirming(false);
      refresh();
      notice('Xác nhận báo cáo cuối ca thành công.');
    });
  return (
    <>
      <Modal
        title="Báo cáo cuối ca"
        onClose={onClose}
        busy={task.pending}
        wide
        inline={inline}
        className="closing-detail"
      >
        <div className="dialog-body">
          <Loading active={report.loading} />
          <ErrorMessage message={report.error || task.error} />
          {value && (
            <>
              <Panel className="closing-metadata-panel">
                <dl className="metadata-grid">
                  <div>
                    <dt>Mã báo cáo</dt>
                    <dd>{shortId(value.ma_bao_cao)}</dd>
                  </div>
                  <div>
                    <dt>Ngày</dt>
                    <dd>{dateText(value.ngay_kiem_ke)}</dd>
                  </div>
                  <div>
                    <dt>Ca</dt>
                    <dd>{shiftLabel(value)}</dd>
                  </div>
                  <div>
                    <dt>Người lập</dt>
                    <dd>{value.ho_ten_nguoi_lap}</dd>
                  </div>
                </dl>
              </Panel>
              <Panel
                title="Kết quả đối chiếu tiền"
                className="closing-money-panel"
              >
                <div className="metric-grid closing-money-grid">
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
                  <div className="metric">
                    <span>Lý do chênh lệch tiền</span>
                    <strong>{value.ly_do_chenh_lech_tien ?? '—'}</strong>
                  </div>
                </div>
              </Panel>
              <Panel title="Nguyên liệu" className="closing-stock-panel">
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
              </Panel>
              <dl className="closing-confirmation-metadata">
                <div><dt>Trạng thái báo cáo</dt><dd><Badge>{value.trang_thai}</Badge></dd></div>
                {value.trang_thai === 'Đã xác nhận' && <><div><dt>Người xác nhận</dt><dd>{value.ho_ten_nguoi_xac_nhan}</dd></div><div><dt>Thời gian xác nhận</dt><dd>{dateTimeText(value.thoi_gian_xac_nhan)}</dd></div></>}
              </dl>
            </>
          )}
        </div>
        <footer className="dialog-actions">
          {!inline && (
            <Button onClick={onClose} disabled={task.pending}>
              Đóng
            </Button>
          )}
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
                  notice('Đã gửi thông tin nguyên liệu cần nhập.');
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
          className="closing-confirm-dialog"
          showClose
          title="Xác nhận báo cáo"
          pending={task.pending}
          error={task.error}
          onClose={() => setConfirming(false)}
          onConfirm={confirm}
        >
          Bạn có chắc chắn xác nhận báo cáo cuối ca này?
        </Confirm>
      )}
    </>
  );
}

function LowStockMessages({ manager, onReport }: { manager: boolean; onReport(id: string): void }) {
  const notifications = useResource<RecordData[]>('/notifications?limit=100', []);
  const [selected, setSelected] = useState<RecordData | null>(null);
  const task = useTask();
  const notice = useNotice();
  const { refresh } = useDataStore();
  const messages = notifications.data.filter(item => manager ? item.loai === 'CAN_NHAP_HANG' : item.loai === 'YEU_CAU_GUI_LAI_NGUYEN_LIEU');
  const payload = (message: RecordData) => { try { return typeof message.du_lieu === 'string' ? JSON.parse(message.du_lieu) : message.du_lieu ?? {}; } catch { return {}; } };
  const data = selected ? payload(selected) : null;
  return <>
    {messages.length > 0 && <Panel className="low-stock-messages" title={manager ? 'Thông tin nguyên liệu cần nhập' : 'Yêu cầu gửi lại thông tin nguyên liệu'}>
      <ErrorMessage message={notifications.error || task.error} />
      {messages.map(message => <div className="closing-report-row" key={message.ma_thong_bao}><span>{message.noi_dung}</span><span>{dateTimeText(message.tao_luc)}</span><Button onClick={() => {
        if (manager) setSelected(message); else if (payload(message).ma_bao_cao) onReport(payload(message).ma_bao_cao);
        void task.run(async () => { await api(`/notifications/${message.ma_thong_bao}/read`, { method: 'POST' }); refresh(); });
      }}>Xem thông tin</Button></div>)}
    </Panel>}
    {selected && <Modal title={`Cần nhập ${(data.items ?? []).length} nguyên liệu`} className="low-stock-request-dialog" wide onClose={() => setSelected(null)} busy={task.pending}>
      <div className="dialog-body"><div className="low-stock-sender"><strong>{data.nguoi_gui ?? '—'}</strong><p>{dateTimeText(data.thoi_gian_gui ?? selected.tao_luc)}</p></div>
        <DataTable<RecordData> className="compact-table" rows={data.items ?? []} rowKey={item => item.ma_nguyen_lieu} columns={[
          { key: 'code', label: 'Mã nguyên liệu', render: item => shortId(item.ma_nguyen_lieu) },
          { key: 'name', label: 'Tên nguyên liệu', render: item => item.ten_nguyen_lieu },
          { key: 'unit', label: 'Đơn vị tính', render: item => item.don_vi_tinh },
          { key: 'actual', label: 'Tồn thực tế', render: item => numberText(item.ton_thuc_te) },
          { key: 'minimum', label: 'Mức tồn tối thiểu', render: item => numberText(item.muc_ton_toi_thieu) },
        ]} /><ErrorMessage message={task.error} />
      </div><footer className="dialog-actions"><Button variant="primary" disabled={task.pending || !data.ma_bao_cao} onClick={() => void task.run(async () => {
        await api(`/inventory/close-reports/${data.ma_bao_cao}/request-low-stock-resend`, { method: 'POST' }); notice('Đã yêu cầu gửi lại thông tin nguyên liệu cần nhập'); setSelected(null); refresh();
      })}>Yêu cầu gửi lại</Button></footer>
    </Modal>}
  </>;
}
