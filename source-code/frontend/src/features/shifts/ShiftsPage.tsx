import { useState } from 'react';
import { useSession } from '../../app/auth';
import { useResource } from '../../app/data';
import {
  addDays,
  dateKey,
  dateText,
  shiftText,
  shiftTime,
  timeText,
  today,
  weekStart,
} from '../../app/format';
import type { CalendarData, Registration, Shift } from '../../services/models';
import {
  Badge,
  Button,
  ErrorMessage,
  Loading,
  PageHeader,
  Panel,
} from '../../components/ui';
import { ShiftForm } from './ShiftForm';
import { AssignmentDialog } from './AssignmentDialog';
import {
  AvailabilityForm,
  EmployeeShiftDetails,
  RegistrationDetails,
} from './EmployeeShiftDialogs';
import { RequestsDialog } from './RequestsDialog';
import {
  calendarTime,
  remainingAvailability,
  type AvailabilitySlot,
} from './availability';
import { useCalendarClock } from './useCalendarClock';

type Dialog =
  | { kind: 'create'; date?: string }
  | { kind: 'edit' | 'assignment' | 'shift'; shift: Shift }
  | { kind: 'availability'; date: string }
  | { kind: 'registration'; registration: Registration; slot: AvailabilitySlot }
  | { kind: 'requests' }
  | null;
const weekdays = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ Nhật',
];

