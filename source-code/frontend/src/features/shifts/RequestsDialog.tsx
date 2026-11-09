import { useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import { shiftText } from '../../app/format';
import { api } from '../../services/api';
import type { ShiftRequest } from '../../services/models';
import {
  Badge,
  Button,
  Confirm,
  ErrorMessage,
  Loading,
  Modal,
  useNotice,
} from '../../components/ui';

export function RequestsDialog({ onClose }: { onClose(): void }) {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const requests = useResource<ShiftRequest[]>('/shifts/requests', []);
  const [decision, setDecision] = useState<{
    request: ShiftRequest;
    accept: boolean;
  } | null>(null);
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const canRespond = (request: ShiftRequest) =>
    manager
      ? request.trang_thai === 'Chờ xử lý'
      : request.trang_thai === 'Chờ đồng nghiệp' &&
        request.ma_nhan_vien_duoc_de_nghi === user!.ma_nguoi_dung;
  const decide = () =>
    void task.run(async () => {
      if (!decision) return;
      await api(
        `/shifts/requests/${decision.request.ma_yeu_cau}/${manager ? 'decide' : 'respond'}`,
        { method: 'POST', body: { dong_y: decision.accept } },
      );
      setDecision(null);
      refresh();
      notice('Đã ghi nhận phản hồi yêu cầu.');
    });
  return (
    <>
      <Modal
        title="Danh sách yêu cầu đổi hoặc xoay ca"
        onClose={onClose}
        busy={task.pending}
        wide
      >
        <div className="dialog-body">
          <Loading active={requests.loading} />
          <ErrorMessage message={requests.error || task.error} />
          <div className="request-list">
            {requests.data.map((request) => (
              <article className="request-card" key={request.ma_yeu_cau}>
                <div className="ui-actions">
                  <h3>{request.loai_yeu_cau}</h3>
                  <Badge>{request.trang_thai}</Badge>
                </div>
                <dl className="detail-grid">
                  <dt>Nhân viên gửi</dt>
                  <dd>{request.ho_ten_nguoi_gui}</dd>
                  <dt>Nhân viên được đề nghị</dt>
                  <dd>{request.ho_ten_nguoi_nhan}</dd>
                  <dt>Ca làm cần thay đổi</dt>
                  <dd>{shiftText(request.ca_hien_tai)}</dd>
                  {request.ca_dong_nghiep && (
                    <>
                      <dt>Ca làm của đồng nghiệp</dt>
                      <dd>{shiftText(request.ca_dong_nghiep)}</dd>
                    </>
                  )}
                  <dt>Lý do</dt>
                  <dd>{request.ly_do}</dd>
                </dl>
                {canRespond(request) && (
                  <div className="ui-actions">
                    <Button
                      onClick={() => {
                        task.setError('');
                        setDecision({ request, accept: false });
                      }}
                    >
                      Từ chối
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        task.setError('');
                        setDecision({ request, accept: true });
                      }}
                    >
                      Đồng ý
                    </Button>
                  </div>
                )}
              </article>
            ))}
            {!requests.loading && !requests.data.length && (
              <p className="ui-empty">Không có yêu cầu đổi hoặc xoay ca.</p>
            )}
          </div>
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose}>Đóng</Button>
        </footer>
      </Modal>
      {decision && (
        <Confirm
          title={decision.accept ? 'Đồng ý yêu cầu' : 'Từ chối yêu cầu'}
          pending={task.pending}
          error={task.error}
          onClose={() => setDecision(null)}
          onConfirm={decide}
        >
          {decision.request.ho_ten_nguoi_gui} ·{' '}
          {shiftText(decision.request.ca_hien_tai)}
        </Confirm>
      )}
    </>
  );
}
