import { useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import { dateText, shiftText, timeText } from '../../app/format';
import { api } from '../../services/api';
import type { ShiftRequest } from '../../services/models';
import './employee-request-response.css';
import {
  Badge,
  Button,
  Confirm,
  ErrorMessage,
  Loading,
  Modal,
  useNotice,
} from '../../components/ui';

function RequestShiftPanel({
  title,
  shift,
  people,
}: {
  title: string;
  shift?: ShiftRequest['ca_hien_tai'] | null;
  people: { label: string; name: string }[];
}) {
  return (
    <section className="manager-request-shift">
      <h3>{title}</h3>
      <dl className="manager-request-shift-grid">
        {shift && (
          <>
            <div className="manager-request-field">
              <dt>Ngày làm</dt>
              <dd>{dateText(shift.ngay_lam)}</dd>
            </div>
            <div className="manager-request-field">
              <dt>Giờ bắt đầu</dt>
              <dd>{timeText(shift.gio_bat_dau)}</dd>
            </div>
            <div className="manager-request-field">
              <dt>Giờ kết thúc</dt>
              <dd>{timeText(shift.gio_ket_thuc)}</dd>
            </div>
          </>
        )}
        {people.map((person) => (
          <div className="manager-request-field" key={person.label}>
            <dt>{person.label}</dt>
            <dd>{person.name}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ManagerRequestDetail({ request }: { request: ShiftRequest }) {
  const isExchange = request.loai_yeu_cau === 'Đổi ca hai chiều';
  return (
    <div className="dialog-body manager-request-body manager-request-detail">
      <div className="manager-request-overview">
        <div className="manager-request-field">
          <span>Nhân viên gửi yêu cầu</span>
          <strong>{request.ho_ten_nguoi_gui}</strong>
        </div>
        <div className="manager-request-field">
          <span>Loại yêu cầu</span>
          <strong>{request.loai_yeu_cau}</strong>
        </div>
        <div className="manager-request-field">
          <span>Trạng thái</span>
          <Badge>{request.trang_thai}</Badge>
        </div>
      </div>
      <RequestShiftPanel
        title="Ca làm cần thay đổi"
        shift={request.ca_hien_tai}
        people={[
          {
            label: 'Nhân viên gửi yêu cầu',
            name: request.ho_ten_nguoi_gui,
          },
        ]}
      />
      {isExchange ? (
        <RequestShiftPanel
          title="Ca làm của nhân viên được đề nghị đổi ca"
          shift={request.ca_dong_nghiep}
          people={[
            {
              label: 'Nhân viên được đề nghị',
              name: request.ho_ten_nguoi_nhan,
            },
          ]}
        />
      ) : (
        <RequestShiftPanel
          title="Nhờ nhân viên làm thay"
          people={[
            {
              label: 'Nhân viên gửi yêu cầu',
              name: request.ho_ten_nguoi_gui,
            },
            {
              label: 'Nhân viên được đề nghị làm thay',
              name: request.ho_ten_nguoi_nhan,
            },
          ]}
        />
      )}
      <section className="manager-request-reason">
        <h3>Lý do</h3>
        <p>{request.ly_do}</p>
      </section>
    </div>
  );
}

export function RequestsDialog({ onClose }: { onClose(): void }) {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const requests = useResource<ShiftRequest[]>('/shifts/requests', []);
  const [selectedRequest, setSelectedRequest] =
    useState<ShiftRequest | null>(null);
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
        request.nguoi_gui !== user!.ma_nguoi_dung &&
        request.ma_nhan_vien_duoc_de_nghi === user!.ma_nguoi_dung;
  const decide = async () => {
    if (!decision) return;
    const pendingDecision = decision;
    const succeeded = await task.run(async () => {
      const result = await api<{ trang_thai?: string }>(
        `/shifts/requests/${pendingDecision.request.ma_yeu_cau}/${manager ? 'decide' : 'respond'}`,
        { method: 'POST', body: { dong_y: pendingDecision.accept } },
      );
      if (manager) {
        const expectedStatus = pendingDecision.accept
          ? 'Đã chấp thuận'
          : 'Bị từ chối';
        if (result?.trang_thai !== expectedStatus) {
          throw new Error('Phản hồi xử lý yêu cầu không hợp lệ.');
        }
        setSelectedRequest({
          ...pendingDecision.request,
          trang_thai: result.trang_thai,
        });
        notice(
          result.trang_thai === 'Đã chấp thuận'
            ? 'Đã chấp thuận yêu cầu.'
            : 'Đã từ chối yêu cầu.',
        );
      } else {
        if (pendingDecision.accept) {
          notice('Đã đồng ý yêu cầu đổi hoặc xoay ca', 'shift-success');
        } else {
          notice('Đã từ chối yêu cầu đổi hoặc xoay ca', 'employee-request-reject-success');
        }
        onClose();
      }
      setDecision(null);
      refresh();
    });
    if (!succeeded && manager) setDecision(null);
  };
  const confirmation = decision && (
    <Confirm
      title={decision.accept ? 'Đồng ý yêu cầu' : 'Từ chối yêu cầu'}
      pending={task.pending}
      error={manager ? undefined : task.error}
      onClose={() => setDecision(null)}
      onConfirm={decide}
    >
      {decision.request.ho_ten_nguoi_gui} ·{' '}
      {shiftText(decision.request.ca_hien_tai)}
    </Confirm>
  );

  if (manager) {
    const pendingRequests = requests.data.filter(
      (request) => request.trang_thai === 'Chờ xử lý',
    );
    return (
      <>
        <Modal
          title="Xử lý yêu cầu đổi hoặc xoay ca"
          onClose={onClose}
          busy={task.pending}
          className="manager-requests-dialog"
        >
          {selectedRequest ? (
            <>
              <ManagerRequestDetail request={selectedRequest} />
              <ErrorMessage message={task.error || requests.error} />
              <footer className="dialog-actions manager-request-actions">
                {selectedRequest.trang_thai === 'Chờ xử lý' && (
                  <>
                    <Button
                      onClick={() => {
                        task.setError('');
                        setDecision({ request: selectedRequest, accept: false });
                      }}
                    >
                      Từ chối
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        task.setError('');
                        setDecision({ request: selectedRequest, accept: true });
                      }}
                    >
                      Đồng ý
                    </Button>
                  </>
                )}
              </footer>
            </>
          ) : (
            <div className="dialog-body manager-request-body manager-request-list">
              <h3>Chờ xử lý</h3>
              <Loading active={requests.loading} />
              <ErrorMessage message={requests.error} />
              {pendingRequests.length ? (
                <div className="manager-request-items">
                  {pendingRequests.map((request) => (
                    <article
                      className="manager-request-card"
                      key={request.ma_yeu_cau}
                    >
                      <button
                        type="button"
                        className="manager-request-open"
                        aria-label={`Chi tiết yêu cầu ${request.loai_yeu_cau} từ ${request.ho_ten_nguoi_gui}`}
                        onClick={() => {
                          task.setError('');
                          setSelectedRequest(request);
                        }}
                      >
                        <span className="manager-request-person">
                          <strong>{request.ho_ten_nguoi_gui}</strong>
                          <span>{request.loai_yeu_cau}</span>
                        </span>
                        <span className="manager-request-shift-text">
                          {shiftText(request.ca_hien_tai)}
                        </span>
                        <Badge>{request.trang_thai}</Badge>
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                !requests.loading &&
                !requests.error && (
                  <div className="manager-request-empty">
                    <p>Không có yêu cầu chờ xử lý.</p>
                  </div>
                )
              )}
            </div>
          )}
        </Modal>
        {confirmation}
      </>
    );
  }

  return (
    <>
      <Modal
        title={selectedRequest ? 'Yêu cầu đổi hoặc xoay ca' : 'Yêu cầu'}
        onClose={onClose}
        busy={task.pending}
        className={
          'employee-request-dialog' +
          (selectedRequest ? ' is-detail' : '')
        }
      >
        {selectedRequest ? (
          <>
            <div className="dialog-body employee-request-detail">
              <div className="employee-request-overview">
                <div className="employee-request-field">
                  <span>Nhân viên gửi yêu cầu</span>
                  <strong>{selectedRequest.ho_ten_nguoi_gui}</strong>
                </div>
                <div className="employee-request-field">
                  <span>Loại yêu cầu</span>
                  <strong>{selectedRequest.loai_yeu_cau}</strong>
                </div>
              </div>
              <div className="employee-request-field">
                <span>Ca làm cần thay đổi</span>
                <strong>{shiftText(selectedRequest.ca_hien_tai)}</strong>
              </div>
              {selectedRequest.loai_yeu_cau === 'Đổi ca hai chiều' &&
                selectedRequest.ca_dong_nghiep && (
                  <div className="employee-request-field">
                    <span>Ca làm của đồng nghiệp</span>
                    <strong>
                      {shiftText(selectedRequest.ca_dong_nghiep)}
                    </strong>
                  </div>
                )}
              {selectedRequest.loai_yeu_cau !== 'Đổi ca hai chiều' && (
                <strong className="employee-request-replacement">
                  Nhờ nhân viên khác làm thay
                </strong>
              )}
              <div className="employee-request-field employee-request-reason">
                <span>Lý do</span>
                <p>{selectedRequest.ly_do}</p>
              </div>
            </div>
            <ErrorMessage message={requests.error} />
            <footer className="dialog-actions employee-request-actions">
              {canRespond(selectedRequest) && (
                <>
                  <Button
                    onClick={() => {
                      task.setError('');
                      setDecision({ request: selectedRequest, accept: false });
                    }}
                  >
                    Từ chối
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      task.setError('');
                      setDecision({ request: selectedRequest, accept: true });
                    }}
                  >
                    Đồng ý
                  </Button>
                </>
              )}
            </footer>
          </>
        ) : (
          <div className="dialog-body employee-request-list">
            <Loading active={requests.loading} />
            <ErrorMessage message={requests.error} />
            <div className="employee-request-table">
              <div className="employee-request-labels" aria-hidden="true">
                <span>Nhân viên gửi</span>
                <span>Loại yêu cầu</span>
                <span>Ca làm liên quan</span>
              </div>
              {requests.data.map((request) => (
                <button
                  type="button"
                  className="employee-request-row"
                  key={request.ma_yeu_cau}
                  aria-label={`Chi tiết yêu cầu ${request.loai_yeu_cau} từ ${request.ho_ten_nguoi_gui}`}
                  onClick={() => {
                    task.setError('');
                    setSelectedRequest(request);
                  }}
                >
                  <strong>{request.ho_ten_nguoi_gui}</strong>
                  <span>{request.loai_yeu_cau}</span>
                  <span>{shiftText(request.ca_hien_tai)}</span>
                </button>
              ))}
              {!requests.loading && !requests.data.length && (
                <p className="ui-empty">Không có yêu cầu đổi hoặc xoay ca.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
      {confirmation}
    </>
  );
}
