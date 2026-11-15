import { useId, useState, type FormEvent } from 'react';
import { useDataStore, useTask } from '../../app/data';
import { addDays, dateKey, shiftTime, today } from '../../app/format';
import { ApiError, api } from '../../services/api';
import type { Shift } from '../../services/models';
import {
  Button,
  ErrorMessage,
  Field,
  Modal,
  useNotice,
} from '../../components/ui';

type CreateField =
  | 'date'
  | 'start'
  | 'end'
  | 'min'
  | 'max'
  | 'endDate'
  | 'weeks';
type CreateErrors = Partial<Record<CreateField, string>>;
type EditField = 'date' | 'start' | 'end' | 'min' | 'max';
type EditErrors = Partial<Record<EditField, string>>;
const startedShiftMessage = 'Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.';

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function displayDate(value: string) {
  return isValidDate(value) ? value.split('-').reverse().join('/') : '';
}

function parseDisplayDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const parsed = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidDate(parsed) ? parsed : '';
}

function isValidTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function duplicateDates(error: ApiError) {
  const messages = [
    error.message,
    ...(error.details ?? []).flatMap((detail) => [
      detail.field,
      detail.message,
    ]),
  ];
  const dates = messages.flatMap(
    (message) => message.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [],
  );
  return [...new Set(dates)]
    .filter(isValidDate)
    .map((date) => date.split('-').reverse().join('/'));
}

