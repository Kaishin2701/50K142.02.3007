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
  const reports = useResource<ClosingReport[]>('/inventory/close-reports', []);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Báo cáo cuối ca" />
      <Panel>
        <Loading active={reports.loading} />
        <ErrorMessage message={reports.error} />
        <DataTable
          rows={reports.data}
          rowKey={(report) => report.ma_bao_cao}
          empty="Chưa có báo cáo cuối ca."
          columns={[
            {
              key: 'code',
              label: 'Mã báo cáo',
              render: (report) => shortId(report.ma_bao_cao),
            },
            {
              key: 'date',
              label: 'Ngày',
              render: (report) => dateText(report.ngay_kiem_ke),
            },
            {
              key: 'user',
              label: 'Người lập',
              render: (report) => report.ho_ten_nguoi_lap,
            },
            {
              key: 'status',
              label: 'Trạng thái báo cáo',
              render: (report) => <Badge>{report.trang_thai}</Badge>,
            },
            {
              key: 'view',
              label: 'Thao tác',
              render: (report) => (
                <Button onClick={() => setSelected(report.ma_bao_cao)}>
                  Xem
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      <p className="breadcrumb">KHO / BÁO CÁO CUỐI CA</p>
      {selected && (
        <ClosingDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
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
