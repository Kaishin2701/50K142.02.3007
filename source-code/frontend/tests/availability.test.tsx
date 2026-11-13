import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  calendarTime,
  remainingAvailability,
} from '../src/features/shifts/availability';
import type { Registration, Shift } from '../src/services/models';
import { useCalendarClock } from '../src/features/shifts/useCalendarClock';

afterEach(() => vi.useRealTimers());

const day = '2026-11-14';
const registration: Registration = {
  ma_dang_ky: 'registration',
  ngay: day,
  gio_bat_dau: '00:00',
  gio_ket_thuc: '24:00',
  loai_dang_ky: 'Rảnh',
};
const shift = (start: string, end: string, date = day): Shift => ({
  ma_ca: start + end,
  ngay_lam: date,
  gio_bat_dau: start,
  gio_ket_thuc: end,
  so_nhan_vien_toi_thieu: 1,
  so_nhan_vien_toi_da: 2,
  nhan_vien: [],
  thieu_nhan_vien: false,
});

it('updates on minute boundaries, resumes after focus and stops its timer on unmount', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(day + 'T11:59:30+07:00'));
  const hook = renderHook(() => useCalendarClock());
  expect(hook.result.current).toBe(calendarTime(day, '11:59:30'));
  act(() => vi.advanceTimersByTime(30_000));
  expect(hook.result.current).toBe(calendarTime(day, '12:00'));
  vi.setSystemTime(new Date('2026-11-15T00:00:00+07:00'));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(hook.result.current).toBe(calendarTime('2026-11-15', '00:00'));
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
const ranges = (registrations: Registration[], shifts: Shift[], now: string) =>
  remainingAvailability(registrations, shifts, Date.parse(now)).map((slot) => [
    slot.startTime,
    slot.endTime,
  ]);

describe('employee remaining availability', () => {
  it('shows only 12:00–24:00 after a 06:00–12:00 assignment has ended', () => {
    expect(
      ranges(
        [registration],
        [shift('06:00', '12:00')],
        day + 'T12:00:00+07:00',
      ),
    ).toEqual([['12:00', '24:00']]);
  });
  it('keeps both future portions and subtracts multiple unsorted and overlapping assignments', () => {
    expect(
      ranges(
        [registration],
        [
          shift('18:00', '20:00'),
          shift('06:00', '12:00'),
          shift('10:00', '14:00'),
        ],
        '2026-11-13T20:00:00+07:00',
      ),
    ).toEqual([
      ['00:00', '06:00'],
      ['14:00', '18:00'],
      ['20:00', '24:00'],
    ]);
  });
  it('discards a remainder below two hours, retaining exactly two hours', () => {
    expect(
      ranges(
        [{ ...registration, gio_bat_dau: '06:00', gio_ket_thuc: '16:00' }],
        [shift('07:00', '14:00')],
        '2026-11-13T20:00:00+07:00',
      ),
    ).toEqual([['14:00', '16:00']]);
    expect(
      ranges(
        [{ ...registration, gio_ket_thuc: '13:59' }],
        [shift('00:00', '12:00')],
        day + 'T12:00:00+07:00',
      ),
    ).toEqual([]);
    expect(
      ranges(
        [{ ...registration, gio_bat_dau: '12:00', gio_ket_thuc: '14:00' }],
        [],
        day + 'T12:00:01+07:00',
      ),
    ).toEqual([]);
  });
  it('hides expired, fully assigned and prior-day registrations', () => {
    expect(ranges([registration], [], day + 'T24:00:00+07:00')).toEqual([]);
    expect(
      ranges(
        [registration],
        [shift('00:00', '24:00')],
        day + 'T01:00:00+07:00',
      ),
    ).toEqual([]);
    expect(
      ranges(
        [{ ...registration, ngay: '2026-11-13' }],
        [],
        day + 'T00:00:00+07:00',
      ),
    ).toEqual([]);
  });
  it('preserves both types, original records and separate dates', () => {
    const input = [{ ...registration, loai_dang_ky: 'Mong muốn' as const }];
    const snapshot = JSON.stringify(input);
    const slots = remainingAvailability(
      input,
      [shift('00:00', '24:00', '2026-11-13')],
      Date.parse('2026-11-13T20:00:00+07:00'),
    );
    expect(
      slots.map((s) => [s.startTime, s.endTime, s.registration.loai_dang_ky]),
    ).toEqual([['00:00', '24:00', 'Mong muốn']]);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(slots[0].registration).toBe(input[0]);
  });
  it('keeps displayed minute boundaries outside second-precision assignments', () => {
    expect(
      ranges(
        [registration],
        [shift('06:00:20', '12:00:40')],
        '2026-11-13T20:00:00+07:00',
      ),
    ).toEqual([
      ['00:00', '06:00'],
      ['12:01', '24:00'],
    ]);
  });
  it('never overlaps assigned time for any generated remainder', () => {
    for (let i = 0; i < 48; i++) {
      const start =
        String(Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00');
      const assigned = [shift(start, '24:00')];
      const slots = remainingAvailability(
        [registration],
        assigned,
        calendarTime(day, '00:00'),
      );
      for (const slot of slots) {
        expect(slot.end - slot.start).toBeGreaterThanOrEqual(2 * 3600000);
        expect(slot.end <= calendarTime(day, start)).toBe(true);
      }
    }
  });
});
