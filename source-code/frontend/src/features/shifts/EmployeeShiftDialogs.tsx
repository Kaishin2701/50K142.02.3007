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
  validTime,
} from '../../app/format';
import { api } from '../../services/api';
import type { Registration, Shift } from '../../services/models';
import {
  Button,
  Confirm,
  DateField,
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
    if (!form.date || form.date < today()) { task.setError('Vui lòng nhập đầy đủ thông tin bắt buộc'); return; }
    if (!validTime(form.start) || !validTime(form.end, true) || form.start >= form.end) {
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
      <form onSubmit={submit} noValidate>
        <div className="dialog-body">
          <div className="form-grid">
            <DateField
              label="Ngày"
              value={form.date}
              onChange={(value) => field('date', value)}
              required
            />
            <Field
              label="Giờ bắt đầu"
              type="text"
              inputMode="numeric"
              value={form.start}
              onChange={(event) => field('start', event.target.value)}
              required
            />
            <Field
              label="Giờ kết thúc"
              type="text"
              inputMode="numeric"
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
          {task.error && <p className="inline-form-error" role="alert">{task.error}</p>}
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
  assignedShifts = [],
  visibleRange,
  onClose,
}: {
  registration: Registration;
  assignedShifts?: Shift[];
  visibleRange?: { start: string; end: string };
  onClose(): void;
}) {
  const [canceling, setCanceling] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const changeableShifts = assignedShifts.filter(shift => shiftTime(shift) > Date.now());
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  return (
    <>
      <Modal
        title="Thông tin đăng ký"
        className="registration-detail-dialog"
        showClose={false}
        onClose={onClose}
        busy={task.pending}
      >
        <div className="dialog-body">
          <div className="form-grid">
            <Field label="Ngày" value={dateText(registration.ngay)} readOnly />
            <Field label="Giờ bắt đầu" value={visibleRange?.start ?? timeText(registration.gio_bat_dau)} readOnly />
            <Field label="Giờ kết thúc" value={visibleRange?.end ?? timeText(registration.gio_ket_thuc)} readOnly />
          </div>
          <div className="registration-status"><p>Trạng thái</p><p>{registration.loai_dang_ky}</p></div>
          <ErrorMessage message={task.error} />
        </div>
        <footer className="dialog-actions">
          <Button onClick={() => setCanceling(true)}>Hủy</Button>
          <Button variant="primary" disabled={!changeableShifts.length} onClick={() => setRequesting(true)}>
            Đổi hoặc xoay ca
          </Button>
        </footer>
      </Modal>
      {canceling && (
        <Confirm
          className="registration-cancel-dialog"
          title="Bạn có chắc chắn muốn hủy đăng ký này không?"
          cancelLabel="Không"
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
          {null}
        </Confirm>
      )}
      {requesting && changeableShifts.length > 0 && (
        <ShiftChangeForm
          shift={changeableShifts[0]}
          sourceShifts={changeableShifts}
          onClose={() => setRequesting(false)}
          onSaved={() => { setRequesting(false); onClose(); }}
        />
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
      <Modal title="Thông tin ca làm" className="employee-shift-dialog" onClose={onClose}>
        <div className="dialog-body">
          <div className="form-grid">
            <Field label="Ngày làm" value={dateText(shift.ngay_lam)} readOnly />
            <Field label="Giờ bắt đầu" value={timeText(shift.gio_bat_dau)} readOnly />
            <Field label="Giờ kết thúc" value={timeText(shift.gio_ket_thuc)} readOnly />
          </div>
          <div className="assigned-staff"><p>Nhân viên làm cùng ca</p><strong>
              {shift.nhan_vien
                .filter((person) => person.ma_nhan_vien !== user!.ma_nguoi_dung)
                .map((person) => person.ho_ten)
                .join(' · ') || '—'}
          </strong></div>
        </div>
        <footer className="dialog-actions">
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
  shift: initialShift,
  sourceShifts = [],
  onClose,
  onSaved,
}: {
  shift: Shift;
  sourceShifts?: Shift[];
  onClose(): void;
  onSaved(): void;
}) {
  const [sourceId, setSourceId] = useState(initialShift.ma_ca);
  const shift = sourceShifts.find(item => item.ma_ca === sourceId) ?? initialShift;
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
    <Modal title="Gửi yêu cầu đổi hoặc xoay ca" className="shift-change-dialog" onClose={onClose} busy={task.pending}>
      <form onSubmit={submit}>
        <div className="dialog-body">
          {sourceShifts.length > 1 ? (
            <SelectField label="Ca làm cần thay đổi" value={sourceId} onChange={event => { setSourceId(event.target.value); setForm(previous => ({ ...previous, otherShift: '' })); }}>
              {sourceShifts.map(item => <option key={item.ma_ca} value={item.ma_ca}>{shiftText(item)}</option>)}
            </SelectField>
          ) : <><p>Ca làm cần thay đổi</p><strong>{shiftText(shift)}</strong></>}
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
