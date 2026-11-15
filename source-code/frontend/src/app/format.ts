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
export function parseDisplayDate(value: string) {
  const normalized = /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value.split('/').reverse().join('-') : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return '';
  const date = new Date(normalized + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : '';
}
export const validTime = (value: string, endOfDay = false) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) || (endOfDay && value === '24:00');
export function weekText(start: string) {
  const end = addDays(start, 6);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${start.slice(8)} – ${end.slice(8)} tháng ${Number(end.slice(5, 7))}, ${end.slice(0, 4)}`;
  return `${dateText(start)} – ${dateText(end)}`;
}
export function shiftLabel(shift?: { gio_bat_dau?: string; gio_ket_thuc?: string }) {
  if (!shift?.gio_bat_dau) return '—';
  const hour = Number(shift.gio_bat_dau.slice(0, 2));
  return `${hour < 12 ? 'Ca sáng' : hour < 18 ? 'Ca chiều' : 'Ca tối'} · ${timeText(shift.gio_bat_dau)}–${timeText(shift.gio_ket_thuc)}`;
}
export function dateTimeText(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  const parts = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (name: string) => parts.find(part => part.type === name)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}
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
