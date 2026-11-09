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

type Dialog =
  | { kind: 'create'; date?: string }
  | { kind: 'edit' | 'assignment' | 'shift'; shift: Shift }
  | { kind: 'availability'; date: string }
  | { kind: 'registration'; registration: Registration }
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
  const [week, setWeek] = useState(weekStart);
  const [dialog, setDialog] = useState<Dialog>(null);
  const calendar = useResource<CalendarData>(
    `/shifts?from=${week}&to=${addDays(week, 6)}`,
    { shifts: [], registrations: [] },
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const close = () => setDialog(null);
  return (
    <>
      <PageHeader
        title={manager ? 'Quản lý ca' : 'Lịch làm việc của tôi'}
        subtitle={manager ? 'Theo dõi và phân bổ ca làm theo tuần' : undefined}
        actions={
          manager ? (
            <Button
              variant="primary"
              onClick={() => setDialog({ kind: 'create' })}
            >
              + Tạo ca mới
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => setDialog({ kind: 'availability', date: today() })}
            >
              Đăng ký lịch làm việc
            </Button>
          )
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
      </div>
      <Panel title="Lịch làm việc">
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
              (shift) => dateKey(shift.ngay_lam) === date,
            );
            const registrations = manager
              ? []
              : calendar.data.registrations.filter(
                  (registration) => dateKey(registration.ngay) === date,
                );
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
                  {shifts.map((shift) => (
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
                          {shift.thieu_nhan_vien ? 'Cần bổ sung' : 'Đủ nhân sự'}
                        </Badge>
                        <strong>
                          {timeText(shift.gio_bat_dau)}–
                          {timeText(shift.gio_ket_thuc)}
                        </strong>
                        <span>
                          {shift.nhan_vien.length} / {shift.so_nhan_vien_toi_da}{' '}
                          nhân viên
                        </span>
                        <small>
                          {shift.nhan_vien
                            .map((person) => person.ho_ten)
                            .join(' · ') || '—'}
                        </small>
                      </button>
                      {manager && shiftTime(shift) > Date.now() && (
                        <Button
                          variant="quiet"
                          onClick={() => setDialog({ kind: 'edit', shift })}
                        >
                          Chỉnh sửa
                        </Button>
                      )}
                    </article>
                  ))}
                  {registrations.map((registration) => (
                    <button
                      type="button"
                      className="registration-card"
                      key={registration.ma_dang_ky}
                      onClick={() =>
                        setDialog({ kind: 'registration', registration })
                      }
                    >
                      <Badge>{registration.loai_dang_ky}</Badge>
                      <strong>
                        {timeText(registration.gio_bat_dau)}–
                        {timeText(registration.gio_ket_thuc)}
                      </strong>
                    </button>
                  ))}
                  {!shifts.length && !registrations.length && (
                    <span className="calendar-empty">—</span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </Panel>
      <div className="ui-actions">
        <Button onClick={() => setDialog({ kind: 'requests' })}>
          {manager
            ? 'Xử lý yêu cầu đổi hoặc xoay ca'
            : 'Yêu cầu đổi hoặc xoay ca'}
        </Button>
      </div>
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
      {dialog?.kind === 'registration' && (
        <RegistrationDetails
          registration={dialog.registration}
          onClose={close}
        />
      )}
      {dialog?.kind === 'shift' && (
        <EmployeeShiftDetails shift={dialog.shift} onClose={close} />
      )}
      {dialog?.kind === 'requests' && <RequestsDialog onClose={close} />}
    </>
  );
}
