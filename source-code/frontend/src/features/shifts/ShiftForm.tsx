import { useState, type FormEvent } from 'react';
import { useDataStore, useTask } from '../../app/data';
import { dateKey, today, validTime } from '../../app/format';
import { api } from '../../services/api';
import type { Shift } from '../../services/models';
import {
  Button,
  DateField,
  Confirm,
  ErrorMessage,
  Field,
  Modal,
  useNotice,
} from '../../components/ui';

export function ShiftForm({
  shift,
  date,
  onClose,
}: {
  shift?: Shift;
  date?: string;
  onClose(): void;
}) {
  const [form, setForm] = useState({
    date: shift ? dateKey(shift.ngay_lam) : (date ?? today()),
    start: shift?.gio_bat_dau.slice(0, 5) ?? '07:00',
    end: shift?.gio_ket_thuc.slice(0, 5) ?? '12:00',
    min: String(shift?.so_nhan_vien_toi_thieu ?? 1),
    max: String(shift?.so_nhan_vien_toi_da ?? 3),
    recurrence: 'once',
    endType: 'date',
    endDate: date ?? today(),
    weeks: '2',
  });
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const field = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors({}); task.setError('');
  };
  const save = () =>
    void task.run(async () => {
      const body = {
        ngay_lam: form.date,
        gio_bat_dau: form.start,
        gio_ket_thuc: form.end,
        so_nhan_vien_toi_thieu: Number(form.min),
        so_nhan_vien_toi_da: Number(form.max),
        ...(!shift && form.recurrence === 'weekly'
          ? {
              lap:
                form.endType === 'weeks'
                  ? { so_tuan: Number(form.weeks) }
                  : { ngay_ket_thuc: form.endDate },
            }
          : {}),
      };
      await api('/shifts' + (shift ? '/' + shift.ma_ca : ''), {
        method: shift ? 'PATCH' : 'POST',
        body,
      });
      refresh();
      onClose();
      notice(shift ? 'Chỉnh sửa ca làm thành công' : 'Tạo ca làm thành công');
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.date || form.date < today()) next.date = 'Ngày làm không hợp lệ.';
    if (!validTime(form.start) || !validTime(form.end) || form.start >= form.end) next.time = 'Giờ bắt đầu phải trước giờ kết thúc';
    if (![form.min, form.max].every(value => value.trim() && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100)) next.staff = 'Số lượng nhân viên tối thiểu và tối đa phải là số nguyên từ 1 trở lên';
    else if (Number(form.max) < Number(form.min)) next.staff = 'Số lượng nhân viên tối đa phải lớn hơn hoặc bằng số lượng nhân viên tối thiểu';
    else if (shift && Number(form.max) < shift.nhan_vien.length) next.staff = 'Số lượng tối đa không được nhỏ hơn số nhân viên đã phân công';
    if (!shift && form.recurrence === 'weekly') {
      if (form.endType === 'date' && (!form.endDate || form.endDate < form.date)) next.recurrence = 'Ngày kết thúc phải từ ngày làm trở đi.';
      if (form.endType === 'weeks' && (!/^\d+$/.test(form.weeks) || Number(form.weeks) < 1 || Number(form.weeks) > 52)) next.recurrence = 'Số tuần lặp phải từ 1 đến 52.';
    }
    setErrors(next); task.setError('');
    if (Object.keys(next).length) return;
    if (shift) setConfirming(true);
    else save();
  };
  return (
    <>
      <Modal
        title={shift ? 'Chỉnh sửa ca làm' : 'Tạo ca làm'}
        onClose={onClose}
        busy={task.pending}
        className="shift-form-dialog"
      >
        <form onSubmit={submit} noValidate>
          <div className="dialog-body">
            {!shift && (
              <fieldset className="radio-field">
                <legend>Loại ca</legend>
                <div className="radio-options">
                  {[
                    ['once', 'Ca diễn ra một lần'],
                    ['weekly', 'Ca lặp lại hằng tuần'],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="recurrence"
                        checked={form.recurrence === value}
                        onChange={() => field('recurrence', value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="form-grid">
              <DateField
                label="Ngày làm"
                error={errors.date}
                value={form.date}
                onChange={(value) => field('date', value)}
                required
              />
              <Field
                label="Giờ bắt đầu"
                type="text"
                inputMode="numeric"
                aria-invalid={Boolean(errors.time)}
                value={form.start}
                onChange={(event) => field('start', event.target.value)}
                required
              />
              <Field
                label="Giờ kết thúc"
                type="text"
                inputMode="numeric"
                error={errors.time}
                value={form.end}
                onChange={(event) => field('end', event.target.value)}
                required
              />
              <Field
                label="Số lượng nhân viên tối thiểu"
                aria-invalid={Boolean(errors.staff)}
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.min}
                onChange={(event) => field('min', event.target.value)}
                required
              />
              <Field
                label="Số lượng nhân viên tối đa"
                error={errors.staff}
                type="number"
                min={1}
                max={100}
                step={1}
                value={form.max}
                onChange={(event) => field('max', event.target.value)}
                required
              />
              {!shift && form.recurrence === 'weekly' && (
                <>
                  <fieldset className="radio-field recurrence-end"><legend>Cách kết thúc</legend><div className="radio-options">
                    {['date', 'weeks'].map(value => <label key={value}><input type="radio" name="recurrence-end" checked={form.endType === value} onChange={() => field('endType', value)} />{value === 'date' ? 'Theo ngày' : 'Theo số tuần'}</label>)}
                  </div></fieldset>
                  {form.endType === 'date' ? (
                    <DateField
                      label="Ngày kết thúc"
                      error={errors.recurrence}
                      value={form.endDate}
                      onChange={(value) => field('endDate', value)}
                      required
                    />
                  ) : (
                    <Field
                      label="Số tuần lặp"
                      error={errors.recurrence}
                      type="number"
                      min={1}
                      max={52}
                      step={1}
                      value={form.weeks}
                      onChange={(event) => field('weeks', event.target.value)}
                      required
                    />
                  )}
                </>
              )}
            </div>
            {shift && <div className="assigned-staff"><p>Nhân viên được phân công</p><strong>{shift.nhan_vien.map(person => person.ho_ten).join(' · ') || '—'}</strong></div>}
          </div>
          <div className="dialog-error">
            <ErrorMessage message={task.error} />
          </div>
          <footer className="dialog-actions">
            <Button variant="primary" type="submit" disabled={task.pending}>
              Lưu
            </Button>
          </footer>
        </form>
      </Modal>
      {confirming && (
        <Confirm
          title="Chỉnh sửa ca làm"
          onClose={() => setConfirming(false)}
          onConfirm={save}
          pending={task.pending}
          error={task.error}
        >
          Xác nhận thay đổi
        </Confirm>
      )}
    </>
  );
}
