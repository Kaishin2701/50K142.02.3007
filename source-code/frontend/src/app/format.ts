export const dateKey = (value: unknown) => String(value ?? '').slice(0, 10);
export const today = () =>
  new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const money = (value: unknown) =>
  new Intl.NumberFormat('vi-VN').format(Number(value ?? 0)) + ' đ';
export const numberText = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(
        Number(value),
      );
export const stockDifference = (actual: unknown, theoretical: unknown) =>
  (Math.round(Number(actual) * 1000) - Math.round(Number(theoretical) * 1000)) /
  1000;
export const dateText = (value: unknown) =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateKey(value))
    ? dateKey(value).split('-').reverse().join('/')
    : '—';
export const timeText = (value: unknown) => String(value ?? '').slice(0, 5);
export const dateTimeText = (value?: string) =>
  value
    ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';
export const shortId = (value?: string) => value?.slice(0, 8) ?? '—';
export function addDays(value: string, days: number) {
  const date = new Date(dateKey(value) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value = today()) {
  const date = new Date(value + 'T00:00:00Z');
  return addDays(value, -(date.getUTCDay() + 6) % 7);
}
export function shiftText(shift?: {
  ngay_lam?: string;
  gio_bat_dau?: string;
  gio_ket_thuc?: string;
}) {
  return shift
    ? `${dateText(shift.ngay_lam)} · ${timeText(shift.gio_bat_dau)}–${timeText(shift.gio_ket_thuc)}`
    : '—';
}
export function shiftTime(
  shift: { ngay_lam: string; gio_bat_dau: string; gio_ket_thuc: string },
  end = false,
) {
  return new Date(
    `${dateKey(shift.ngay_lam)}T${end ? shift.gio_ket_thuc : shift.gio_bat_dau}+07:00`,
  ).getTime();
}
export function errorText(error: unknown) {
  if (error instanceof TypeError) return 'Lỗi kết nối. Vui lòng thử lại.';
  return error instanceof Error
    ? error.message
    : 'Lỗi kết nối. Vui lòng thử lại.';
}
