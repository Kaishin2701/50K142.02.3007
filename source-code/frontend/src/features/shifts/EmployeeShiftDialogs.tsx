import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  addDays,
  dateText,
  errorText,
  shiftText,
  shiftTime,
  timeText,
  today,
  weekStart,
} from '../../app/format';
import { api } from '../../services/api';
import type { Registration, Shift } from '../../services/models';
import {
  Button,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  SelectField,
  TextField,
  useNotice,
} from '../../components/ui';
import './availability-form.css';
import './employee-shift-details.css';
import './registration-details.css';
import './shift-change-form.css';

export function AvailabilityForm({
  date,
  onClose,
}: {
  date: string;
  onClose(): void;
}) {
  const [form, setForm] = useState({
    date,
    start: '07:00',
    end: '12:00',
    status: 'Mong muốn',
  });
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const field = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !form.date ||
      !form.start ||
      !form.end ||
      (form.status !== 'Rảnh' && form.status !== 'Mong muốn')
    ) {
      task.setError('Vui lòng nhập đầy đủ thời gian và trạng thái đăng ký');
      return;
    }
    if (form.date < today()) {
      task.setError('Không thể đăng ký ngày trong quá khứ');
      return;
    }
    if (form.start >= form.end) {
      task.setError('Giờ bắt đầu phải trước giờ kết thúc');
      return;
    }
    void task.run(async () => {
      await api('/shifts/availability', {
        method: 'POST',
        body: {
          ngay: form.date,
          gio_bat_dau: form.start,
          gio_ket_thuc: form.end,
          loai_dang_ky: form.status,
        },
      });
      refresh();
      onClose();
      notice('Đăng ký thành công', 'employee-shift-success');
    });
  };
  return (
    <Modal
      title="Đăng ký lịch rảnh hoặc ca muốn làm"
      onClose={onClose}
      busy={task.pending}
      className="availability-form-modal"
    >
      <form className="availability-form" noValidate onSubmit={submit}>
        <div className="dialog-body availability-form-body">
          <div className="form-grid availability-form-grid">
            <div className="availability-form-date">
              <Field
                label="Ngày"
                type="date"
                min={today()}
                value={form.date}
                onChange={(event) => field('date', event.target.value)}
              />
            </div>
            <Field
              label="Giờ bắt đầu"
              type="time"
              value={form.start}
              onChange={(event) => field('start', event.target.value)}
            />
            <Field
              label="Giờ kết thúc"
              type="time"
              value={form.end}
              onChange={(event) => field('end', event.target.value)}
            />
            <fieldset className="availability-form-status">
              <legend>Trạng thái</legend>
              <div className="availability-form-options">
                {(['Rảnh', 'Mong muốn'] as const).map((status) => (
                  <label key={status}>
                    <input
                      type="radio"
                      name="availability-status"
                      value={status}
                      checked={form.status === status}
                      onChange={() => field('status', status)}
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <ErrorMessage message={task.error} />
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose} disabled={task.pending}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={task.pending}>
            Gửi đăng ký
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
export function RegistrationDetails({
  registration,
  onClose,
  onError,
}: {
  registration: Registration;
  onClose(): void;
  onError?(message: string): void;
}) {
  const [canceling, setCanceling] = useState(false);
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const cancel = async () => {
    let message = '';
    const succeeded = await task.run(async () => {
      try {
        await api(`/shifts/availability/${registration.ma_dang_ky}`, {
          method: 'DELETE',
        });
      } catch (error) {
        message = errorText(error);
        throw error;
      }
      refresh();
      setCanceling(false);
      onClose();
      notice('Hủy đăng ký thành công', 'employee-shift-success');
    });
    if (!succeeded && onError) {
      setCanceling(false);
      onClose();
      onError(message);
    }
  };
  return (
    <>
      <Modal
        title="Thông tin đăng ký"
        onClose={onClose}
        busy={task.pending}
        className="registration-details-modal"
      >
        <div className="dialog-body registration-details-body">
          <dl className="registration-details-list">
            <div className="registration-details-date">
              <dt>Ngày</dt>
              <dd>{dateText(registration.ngay)}</dd>
            </div>
            <div>
              <dt>Giờ bắt đầu</dt>
              <dd>{timeText(registration.gio_bat_dau)}</dd>
            </div>
            <div>
              <dt>Giờ kết thúc</dt>
              <dd>{timeText(registration.gio_ket_thuc)}</dd>
            </div>
            <div className="registration-details-status">
              <dt>Trạng thái</dt>
              <dd>{registration.loai_dang_ky}</dd>
            </div>
          </dl>
        </div>
        <footer className="dialog-actions">
          <Button
            onClick={() => setCanceling(true)}
            disabled={task.pending}
          >
            Hủy
          </Button>
        </footer>
      </Modal>
      {canceling && (
        <Modal
          title="Bạn có chắc chắn muốn hủy đăng ký này không?"
          className="registration-cancel-confirm"
          onClose={() => setCanceling(false)}
          busy={task.pending}
        >
          <div className="dialog-body">
            <ErrorMessage message={task.error} />
          </div>
          <footer className="dialog-actions">
            <Button onClick={() => setCanceling(false)} disabled={task.pending}>
              Không
            </Button>
            <Button
              variant="primary"
              onClick={() => void cancel()}
              disabled={task.pending}
            >
              Xác nhận
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
export function EmployeeShiftDetails({
  shift,
  onClose,
}: {
  shift: Shift;
  onClose(): void;
}) {
  const { user } = useSession();
  const [requesting, setRequesting] = useState(false);
  return (
    <>
      <Modal
        title="Thông tin ca làm"
        onClose={onClose}
        className="employee-shift-details-modal"
      >
        <div className="dialog-body employee-shift-details-body">
          <dl className="employee-shift-details-grid">
            <div className="employee-shift-details-field is-date">
              <dt>Ngày làm</dt>
              <dd>{dateText(shift.ngay_lam)}</dd>
            </div>
            <div className="employee-shift-details-field">
              <dt>Giờ bắt đầu</dt>
              <dd>{timeText(shift.gio_bat_dau)}</dd>
            </div>
            <div className="employee-shift-details-field">
              <dt>Giờ kết thúc</dt>
              <dd>{timeText(shift.gio_ket_thuc)}</dd>
            </div>
          </dl>
          <section className="employee-shift-details-coworkers">
            <h3>Nhân viên làm cùng ca</h3>
            <p>
              {shift.nhan_vien
                .filter(
                  (person) =>
                    user && person.ma_nhan_vien !== user.ma_nguoi_dung,
                )
                .map((person) => person.ho_ten)
                .join(' · ') || '—'}
            </p>
          </section>
        </div>
        <footer className="dialog-actions employee-shift-details-actions">
          <Button onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            disabled={shiftTime(shift) <= Date.now()}
            onClick={() => setRequesting(true)}
          >
            Đổi hoặc xoay ca
          </Button>
        </footer>
      </Modal>
      {requesting && (
        <ShiftChangeForm
          shift={shift}
          onClose={() => setRequesting(false)}
        />
      )}
    </>
  );
}
type Coworker = { ma_nguoi_dung: string; ho_ten: string; shifts: Shift[] };
function ShiftChangeForm({
  shift,
  onClose,
}: {
  shift: Shift;
  onClose(): void;
}) {
  const from = weekStart();
  const colleagues = useResource<Coworker[]>(
    `/shifts/co-workers?from=${from}&to=${addDays(from, 27)}`,
    [],
  );
  const [form, setForm] = useState({
    type: 'Đổi ca hai chiều',
    colleague: '',
    otherShift: '',
    reason: '',
  });
  const task = useTask();
  const { refresh } = useDataStore();
  const [sent, setSent] = useState(false);
  const partner = colleagues.data.find(
    (person) => person.ma_nguoi_dung === form.colleague,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sent || task.pending) return;
    if (
      !form.colleague ||
      !form.reason.trim() ||
      (form.type === 'Đổi ca hai chiều' && !form.otherShift)
    ) {
      task.setError('Vui lòng nhập đầy đủ thông tin yêu cầu');
      return;
    }
    void task.run(async () => {
      await api('/shifts/requests', {
        method: 'POST',
        body: {
          ma_ca: shift.ma_ca,
          loai_yeu_cau: form.type,
          ma_nhan_vien_duoc_de_nghi: form.colleague,
          ...(form.type === 'Đổi ca hai chiều'
            ? { ma_ca_cua_dong_nghiep: form.otherShift }
            : {}),
          ly_do: form.reason.trim(),
        },
      });
      refresh();
      setSent(true);
    });
  };
  return (
    <Modal
      title="Gửi yêu cầu đổi hoặc xoay ca"
      onClose={onClose}
      busy={task.pending}
      className="shift-change-form-modal"
    >
      <form className="shift-change-form" noValidate onSubmit={submit}>
        <div className="dialog-body shift-change-form-body">
          <Field
            className="shift-change-source"
            label="Ca làm cần thay đổi"
            value={shiftText(shift)}
            readOnly
          />
          <fieldset className="shift-change-types">
            <legend>Loại yêu cầu</legend>
            <div className="shift-change-type-options">
              {(
                [
                  'Đổi ca hai chiều',
                  'Nhờ nhân viên khác làm thay',
                ] as const
              ).map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    name="shift-change-type"
                    value={type}
                    checked={form.type === type}
                    onChange={() =>
                      setForm((previous) => ({
                        ...previous,
                        type,
                        otherShift: '',
                      }))
                    }
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="shift-change-fields">
            <SelectField
              label="Đồng nghiệp"
              value={form.colleague}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  colleague: event.target.value,
                  otherShift: '',
                }))
              }
            >
              <option value="">Chọn đồng nghiệp</option>
              {colleagues.data.map((person) => (
                <option key={person.ma_nguoi_dung} value={person.ma_nguoi_dung}>
                  {person.ho_ten}
                </option>
              ))}
            </SelectField>
            {form.type === 'Đổi ca hai chiều' && (
              <SelectField
                label="Ca làm của đồng nghiệp"
                value={form.otherShift}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    otherShift: event.target.value,
                  }))
                }
              >
                <option value="">Chọn ca làm</option>
                {partner?.shifts
                  .filter((other) => other.ma_ca !== shift.ma_ca)
                  .map((other) => (
                    <option key={other.ma_ca} value={other.ma_ca}>
                      {shiftText(other)}
                    </option>
                  ))}
              </SelectField>
            )}
          </div>
          <TextField
            label="Lý do"
            value={form.reason}
            onChange={(reason) =>
              setForm((previous) => ({ ...previous, reason }))
            }
          />
          <Loading active={colleagues.loading} />
          <ErrorMessage message={task.error || colleagues.error} />
        </div>
        <footer className="dialog-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={sent || task.pending || colleagues.loading}
          >
            Gửi yêu cầu
          </Button>
        </footer>
      </form>
      {sent && (
        <p className="ui-notice ui-notice-employee-request-success" role="status">
          Gửi yêu cầu thành công.
        </p>
      )}
    </Modal>
  );
}