export function ShiftForm({
  shift,
  date,
  onClose,
}: {
  shift?: Shift;
  date?: string;
  onClose(): void;
}) {
  const initialDate = shift ? dateKey(shift.ngay_lam) : (date ?? today());
  const [form, setForm] = useState(() => {
    return {
      date: initialDate,
      start: shift?.gio_bat_dau.slice(0, 5) ?? '07:00',
      end: shift?.gio_ket_thuc.slice(0, 5) ?? '12:00',
      min: String(shift?.so_nhan_vien_toi_thieu ?? 1),
      max: String(shift?.so_nhan_vien_toi_da ?? 3),
      recurrence: 'once',
      endType: 'date',
      endDate: addDays(initialDate, 28),
      weeks: '4',
    };
  });
  const [dateText, setDateText] = useState(() => displayDate(initialDate));
  const [endDateText, setEndDateText] = useState(() =>
    displayDate(addDays(initialDate, 28)),
  );
  const [confirming, setConfirming] = useState(false);
  const [createErrors, setCreateErrors] = useState<CreateErrors>({});
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [editServerError, setEditServerError] = useState('');
  const [duplicateDays, setDuplicateDays] = useState<string[]>([]);
  const formId = useId();
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const clearCreateFeedback = () => {
    setCreateErrors({});
    setDuplicateDays([]);
    task.setError('');
  };
  const field = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (shift) {
      setEditErrors({});
      setEditServerError('');
      task.setError('');
    } else {
      clearCreateFeedback();
    }
  };
  const editDate = (value: string) => {
    setDateText(value);
    setForm((previous) => ({ ...previous, date: parseDisplayDate(value) }));
    setEditErrors((previous) => ({ ...previous, date: undefined }));
    setEditServerError('');
    task.setError('');
  };
  const createDate = (value: string) => {
    const parsedDate = parseDisplayDate(value);
    let endDate = form.endDate;
    if (parsedDate && endDate && endDate < parsedDate) {
      endDate = addDays(parsedDate, 28);
      setEndDateText(displayDate(endDate));
    }
    setDateText(value);
    setForm((previous) => ({
      ...previous,
      date: parsedDate,
      endDate,
    }));
    clearCreateFeedback();
  };
  const createEndDate = (value: string) => {
    setEndDateText(value);
    setForm((previous) => ({
      ...previous,
      endDate: parseDisplayDate(value),
    }));
    clearCreateFeedback();
  };
  const body = () => ({
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
  });
  const create = () =>
    void task.run(async () => {
      try {
        await api('/shifts', { method: 'POST', body: body() });
        refresh();
        onClose();
        notice('Tạo ca làm thành công.', 'shift-create-success');
      } catch (error) {
        if (error instanceof ApiError && error.code === 'SHIFT_OVERLAP') {
          const dates = duplicateDates(error);
          if (dates.length) {
            setDuplicateDays(dates);
            return;
          }
        }
        throw error;
      }
    });
  const validateCreate = (): CreateErrors => {
    const errors: CreateErrors = {};
    if (!isValidDate(form.date) || form.date < today()) {
      errors.date = 'Ngày làm phải là ngày hợp lệ và không trước hôm nay.';
    }
    if (
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.start) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.end) ||
      form.start >= form.end
    ) {
      const message = 'Ca làm phải bắt đầu và kết thúc trong cùng một ngày.';
      errors.start = message;
      errors.end = message;
    }
    const validCount = (value: string) =>
      /^\d+$/.test(value) &&
      Number.isInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= 100;
    if (!validCount(form.min) || !validCount(form.max)) {
      const message = 'Số lượng nhân viên phải là số nguyên từ 1 đến 100.';
      errors.min = message;
      errors.max = message;
    } else if (Number(form.max) < Number(form.min)) {
      const message =
        'Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.';
      errors.min = message;
      errors.max = message;
    }
    if (form.recurrence === 'weekly' && form.endType === 'date') {
      if (!isValidDate(form.endDate) || form.endDate < form.date) {
        errors.endDate =
          'Ngày kết thúc phải hợp lệ và không trước ngày làm.';
      }
    }
    if (form.recurrence === 'weekly' && form.endType === 'weeks') {
      const weeks = Number(form.weeks);
      if (
        !/^\d+$/.test(form.weeks) ||
        !Number.isInteger(weeks) ||
        weeks < 1 ||
        weeks > 52
      ) {
        errors.weeks = 'Số tuần lặp phải là số nguyên từ 1 đến 52.';
      }
    }
    return errors;
  };
  const validateEdit = (): EditErrors => {
    const errors: EditErrors = {};
    if (!isValidDate(form.date) || form.date < today()) {
      errors.date = 'Ngày làm phải là ngày hợp lệ và không trước hôm nay.';
    }
    if (!isValidTime(form.start) || !isValidTime(form.end) || form.start >= form.end) {
      const message = 'Ca làm phải bắt đầu và kết thúc trong cùng một ngày.';
      errors.start = message;
      errors.end = message;
    }
    const validCount = (value: string) =>
      /^\d+$/.test(value) &&
      Number.isInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= 100;
    if (!validCount(form.min) || !validCount(form.max)) {
      const message = 'Số lượng nhân viên phải là số nguyên từ 1 đến 100.';
      errors.min = message;
      errors.max = message;
    } else if (Number(form.max) < Number(form.min)) {
      const message =
        'Số lượng tối đa phải lớn hơn hoặc bằng số lượng tối thiểu.';
      errors.min = message;
      errors.max = message;
    } else if (shift && Number(form.max) < shift.nhan_vien.length) {
      errors.max =
        'Số lượng tối đa không được nhỏ hơn số nhân viên đang được phân công.';
    }
    return errors;
  };
  const closeStartedShift = () => {
    refresh();
    onClose();
    notice(startedShiftMessage, 'error');
  };
  const saveEdit = () => {
    if (!shift) return;
    if (shiftTime(shift) <= Date.now()) {
      closeStartedShift();
      return;
    }
    setConfirming(false);
    void task.run(async () => {
      try {
        await api(`/shifts/${shift.ma_ca}`, {
          method: 'PATCH',
          body: body(),
        });
        refresh();
        onClose();
        notice('Chỉnh sửa ca làm thành công.', 'shift-edit-success');
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.message === startedShiftMessage) {
            closeStartedShift();
          } else if (error.message.startsWith('Số nhân viên tối đa nhỏ hơn')) {
            setEditErrors({ max: error.message });
          } else {
            setEditServerError(error.message);
          }
          return;
        }
        throw error;
      }
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (shift) {
      if (shiftTime(shift) <= Date.now()) {
        closeStartedShift();
        return;
      }
      const errors = validateEdit();
      setEditErrors(errors);
      setEditServerError('');
      task.setError('');
      if (Object.keys(errors).length) return;
      if (
        new Date(`${form.date}T${form.start}:00+07:00`).getTime() <= Date.now()
      ) {
        setEditServerError(
          'Không thể chỉnh sửa ca đã bắt đầu hoặc đã kết thúc.',
        );
        return;
      }
      setConfirming(true);
      return;
    }
    const errors = validateCreate();
    setCreateErrors(errors);
    if (Object.keys(errors).length) return;
    setDuplicateDays([]);
    task.setError('');
    create();
  };
  const errorId = (name: CreateField) => `${formId}-${name}-error`;
  const inlineError = (
    name: CreateField,
    message: string,
    className = '',
  ) => (
    <p
      className={`shift-create-inline-error${className ? ` ${className}` : ''}`}
      id={errorId(name)}
      role="alert"
    >
      {message}
    </p>
  );
  const editInlineError = (name: EditField, message: string) => (
    <p
      className="shift-edit-inline-error"
      id={`${formId}-${name}-error`}
      role="alert"
    >
      {message}
    </p>
  );
  const sharedCountError =
    editErrors.min && editErrors.min === editErrors.max
      ? editErrors.min
      : '';
  const sharedTimeError =
    editErrors.start && editErrors.start === editErrors.end
      ? editErrors.start
      : '';

  return (
    <>
      <Modal
        title={shift ? 'Chỉnh sửa ca làm' : 'Tạo ca làm'}
        onClose={onClose}
        busy={task.pending}
        className={
          shift
            ? 'shift-edit-modal'
            : `shift-create-modal${form.recurrence === 'weekly' ? ' is-recurring' : ''}`
        }
      >
        <form
          className={shift ? 'shift-edit-form' : 'shift-create-form'}
          onSubmit={submit}
          noValidate
        >
        <div className={shift ? 'dialog-body shift-edit-body' : 'dialog-body shift-create-body'}>
          {shift ? (
            <div className="shift-edit-grid">
              <div className="shift-edit-field-wide">
                <Field
                  label="Ngày làm"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  placeholder="dd/mm/yyyy"
                  value={dateText}
                  aria-invalid={Boolean(editErrors.date)}
                  aria-describedby={
                    editErrors.date ? `${formId}-date-error` : undefined
                  }
                  onChange={(event) => editDate(event.target.value)}
                />
                {editErrors.date && editInlineError('date', editErrors.date)}
              </div>
              <div>
                <Field
                  label="Giờ bắt đầu"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="HH:MM"
                  value={form.start}
                  aria-invalid={Boolean(editErrors.start)}
                  aria-describedby={
                    sharedTimeError
                      ? `${formId}-time-error`
                      : editErrors.start
                        ? `${formId}-start-error`
                        : undefined
                  }
                  onChange={(event) => field('start', event.target.value)}
                />
                {editErrors.start && !sharedTimeError &&
                  editInlineError('start', editErrors.start)}
              </div>
              <div>
                <Field
                  label="Giờ kết thúc"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="HH:MM"
                  value={form.end}
                  aria-invalid={Boolean(editErrors.end)}
                  aria-describedby={
                    sharedTimeError
                      ? `${formId}-time-error`
                      : editErrors.end
                        ? `${formId}-end-error`
                        : undefined
                  }
                  onChange={(event) => field('end', event.target.value)}
                />
                {editErrors.end && !sharedTimeError &&
                  editInlineError('end', editErrors.end)}
              </div>
              {sharedTimeError && (
                <p
                  className="shift-edit-inline-error shift-edit-field-wide"
                  id={`${formId}-time-error`}
                  role="alert"
                >
                  {sharedTimeError}
                </p>
              )}
              <div>
                <Field
                  label="Số lượng nhân viên tối thiểu"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.min}
                  aria-invalid={Boolean(editErrors.min)}
                  aria-describedby={
                    sharedCountError
                      ? `${formId}-count-error`
                      : editErrors.min
                        ? `${formId}-min-error`
                        : undefined
                  }
                  onChange={(event) => field('min', event.target.value)}
                />
                {editErrors.min && !sharedCountError &&
                  editInlineError('min', editErrors.min)}
              </div>
              <div>
                <Field
                  label="Số lượng nhân viên tối đa"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.max}
                  aria-invalid={Boolean(editErrors.max)}
                  aria-describedby={
                    sharedCountError
                      ? `${formId}-count-error`
                      : editErrors.max
                        ? `${formId}-max-error`
                        : undefined
                  }
                  onChange={(event) => field('max', event.target.value)}
                />
                {editErrors.max && !sharedCountError &&
                  editInlineError('max', editErrors.max)}
              </div>
              {sharedCountError && (
                <p
                  className="shift-edit-inline-error shift-edit-field-wide"
                  id={`${formId}-count-error`}
                  role="alert"
                >
                  {sharedCountError}
                </p>
              )}
              <section className="shift-edit-assignees shift-edit-field-wide">
                <h3>Nhân viên được phân công</h3>
                <p>
                  {shift.nhan_vien.map((person) => person.ho_ten).join(' · ') ||
                    'Chưa phân công'}
                </p>
              </section>
            </div>
          ) : (
            <>
              <fieldset className="shift-create-choice-group">
                <legend>Loại ca</legend>
                <div className="shift-create-choice-options">
                  <label>
                    <input
                      type="radio"
                      name={`${formId}-recurrence`}
                      value="once"
                      checked={form.recurrence === 'once'}
                      onChange={(event) =>
                        field('recurrence', event.target.value)
                      }
                    />
                    <span>Ca diễn ra một lần</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`${formId}-recurrence`}
                      value="weekly"
                      checked={form.recurrence === 'weekly'}
                      onChange={(event) =>
                        field('recurrence', event.target.value)
                      }
                    />
                    <span>Ca lặp lại hằng tuần</span>
                  </label>
                </div>
              </fieldset>
              <div className="shift-create-grid">
                <div className="shift-create-field-wide">
                  <Field
                    label="Ngày làm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    placeholder="dd/mm/yyyy"
                    value={dateText}
                    aria-invalid={Boolean(createErrors.date)}
                    aria-describedby={
                      createErrors.date ? errorId('date') : undefined
                    }
                    onChange={(event) => createDate(event.target.value)}
                  />
                </div>
                {createErrors.date &&
                  inlineError(
                    'date',
                    createErrors.date,
                    'shift-create-field-wide',
                  )}
                <Field
                  label="Giờ bắt đầu"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="HH:MM"
                  value={form.start}
                  aria-invalid={Boolean(createErrors.start)}
                  aria-describedby={
                    createErrors.start ? errorId('start') : undefined
                  }
                  onChange={(event) => field('start', event.target.value)}
                />
                <Field
                  label="Giờ kết thúc"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="HH:MM"
                  value={form.end}
                  aria-invalid={Boolean(createErrors.end)}
                  aria-describedby={
                    createErrors.end ? errorId('end') : undefined
                  }
                  onChange={(event) => field('end', event.target.value)}
                />
                {createErrors.start &&
                  inlineError(
                    'start',
                    createErrors.start,
                    'shift-create-field-wide',
                  )}
                <Field
                  label="Số lượng nhân viên tối thiểu"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.min}
                  aria-invalid={Boolean(createErrors.min)}
                  aria-describedby={
                    createErrors.min ? errorId('min') : undefined
                  }
                  onChange={(event) => field('min', event.target.value)}
                />
                <Field
                  label="Số lượng nhân viên tối đa"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={form.max}
                  aria-invalid={Boolean(createErrors.max)}
                  aria-describedby={
                    createErrors.max ? errorId('max') : undefined
                  }
                  onChange={(event) => field('max', event.target.value)}
                />
                {createErrors.min &&
                  inlineError(
                    'min',
                    createErrors.min,
                    'shift-create-field-wide',
                  )}
              </div>
              {form.recurrence === 'weekly' && (
                <>
                  <fieldset className="shift-create-choice-group shift-create-end-choice">
                    <legend>Cách kết thúc</legend>
                    <div className="shift-create-choice-options">
                      <label>
                        <input
                          type="radio"
                          name={`${formId}-end-type`}
                          value="date"
                          checked={form.endType === 'date'}
                          onChange={(event) =>
                            field('endType', event.target.value)
                          }
                        />
                        <span>Theo ngày</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={`${formId}-end-type`}
                          value="weeks"
                          checked={form.endType === 'weeks'}
                          onChange={(event) =>
                            field('endType', event.target.value)
                          }
                        />
                        <span>Theo số tuần</span>
                      </label>
                    </div>
                  </fieldset>
                  {form.endType === 'date' ? (
                    <div className="shift-create-field-wide">
                      <Field
                        label="Ngày kết thúc"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={10}
                        placeholder="dd/mm/yyyy"
                        value={endDateText}
                        aria-invalid={Boolean(createErrors.endDate)}
                        aria-describedby={
                          createErrors.endDate
                            ? errorId('endDate')
                            : undefined
                        }
                        onChange={(event) => createEndDate(event.target.value)}
                      />
                      {createErrors.endDate &&
                        inlineError('endDate', createErrors.endDate)}
                    </div>
                  ) : (
                    <div className="shift-create-field-wide">
                      <Field
                        label="Số tuần lặp"
                        type="number"
                        min={1}
                        max={52}
                        step={1}
                        value={form.weeks}
                        aria-invalid={Boolean(createErrors.weeks)}
                        aria-describedby={
                          createErrors.weeks
                            ? errorId('weeks')
                            : undefined
                        }
                        onChange={(event) =>
                          field('weeks', event.target.value)
                        }
                      />
                      {createErrors.weeks &&
                        inlineError('weeks', createErrors.weeks)}
                    </div>
                  )}
                </>
              )}
              {duplicateDays.length > 0 && (
                <div className="shift-create-conflict" role="alert">
                  <strong>Ngày bị trùng</strong>
                  <p>{duplicateDays.join(' · ')}</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="dialog-error">
          <ErrorMessage message={editServerError || task.error} />
        </div>
        <footer className="dialog-actions">
          <Button variant="primary" type="submit" disabled={task.pending}>
            Lưu
          </Button>
        </footer>
        </form>
      </Modal>
      {shift && confirming && (
        <Modal
          title="Chỉnh sửa ca làm"
          aria-label="Xác nhận thay đổi"
          onClose={() => setConfirming(false)}
          busy={task.pending}
          className="shift-edit-confirm"
        >
          <div className="dialog-body">
            <p>Xác nhận thay đổi</p>
            <p>
              {displayDate(form.date)} · {form.start}–{form.end}
            </p>
          </div>
          <footer className="dialog-actions">
            <Button
              disabled={task.pending}
              onClick={onClose}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={task.pending}
              onClick={saveEdit}
            >
              Xác nhận
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
