import { dateKey } from '../../app/format';
import type { Registration, Shift } from '../../services/models';

const MINUTE = 60_000;
const MINIMUM_REMAINING = 2 * 60 * MINUTE;

/** Calendar times use the shop's fixed UTC+07 timezone.
 * Numeric time arithmetic also supports PostgreSQL's end-of-day 24:00:00. */
export function calendarTime(day: string, time: string) {
  const [hours, minutes, seconds = 0] = time.split(':').map(Number);
  return (
    Date.parse(`${dateKey(day)}T00:00:00+07:00`) +
    (hours * 3600 + minutes * 60 + seconds) * 1000
  );
}

function timeOnDay(day: string, timestamp: number) {
  const minutes = Math.round((timestamp - calendarTime(day, '00:00')) / MINUTE);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export type AvailabilitySlot = {
  registration: Registration;
  start: number;
  end: number;
  startTime: string;
  endTime: string;
};

export function remainingAvailability(
  registrations: Registration[],
  shifts: Shift[],
  now: number,
): AvailabilitySlot[] {
  const result: AvailabilitySlot[] = [];
  for (const registration of registrations) {
    const start = Math.max(
      calendarTime(registration.ngay, registration.gio_bat_dau),
      Math.ceil(now / MINUTE) * MINUTE,
    );
    const end = calendarTime(registration.ngay, registration.gio_ket_thuc);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
      continue;
    let ranges = [{ start, end }];
    for (const shift of shifts) {
      const bookedStart = calendarTime(shift.ngay_lam, shift.gio_bat_dau);
      const bookedEnd = calendarTime(shift.ngay_lam, shift.gio_ket_thuc);
      if (
        !Number.isFinite(bookedStart) ||
        !Number.isFinite(bookedEnd) ||
        bookedStart >= bookedEnd
      )
        continue;
      ranges = ranges.flatMap((range) => {
        if (bookedEnd <= range.start || bookedStart >= range.end)
          return [range];
        const remaining = [];
        if (bookedStart > range.start)
          remaining.push({ start: range.start, end: bookedStart });
        if (bookedEnd < range.end)
          remaining.push({ start: bookedEnd, end: range.end });
        return remaining;
      });
    }
    for (const range of ranges) {
      const visibleStart = Math.ceil(range.start / MINUTE) * MINUTE;
      const visibleEnd = Math.floor(range.end / MINUTE) * MINUTE;
      if (visibleEnd - visibleStart < MINIMUM_REMAINING) continue;
      result.push({
        registration,
        start: visibleStart,
        end: visibleEnd,
        startTime: timeOnDay(registration.ngay, visibleStart),
        endTime: timeOnDay(registration.ngay, visibleEnd),
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      a.registration.ma_dang_ky.localeCompare(b.registration.ma_dang_ky),
  );
}