export default function ShiftsPage() {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const now = useCalendarClock();
  const [week, setWeek] = useState(weekStart);
  const [dialog, setDialog] = useState<Dialog>(null);
  const calendar = useResource<CalendarData>(
    `/shifts?from=${week}&to=${addDays(week, 6)}`,
    { shifts: [], registrations: [] },
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const availability = manager
    ? []
    : remainingAvailability(
        calendar.data.registrations,
        calendar.data.shifts,
        now,
      );
  const selectedRegistration = dialog?.kind === 'registration' ? dialog : null;
  const selectedAvailability = selectedRegistration
    ? availability.find(
        (slot) =>
          slot.registration.ma_dang_ky ===
            selectedRegistration.registration.ma_dang_ky &&
          slot.start < selectedRegistration.slot.end &&
          slot.end > selectedRegistration.slot.start,
      )
    : undefined;
  const close = () => setDialog(null);
  return (
    <>
      <PageHeader
        title={manager ? 'Quản lý ca' : 'Lịch làm việc của tôi'}
        subtitle={manager ? 'Theo dõi và phân bổ ca làm theo tuần' : undefined}
        actions={
          !manager ? (
            <Button onClick={() => setDialog({ kind: 'requests' })}>
              Yêu cầu
            </Button>
          ) : undefined
        }
      />
      <div className="calendar-toolbar">
        <div className="week-controls">
          <Button
            aria-label="Tuần trước"
            onClick={() => setWeek((previous) => addDays(previous, -7))}
          >
            ‹
          </Button>
          <strong>
            {dateText(week)} – {dateText(addDays(week, 6))}
          </strong>
          <Button
            aria-label="Tuần sau"
            onClick={() => setWeek((previous) => addDays(previous, 7))}
          >
            ›
          </Button>
        </div>
        <Button onClick={() => setWeek(weekStart())}>Hôm nay</Button>
        {manager && (
          <Button
            variant="primary"
            className="create-shift-action"
            onClick={() => setDialog({ kind: 'create' })}
          >
            + Tạo ca mới
          </Button>
        )}
      </div>
      <Panel title="Lịch làm việc" className="calendar-panel">
        <div className="calendar-legend">
          <Badge>Đủ nhân sự</Badge>
          <Badge>Cần bổ sung</Badge>
          {!manager && (
            <>
              <Badge>Mong muốn</Badge>
              <Badge>Rảnh</Badge>
            </>
          )}
        </div>
        <Loading active={calendar.loading} />
        <ErrorMessage message={calendar.error} />
        <div className="calendar-grid">
          {days.map((date, index) => {
            const shifts = calendar.data.shifts.filter(
              (shift) =>
                dateKey(shift.ngay_lam) === date &&
                (manager ||
                  calendarTime(shift.ngay_lam, shift.gio_ket_thuc) > now),
            );
            const registrations = manager
              ? []
              : availability.filter(
                  (slot) => dateKey(slot.registration.ngay) === date,
                );
            const cards = [
              ...shifts.map((shift) => ({
                kind: 'shift' as const,
                shift,
                start: calendarTime(shift.ngay_lam, shift.gio_bat_dau),
              })),
              ...registrations.map((slot) => ({
                kind: 'registration' as const,
                slot,
                start: slot.start,
              })),
            ].sort((a, b) => a.start - b.start);
            return (
              <section
                className={
                  'calendar-day' + (date === today() ? ' is-today' : '')
                }
                key={date}
              >
                <header>
                  <strong>{weekdays[index]}</strong>
                  <span>{dateText(date).slice(0, 5)}</span>
                  {!manager && date >= today() && (
                    <Button
                      variant="quiet"
                      aria-label={`Đăng ký ngày ${dateText(date)}`}
                      onClick={() => setDialog({ kind: 'availability', date })}
                    >
                      +
                    </Button>
                  )}
                </header>
                <div className="calendar-cards">
                  {cards.map((card) => {
                    if (card.kind === 'shift') {
                      const shift = card.shift;
                      return (
                        <article
                          className="shift-card"
                          data-short={shift.thieu_nhan_vien}
                          key={shift.ma_ca}
                        >
                          <button
                            className="shift-card-main"
                            aria-label={shiftText(shift)}
                            onClick={() =>
                              setDialog({
                                kind: manager ? 'assignment' : 'shift',
                                shift,
                              })
                            }
                          >
                            <Badge>
                              {shift.thieu_nhan_vien
                                ? 'Cần bổ sung'
                                : 'Đủ nhân sự'}
                            </Badge>
                            <strong>
                              {timeText(shift.gio_bat_dau)}–
                              {timeText(shift.gio_ket_thuc)}
                            </strong>
                            <span>
                              {shift.nhan_vien.length} /{' '}
                              {shift.so_nhan_vien_toi_da} nhân viên
                            </span>
                            <small>
                              {shift.nhan_vien
                                .map((person) => person.ho_ten)
                                .join(' · ') || '—'}
                            </small>
                          </button>
                          {manager && shiftTime(shift) > now && (
                            <Button
                              variant="quiet"
                              onClick={() => setDialog({ kind: 'edit', shift })}
                            >
                              Chỉnh sửa
                            </Button>
                          )}
                        </article>
                      );
                    }
                    const slot = card.slot;
                    return (
                      <button
                        type="button"
                        className="registration-card"
                        key={`${slot.registration.ma_dang_ky}:${slot.end}`}
                        onClick={() =>
                          setDialog({
                            kind: 'registration',
                            registration: slot.registration,
                            slot,
                          })
                        }
                      >
                        <Badge>{slot.registration.loai_dang_ky}</Badge>
                        <strong>
                          {slot.startTime}–{slot.endTime}
                        </strong>
                      </button>
                    );
                  })}
                  {!shifts.length && !registrations.length && (
                    <span className="calendar-empty">—</span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {manager && (
          <div className="ui-actions calendar-footer">
            <Button onClick={() => setDialog({ kind: 'requests' })}>
              {manager
                ? 'Xử lý yêu cầu đổi hoặc xoay ca'
                : 'Yêu cầu đổi hoặc xoay ca'}
            </Button>
          </div>
        )}
      </Panel>
      <p className="breadcrumb">
        {manager ? 'QUẢN LÝ CA / LỊCH LÀM VIỆC' : 'LỊCH LÀM VIỆC CỦA TÔI'}
      </p>
      {dialog?.kind === 'create' && (
        <ShiftForm date={dialog.date} onClose={close} />
      )}
      {dialog?.kind === 'edit' && (
        <ShiftForm shift={dialog.shift} onClose={close} />
      )}
      {dialog?.kind === 'assignment' && (
        <AssignmentDialog shift={dialog.shift} onClose={close} />
      )}
      {dialog?.kind === 'availability' && (
        <AvailabilityForm date={dialog.date} onClose={close} />
      )}
      {dialog?.kind === 'registration' && selectedAvailability && (
        <RegistrationDetails
          registration={dialog.registration}
          visibleRange={{
            start: selectedAvailability.startTime,
            end: selectedAvailability.endTime,
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'shift' &&
        calendarTime(dialog.shift.ngay_lam, dialog.shift.gio_ket_thuc) >
          now && <EmployeeShiftDetails shift={dialog.shift} onClose={close} />}
      {dialog?.kind === 'requests' && <RequestsDialog onClose={close} />}
    </>
  );
}
