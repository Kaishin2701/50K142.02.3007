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
import './employee-calendar.css';
import type { CalendarData, Registration, Shift } from '../../services/models';
import {
  Badge,
  Button,
  ErrorMessage,
  Loading,
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

/** Nhãn tuần theo Figma: "02 – 08 tháng 11, 2026" */
function weekRangeLabel(start: string) {
  const end = addDays(start, 6);
  const [startYear, startMonth, startDay] = start.split('-');
  const [endYear, endMonth, endDay] = end.split('-');
  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay} – ${endDay} tháng ${Number(startMonth)}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${startDay}/${startMonth} – ${endDay}/${endMonth}, ${startYear}`;
  }
  return `${startDay}/${startMonth}/${startYear} – ${endDay}/${endMonth}/${endYear}`;
}

export default function ShiftsPage() {
  const { user } = useSession();
  const manager = user!.vai_tro === 'Quản lý';
  const [week, setWeek] = useState(weekStart);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [registrationError, setRegistrationError] = useState('');
  const calendar = useResource<CalendarData>(
    `/shifts?from=${week}&to=${addDays(week, 6)}`,
    { shifts: [], registrations: [] },
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const close = () => setDialog(null);
  const hasAnyShift = calendar.data.shifts.length > 0;
  const showEmptyWeek = manager
    ? !calendar.loading && !calendar.error && !hasAnyShift
    : !calendar.loading &&
      !calendar.error &&
      !hasAnyShift &&
      calendar.data.registrations.length === 0;

  return (
    <div
      className={
        manager ? 'shifts-page is-manager' : 'shifts-page is-employee'
      }
    >
      {manager ? (
        <div className="shifts-top">
          <p className="shifts-breadcrumb">QUẢN LÝ CA / LỊCH LÀM VIỆC</p>
          <h1 className="shifts-title">Quản lý ca</h1>
          <p className="shifts-subtitle">
            Theo dõi và phân bổ ca làm theo tuần
          </p>
        </div>
      ) : (
        <header className="employee-calendar-heading">
          <div>
            <p className="employee-calendar-eyebrow">
              LỊCH LÀM VIỆC CỦA TÔI
            </p>
            <h1>Lịch làm việc của tôi</h1>
          </div>
          <Button
            variant="secondary"
            className="employee-calendar-requests"
            aria-label="Yêu cầu đổi hoặc xoay ca"
            onClick={() => setDialog({ kind: 'requests' })}
          >
            Yêu cầu
          </Button>
        </header>
      )}
      {!manager && registrationError && (
        <div className="registration-cancel-error" role="alert">
          <span>{registrationError}</span>
          <button
            type="button"
            aria-label="Đóng thông báo lỗi"
            onClick={() => setRegistrationError('')}
          >
            ×
          </button>
        </div>
      )}
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-main">
          <div className="week-nav-pill">
            <Button
              aria-label="Tuần trước"
              variant="quiet"
              className="week-nav-arrow"
              onClick={() => setWeek((previous) => addDays(previous, -7))}
            >
              ‹
            </Button>
            <span className="week-nav-label">{weekRangeLabel(week)}</span>
            <Button
              aria-label="Tuần sau"
              variant="quiet"
              className="week-nav-arrow"
              onClick={() => setWeek((previous) => addDays(previous, 7))}
            >
              ›
            </Button>
          </div>
          <Button onClick={() => setWeek(weekStart())}>Hôm nay</Button>
        </div>
        {manager && (
          <Button
            variant="primary"
            className="shifts-create-btn"
            onClick={() => setDialog({ kind: 'create' })}
          >
            + Tạo ca mới
          </Button>
        )}
      </div>
      <Panel className="shifts-panel">
        {manager && (
          <div className="shifts-panel-header">
            <h2 className="shifts-panel-title">Lịch làm việc</h2>
            <div
              className="calendar-legend"
              aria-label="Chú giải trạng thái ca"
            >
              <span className="calendar-legend-item is-full">Đủ nhân sự</span>
              <span className="calendar-legend-item is-short">Cần bổ sung</span>
            </div>
          </div>
        )}
        <Loading active={calendar.loading} />
        <ErrorMessage message={calendar.error} />
        <div
          className={
            'calendar-body' + (showEmptyWeek ? ' is-empty-week' : '')
          }
        >
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
                    <span className="calendar-day-weekday">
                      {weekdays[index]}
                    </span>
                    <strong className="calendar-day-date">
                      {dateText(date).slice(0, 5)}
                    </strong>
                    {!manager && (
                      <Button
                        variant="quiet"
                        className="employee-calendar-add-button"
                        aria-label={
                          index === 0
                            ? 'Đăng ký lịch làm việc'
                            : `Đăng ký lịch làm việc ngày ${dateText(date)}`
                        }
                        aria-description={`Ngày ${dateText(date)}`}
                        onClick={() =>
                          setDialog({ kind: 'availability', date })
                        }
                      >
                        <span aria-hidden="true" />
                      </Button>
                    )}
                  </header>
                  {!showEmptyWeek && (
                    <div className="calendar-cards">
                      {shifts.map((shift) => {
                        const countLabel = `${shift.nhan_vien.length} / ${shift.so_nhan_vien_toi_da} nhân viên`;
                        return (
                          <article
                            className={
                              'shift-card' +
                              (manager
                                ? ' is-manager'
                                : ' employee-shift-card')
                            }
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
                              {manager && (
                                <Badge>
                                  {shift.thieu_nhan_vien
                                    ? 'Cần bổ sung'
                                    : 'Đủ nhân sự'}
                                </Badge>
                              )}
                              <strong className="shift-time">
                                {timeText(shift.gio_bat_dau)}–
                                {timeText(shift.gio_ket_thuc)}
                              </strong>
                              {manager && (
                                <small className="shift-names">
                                  {shift.nhan_vien.length > 0
                                    ? shift.nhan_vien
                                        .map((person) => person.ho_ten)
                                        .join(' · ')
                                    : 'Chưa phân công'}
                                </small>
                              )}
                            </button>
                            {manager && (
                              <div className="shift-card-meta">
                                <span className="shift-count-pill">
                                  {countLabel}
                                </span>
                              </div>
                            )}
                            {manager && shiftTime(shift) > Date.now() && (
                              <Button
                                variant="quiet"
                                onClick={() =>
                                  setDialog({ kind: 'edit', shift })
                                }
                              >
                                Chỉnh sửa
                              </Button>
                            )}
                          </article>
                        );
                      })}
                      {registrations.map((registration) => (
                        <button
                          type="button"
                          className={
                            'registration-card' +
                            (manager ? '' : ' employee-registration-card')
                          }
                          key={registration.ma_dang_ky}
                          onClick={() => {
                            setRegistrationError('');
                            setDialog({
                              kind: 'registration',
                              registration,
                            });
                          }}
                        >
                          <strong>
                            {timeText(registration.gio_bat_dau)}–
                            {timeText(registration.gio_ket_thuc)}
                          </strong>
                          <span
                            className={
                              'employee-registration-status' +
                              (registration.loai_dang_ky === 'Rảnh'
                                ? ' is-available'
                                : registration.loai_dang_ky === 'Mong muốn'
                                  ? ' is-wanted'
                                  : '')
                            }
                          >
                            {registration.loai_dang_ky}
                          </span>
                          {registration.da_phan_cong && (
                            <small className="employee-registration-assignment">
                              Đã phân công
                            </small>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          {showEmptyWeek && (
            <p className="calendar-week-empty">
              {manager
                ? 'Chưa có ca làm trong tuần này'
                : 'Chưa có lịch làm việc hoặc đăng ký trong tuần này'}
            </p>
          )}
        </div>
        {manager && (
          <div className="shifts-panel-footer">
            <Button onClick={() => setDialog({ kind: 'requests' })}>
              Xử lý yêu cầu đổi hoặc xoay ca
            </Button>
          </div>
        )}
      </Panel>
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
          onError={setRegistrationError}
        />
      )}
      {dialog?.kind === 'shift' && (
        <EmployeeShiftDetails shift={dialog.shift} onClose={close} />
      )}
      {dialog?.kind === 'requests' && <RequestsDialog onClose={close} />}
    </div>
  );
}
