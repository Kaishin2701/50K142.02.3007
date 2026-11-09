import { useState, type FormEvent } from 'react';
import { useResource, useTask } from '../../app/data';
import { dateText, money, today } from '../../app/format';
import { download, query } from '../../services/api';
import {
  Button,
  ErrorMessage,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
  SelectField,
  useNotice,
} from '../../components/ui';

type Revenue = {
  doanh_thu: string;
  so_ly: string;
  tien_mat: string;
  chuyen_khoan: string;
};
type Period = 'day' | 'month' | 'year';
const periods: { value: Period; label: string }[] = [
  { value: 'day', label: 'Ngày' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(today());
  const [selectedDate, setSelectedDate] = useState(today());
  const [method, setMethod] = useState('');
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const task = useTask();
  const notice = useNotice();
  const revenue = useResource<Revenue>(
    '/reports/revenue?' + query({ period, date: selectedDate, method }),
    { doanh_thu: '0', so_ly: '0', tien_mat: '0', chuyen_khoan: '0' },
  );
  const changePeriod = (next: Period) => {
    setPeriod(next);
    setDate(
      next === 'year'
        ? today().slice(0, 4)
        : next === 'month'
          ? today().slice(0, 7)
          : today(),
    );
    setSelectedDate(today());
  };
  const showReport = (event: FormEvent) => {
    event.preventDefault();
    setSelectedDate(
      period === 'year'
        ? date + '-01-01'
        : period === 'month'
          ? date + '-01'
          : date,
    );
    revenue.refresh();
  };
  const displayDate =
    period === 'year'
      ? selectedDate.slice(0, 4)
      : period === 'month'
        ? `${selectedDate.slice(5, 7)}/${selectedDate.slice(0, 4)}`
        : dateText(selectedDate);
  return (
    <>
      <PageHeader
        title="Tổng quan"
        actions={
          <Button
            onClick={() => {
              task.setError('');
              setExporting(true);
            }}
          >
            Xuất báo cáo
          </Button>
        }
      />
      <Panel title="Báo cáo doanh thu">
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
          <Field
            label="Ngày báo cáo"
            type={
              period === 'year'
                ? 'number'
                : period === 'month'
                  ? 'month'
                  : 'date'
            }
            min={period === 'year' ? 1900 : undefined}
            max={period === 'year' ? 9999 : undefined}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
          <Button type="submit" variant="primary">
            Xem báo cáo
          </Button>
        </form>
        <Loading active={revenue.loading} />
        <ErrorMessage message={revenue.error} />
        <p className="muted">Khoảng thời gian đang xem</p>
        <p className="report-period">{displayDate}</p>
        <div className="metric-grid">
          <div className="metric">
            <span>Tổng doanh thu</span>
            <strong>{money(revenue.data.doanh_thu)}</strong>
          </div>
          <div className="metric">
            <span>Số ly bán ra</span>
            <strong>{revenue.data.so_ly}</strong>
          </div>
        </div>
      </Panel>
      <Panel title="Doanh thu theo phương thức thanh toán">
        <div className="segmented">
          <Button aria-pressed={method === ''} onClick={() => setMethod('')}>
            Tất cả
          </Button>
          <Button
            aria-pressed={method === 'Tiền mặt'}
            onClick={() => setMethod('Tiền mặt')}
          >
            Tiền mặt
          </Button>
          <Button
            aria-pressed={method === 'Chuyển khoản qua QR'}
            onClick={() => setMethod('Chuyển khoản qua QR')}
          >
            Chuyển khoản
          </Button>
        </div>
        <div className="payment-summary">
          <div>
            <span>Tiền mặt</span>
            <strong>{money(revenue.data.tien_mat)}</strong>
          </div>
          <div>
            <span>Chuyển khoản</span>
            <strong>{money(revenue.data.chuyen_khoan)}</strong>
          </div>
        </div>
      </Panel>
      <p className="breadcrumb">TỔNG QUAN / BÁO CÁO DOANH THU</p>
      {exporting && (
        <Modal
          title="Xuất báo cáo"
          onClose={() => setExporting(false)}
          busy={task.pending}
        >
          <div className="dialog-body">
            <p>{displayDate}</p>
            <SelectField
              label="Định dạng"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="xlsx">Excel</option>
              <option value="pdf">PDF</option>
            </SelectField>
            <ErrorMessage message={task.error} />
          </div>
          <footer className="dialog-actions">
            <Button onClick={() => setExporting(false)} disabled={task.pending}>
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={task.pending}
              onClick={() =>
                void task.run(async () => {
                  await download(
                    '/reports/revenue/export?' +
                      query({ period, date: selectedDate, method, format }),
                    `me-ca-phe-${selectedDate}.${format}`,
                  );
                  setExporting(false);
                  notice('Xuất báo cáo thành công.');
                })
              }
            >
              Xác nhận
            </Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
