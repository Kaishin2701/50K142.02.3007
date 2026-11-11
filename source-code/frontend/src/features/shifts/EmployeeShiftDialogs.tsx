import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  addDays,
  dateText,
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
  Confirm,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  SelectField,
  TextField,
  useNotice,
} from '../../components/ui';

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
    if (form.start >= form.end) {
      task.setError('Giờ kết thúc phải sau giờ bắt đầu.');
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
      notice('Gửi đăng ký thành công.');
    });
  };
  return (
    <Modal
      title="Đăng ký lịch rảnh hoặc ca muốn làm"
      onClose={onClose}
      busy={task.pending}
      className="availability-dialog"
    >
      <form onSubmit={submit}>
        <div className="dialog-body">
          <div className="form-grid">
            <Field
              label="Ngày"
              type="date"
              min={today()}
              value={form.date}
              onChange={(event) => field('date', event.target.value)}
              required
            />
            <Field
              label="Giờ bắt đầu"
              type="time"
              value={form.start}
              onChange={(event) => field('start', event.target.value)}
              required
            />
            <Field
              label="Giờ kết thúc"
              type="time"
              value={form.end}
              onChange={(event) => field('end', event.target.value)}
              required
            />
            <fieldset className="radio-field">
              <legend>Trạng thái</legend>
              <div className="radio-options">
                {['Rảnh', 'Mong muốn'].map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="availability-type"
                      checked={form.status === value}
                      onChange={() => field('status', value)}
                    />
                    {value}
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
}: {
  registration: Registration;
  onClose(): void;
}) {
  const [canceling, setCanceling] = useState(false);
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  return (
    <>
      <Modal
        title="Chi tiết đăng ký lịch làm việc"
        onClose={onClose}
        busy={task.pending}
      >
        <div className="dialog-body">
          <dl className="detail-grid">
            <dt>Ngày</dt>
            <dd>{dateText(registration.ngay)}</dd>
            <dt>Giờ bắt đầu</dt>
            <dd>{timeText(registration.gio_bat_dau)}</dd>
            <dt>Giờ kết thúc</dt>
            <dd>{timeText(registration.gio_ket_thuc)}</dd>
            <dt>Trạng thái</dt>
            <dd>{registration.loai_dang_ky}</dd>
          </dl>
          <ErrorMessage message={task.error} />
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose}>Đóng</Button>
          <Button variant="danger" onClick={() => setCanceling(true)}>
            Hủy đăng ký
          </Button>
        </footer>
      </Modal>
      {canceling && (
        <Confirm
          title="Hủy đăng ký lịch làm việc"
          pending={task.pending}
          error={task.error}
          onClose={() => setCanceling(false)}
          onConfirm={() =>
            void task.run(async () => {
              await api('/shifts/availability/' + registration.ma_dang_ky, {
                method: 'DELETE',
              });
              setCanceling(false);
              onClose();
              refresh();
              notice('Hủy đăng ký thành công.');
            })
          }
        >
          Bạn có chắc chắn muốn hủy đăng ký này không?
        </Confirm>
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
      <Modal title="Chi tiết ca làm" onClose={onClose}>
        <div className="dialog-body">
          <dl className="detail-grid">
            <dt>Ngày làm</dt>
            <dd>{dateText(shift.ngay_lam)}</dd>
            <dt>Giờ bắt đầu</dt>
            <dd>{timeText(shift.gio_bat_dau)}</dd>
            <dt>Giờ kết thúc</dt>
            <dd>{timeText(shift.gio_ket_thuc)}</dd>
            <dt>Nhân viên làm cùng ca</dt>
            <dd>
              {shift.nhan_vien
                .filter((person) => person.ma_nhan_vien !== user!.ma_nguoi_dung)
                .map((person) => person.ho_ten)
                .join(' · ') || '—'}
            </dd>
          </dl>
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose}>Đóng</Button>
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
          onSaved={() => {
            setRequesting(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
type Coworker = { ma_nguoi_dung: string; ho_ten: string; shifts: Shift[] };
function ShiftChangeForm({
  shift,
  onClose,
  onSaved,
}: {
  shift: Shift;
  onClose(): void;
  onSaved(): void;
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
  const notice = useNotice();
  const partner = colleagues.data.find(
    (person) => person.ma_nguoi_dung === form.colleague,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
      onSaved();
      notice('Gửi yêu cầu thành công.');
    });
  };
  return (
    <Modal title="Đổi hoặc xoay ca" onClose={onClose} busy={task.pending}>
      <form onSubmit={submit}>
        <div className="dialog-body">
          <p>Ca làm cần thay đổi</p>
          <strong>{shiftText(shift)}</strong>
          <Loading active={colleagues.loading} />
          <ErrorMessage message={colleagues.error || task.error} />
          <SelectField
            label="Loại yêu cầu"
            value={form.type}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                type: event.target.value,
                otherShift: '',
              }))
            }
          >
            <option>Đổi ca hai chiều</option>
            <option>Nhờ nhân viên khác làm thay</option>
          </SelectField>
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
            required
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
              required
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
          <TextField
            label="Lý do"
            value={form.reason}
            onChange={(reason) =>
              setForm((previous) => ({ ...previous, reason }))
            }
            required
          />
        </div>
        <footer className="dialog-actions">
          <Button onClick={onClose} disabled={task.pending}>
            Hủy
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={task.pending || colleagues.loading}
          >
            Gửi yêu cầu
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
