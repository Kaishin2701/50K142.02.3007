import { useEffect, useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  dateText,
  dateTimeText,
  money,
  numberText,
  shiftText,
  shortId,
} from '../../app/format';
import { api } from '../../services/api';
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
      {!selected && (
        <Panel className="closing-list-panel">
          <Loading active={reports.loading} />
          <ErrorMessage message={reports.error} />
          {!reports.data.length && !reports.loading && (
            <p className="ui-empty">Chưa có báo cáo cuối ca.</p>
          )}
          {reports.data.map((report) => (
            <div className="closing-list-item" key={report.ma_bao_cao}>
              <p>
                Báo cáo cuối ca {shiftText(report)}{' '}
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
                    <dd>{shiftText(value)}</dd>
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
              <div className="closing-status">
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
