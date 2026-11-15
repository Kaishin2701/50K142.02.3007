import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useDataStore, useTask } from '../../app/data';
import { dateText, errorText, money, today } from '../../app/format';
import { api, download, query } from '../../services/api';
import {
  Button,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
  useNotice,
} from '../../components/ui';
import ExportReportDialog from './ExportReportDialog';

type Revenue = {
  doanh_thu: string;
  so_ly: string;
  tien_mat: string;
  chuyen_khoan: string;
  items: unknown[];
};
type Period = 'day' | 'month' | 'year';
type PaymentMethod = 'Tiền mặt' | 'Chuyển khoản qua QR';
type RequestState<T> = {
  key: string;
  data: T | null;
  loading: boolean;
  error: string;
};
const periods: { value: Period; label: string }[] = [
  { value: 'day', label: 'Ngày' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
];

function requestError(error: unknown, subject: string) {
  if (error instanceof TypeError) {
    return `Lỗi kết nối. Không thể tải ${subject}.`;
  }
  return `Không thể tải ${subject}: ${errorText(error)}`;
}

function formatDateInput(value: string, period: Period) {
  if (period === 'year') return value.slice(0, 4);
  if (period === 'month') return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return dateText(value);
}

function parseDateInput(value: string, period: Period) {
  if (period === 'day') {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const [, dayText, monthText, yearText] = match;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (
      year < 1900 ||
      day < 1 ||
      month < 1 ||
      month > 12 ||
      day > daysInMonth
    )
      return null;
    return `${yearText}-${monthText}-${dayText}`;
  }
  if (period === 'month') {
    const match = /^(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const [, monthText, yearText] = match;
    const month = Number(monthText);
    if (month < 1 || month > 12 || Number(yearText) < 1900) return null;
    return `${yearText}-${monthText}-01`;
  }
  if (!/^\d{4}$/.test(value) || Number(value) < 1900) return null;
  return `${value}-01-01`;
}

export default function ReportsPage() {
  const initialDate = today();
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(initialDate);
  const [dateInput, setDateInput] = useState(() =>
    formatDateInput(initialDate, 'day'),
  );
  const [dateInputError, setDateInputError] = useState('');
  const [reportPeriod, setReportPeriod] = useState<Period>('day');
  const [reportDate, setReportDate] = useState(initialDate);
  const [method, setMethod] = useState('');
  const [reportRetry, setReportRetry] = useState(0);
  const [paymentRetry, setPaymentRetry] = useState(0);
  const [reportState, setReportState] = useState<RequestState<Revenue>>({
    key: '',
    data: null,
    loading: true,
    error: '',
  });
  const [paymentState, setPaymentState] = useState<RequestState<Revenue>>({
    key: '',
    data: null,
    loading: true,
    error: '',
  });
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');

  const openExport = () => {
    setFormat('xlsx');
    setExporting(true);
  };
  const task = useTask();
  const { version } = useDataStore();
  const notice = useNotice();
  const nativePicker = useRef<HTMLInputElement>(null);
  const reportQuery = query({ period: reportPeriod, date: reportDate });
  const reportKey = `/reports/revenue?${reportQuery}`;
  const paymentMethod: PaymentMethod =
    method === 'Chuyển khoản qua QR' ? 'Chuyển khoản qua QR' : 'Tiền mặt';
  const paymentQuery = query({
    period: reportPeriod,
    date: reportDate,
    method: paymentMethod,
  });
  const paymentKey = `/reports/revenue?${paymentQuery}`;
  const report =
    reportState.key === reportKey
      ? reportState
      : { key: reportKey, data: null, loading: true, error: '' };
  const payment =
    paymentState.key === paymentKey
      ? paymentState
      : { key: paymentKey, data: null, loading: true, error: '' };

  useEffect(() => {
    const controller = new AbortController();
    setReportState({
      key: reportKey,
      data: null,
      loading: true,
      error: '',
    });
    api<Revenue>(reportKey, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setReportState({ key: reportKey, data, loading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setReportState({
            key: reportKey,
            data: null,
            loading: false,
            error: requestError(error, 'dữ liệu báo cáo doanh thu'),
          });
      });
    return () => controller.abort();
  }, [reportKey, reportRetry, version]);

  useEffect(() => {
    const controller = new AbortController();
    setPaymentState({
      key: paymentKey,
      data: null,
      loading: true,
      error: '',
    });
    api<Revenue>(paymentKey, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setPaymentState({ key: paymentKey, data, loading: false, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPaymentState({
            key: paymentKey,
            data: null,
            loading: false,
            error: requestError(
              error,
              'dữ liệu giao dịch theo phương thức thanh toán',
            ),
          });
      });
    return () => controller.abort();
  }, [paymentKey, paymentRetry, version]);

  const changePeriod = (next: Period) => {
    setPeriod(next);
    const nextDate =
      next === 'year'
        ? today().slice(0, 4)
        : next === 'month'
          ? today().slice(0, 7)
          : today();
    setDate(nextDate);
    setDateInput(formatDateInput(nextDate, next));
    setDateInputError('');
  };
  const showReport = (event: FormEvent) => {
    event.preventDefault();
    const nextReportDate = parseDateInput(dateInput, period);
    if (!nextReportDate) {
      const expected =
        period === 'day' ? 'dd/MM/yyyy' : period === 'month' ? 'MM/yyyy' : 'yyyy';
      setDateInputError(`Nhập khoảng thời gian theo định dạng ${expected}.`);
      return;
    }
    setDate(nextReportDate);
    setDateInputError('');
    setReportPeriod(period);
    setReportDate(nextReportDate);
  };
  const displayDate =
    reportPeriod === 'year'
      ? reportDate.slice(0, 4)
      : reportPeriod === 'month'
        ? `${reportDate.slice(5, 7)}/${reportDate.slice(0, 4)}`
        : dateText(reportDate);
  const noReportData =
    !report.loading &&
    !report.error &&
    report.data?.items?.length === 0;
  const selectedPaymentLabel =
    paymentMethod === 'Tiền mặt' ? 'Tiền mặt' : 'Chuyển khoản';

  return (
    <>
      <div className="reports-page">
        <p className="breadcrumb">TỔNG QUAN / BÁO CÁO DOANH THU</p>
        <PageHeader
          title="Tổng quan"
          actions={
            <Button
              onClick={openExport}
            >
              Xuất báo cáo
            </Button>
          }
        />
        <Panel title="Báo cáo doanh thu" className="report-filter-panel">
          <form className="report-toolbar" onSubmit={showReport}>
            <div className="segmented" aria-label="Khoảng thời gian">
              {periods.map((item) => (
                <Button
                  key={item.value}
                  aria-pressed={period === item.value}
                  onClick={() => changePeriod(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <div
              className={`report-date-control${
                period === 'year' ? '' : ' has-picker'
              }`}
            >
              <Field
                label="Ngày báo cáo"
                type={period === 'year' ? 'number' : 'text'}
                inputMode={period === 'year' ? 'numeric' : 'text'}
                min={period === 'year' ? 1900 : undefined}
                max={period === 'year' ? 9999 : undefined}
                value={dateInput}
                aria-invalid={Boolean(dateInputError)}
                aria-describedby={
                  dateInputError ? 'report-date-error' : undefined
                }
                onChange={(event) => {
                  const value = event.target.value;
                  setDateInput(value);
                  setDateInputError('');
                  const parsed = parseDateInput(value, period);
                  if (parsed) setDate(parsed);
                }}
                onClick={() => {
                  if (period === 'year') return;
                  const picker = nativePicker.current;
                  if (!picker) return;
                  if (typeof picker.showPicker === 'function') picker.showPicker();
                  else picker.focus();
                }}
                required
                autoComplete="off"
              />
              {period !== 'year' && (
                <>
                  <input
                    ref={nativePicker}
                    className="report-native-picker"
                    type={period === 'month' ? 'month' : 'date'}
                    aria-hidden="true"
                    tabIndex={-1}
                    value={period === 'month' ? date.slice(0, 7) : date}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDate(value);
                      setDateInput(formatDateInput(value, period));
                      setDateInputError('');
                    }}
                  />
                </>
              )}
              {dateInputError && (
                <p className="report-date-error" id="report-date-error" role="alert">
                  {dateInputError}
                </p>
              )}
            </div>
            <Button type="submit" variant="primary">
              Xem báo cáo
            </Button>
          </form>
        </Panel>
        <Panel className="report-period-panel">
          <p className="muted">Khoảng thời gian đang xem</p>
          <p className="report-period">{displayDate}</p>
        </Panel>
        <Loading active={report.loading} />
        <div className="metric-grid report-metrics">
          <div className="metric">
            <span>Tổng doanh thu</span>
            <strong>
              {report.error || report.loading
                ? '—'
                : money(report.data?.doanh_thu)}
            </strong>
          </div>
          <div className="metric">
            <span>Số ly bán ra</span>
            <strong>
              {report.error || report.loading ? '—' : report.data?.so_ly}
            </strong>
          </div>
        </div>
        {report.error && (
          <div className="report-alert" role="alert">
            <span>{report.error}</span>
            <Button
              aria-label="Tải lại báo cáo doanh thu"
              onClick={() => setReportRetry((value) => value + 1)}
            >
              Tải lại
            </Button>
          </div>
        )}
        {noReportData && (
          <div className="report-empty">
            Không có dữ liệu doanh thu trong khoảng thời gian đã chọn!
          </div>
        )}
        <Panel
          title="Doanh thu theo phương thức thanh toán"
          className="report-payment-panel"
        >
          <div className="segmented" aria-label="Phương thức thanh toán">
            <Button
              aria-pressed={paymentMethod === 'Tiền mặt'}
              onClick={() => setMethod('Tiền mặt')}
            >
              Tiền mặt
            </Button>
            <Button
              aria-pressed={paymentMethod === 'Chuyển khoản qua QR'}
              onClick={() => setMethod('Chuyển khoản qua QR')}
            >
              Chuyển khoản
            </Button>
          </div>
          {payment.error && !report.loading && !report.error ? (
            <div className="report-alert report-payment-alert" role="alert">
              <span>{payment.error}</span>
              <Button
                aria-label="Tải lại dữ liệu phương thức thanh toán"
                onClick={() => setPaymentRetry((value) => value + 1)}
              >
                Tải lại
              </Button>
            </div>
          ) : (
            <>
              <div className="report-payment-value" aria-live="polite">
                <span>{selectedPaymentLabel}</span>
                <strong>
                  {report.loading || report.error || payment.loading
                    ? '—'
                    : money(payment.data?.doanh_thu)}
                </strong>
              </div>
              <Loading active={payment.loading && !report.error} />
            </>
          )}
        </Panel>
      </div>
      {exporting && (
        <ExportReportDialog
          report={report.data}
          loading={report.loading}
          reportError={report.error}
          onRetryReport={() => setReportRetry((value) => value + 1)}
          period={reportPeriod}
          date={reportDate}
          format={format}
          onFormatChange={setFormat}
          onClose={() => setExporting(false)}
          onSuccess={() => {
            setExporting(false);
            notice('Xuất file thành công', 'success');
          }}
        />
      )}
    </>
  );
}
