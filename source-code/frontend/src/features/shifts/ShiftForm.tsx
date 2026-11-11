import { useState, type FormEvent } from 'react';
import { useDataStore, useTask } from '../../app/data';
import { dateKey, today } from '../../app/format';
import { api } from '../../services/api';
import type { Shift } from '../../services/models';
import {
  Button,
  Confirm,
  ErrorMessage,
  Field,
  Modal,
  SelectField,
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
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const field = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
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
      notice(shift ? 'Chỉnh sửa ca làm thành công.' : 'Tạo ca làm thành công.');
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.start >= form.end || Number(form.max) < Number(form.min)) {
      task.setError('Thời gian hoặc số lượng nhân viên không hợp lệ.');
      return;
    }
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
        <form onSubmit={submit}>
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
              <Field
                label="Ngày làm"
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
              <Field
                label="Số lượng nhân viên tối thiểu"
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
                  <SelectField
                    label="Kết thúc lặp"
                    value={form.endType}
                    onChange={(event) => field('endType', event.target.value)}
                  >
                    <option value="date">Theo ngày</option>
                    <option value="weeks">Theo số tuần</option>
                  </SelectField>
                  {form.endType === 'date' ? (
                    <Field
                      label="Ngày kết thúc"
                      type="date"
                      min={form.date}
                      value={form.endDate}
                      onChange={(event) => field('endDate', event.target.value)}
                      required
                    />
                  ) : (
                    <Field
                      label="Số tuần"
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
