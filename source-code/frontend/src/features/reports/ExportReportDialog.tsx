import { download, query } from '../../services/api';
import { dateText, money } from '../../app/format';
import { useTask } from '../../app/data';
import { Button, ErrorMessage, Loading, Modal } from '../../components/ui';

type Revenue = {
  doanh_thu: string;
  so_ly: string;
  tien_mat: string;
  chuyen_khoan: string;
  items: unknown[];
};

type Period = 'day' | 'month' | 'year';

type ExportReportDialogProps = {
  report: Revenue | null;
  loading: boolean;
  reportError: string;
  onRetryReport: () => void;
  period: Period;
  date: string;
  format: 'xlsx' | 'pdf';
  onFormatChange: (format: 'xlsx' | 'pdf') => void;
  onClose: () => void;
  onSuccess: () => void;
};

function reportPeriodLabel(period: Period, date: string): string {
  if (period === 'year') return `Năm ${date.slice(0, 4)}`;
  if (period === 'month') return `Tháng ${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return dateText(date);
}

export default function ExportReportDialog({
  report,
  loading,
  reportError,
  onRetryReport,
  period,
  date,
  format,
  onFormatChange,
  onClose,
  onSuccess,
}: ExportReportDialogProps) {
  const task = useTask();

  const reportLoaded = !loading && !reportError && report !== null;
  const hasData = reportLoaded && report.items.length > 0;
  const isEmpty = reportLoaded && report.items.length === 0;
  const reportUnavailable = !loading && !reportError && report === null;
  const noDataError =
    'Không có dữ liệu trong khoảng thời gian đã chọn để xuất file!';

  const handleConfirm = async () => {
    if (!hasData) return;
    const ok = await task.run(async () => {
      await download(
        '/reports/revenue/export?' +
          query({
            period,
            date,
            format,
          }),
        `me-ca-phe-${date}.${format}`,
      );
    });
    if (!ok) {
      return;
    }
    onSuccess();
  };

  return (
    <Modal
      title="Xuất báo cáo"
      onClose={onClose}
      busy={task.pending}
      className="reports-export-modal"
    >
      <div className="export-dialog">
        <div className="export-format">
          <fieldset>
            <legend>Định dạng tệp</legend>
            <div className="export-format-options">
              <label className="export-radio">
                <input
                  type="radio"
                  name="export-format"
                  value="xlsx"
                  checked={format === 'xlsx'}
                  onChange={() => onFormatChange('xlsx')}
                />
                Excel
              </label>
              <label className="export-radio">
                <input
                  type="radio"
                  name="export-format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => onFormatChange('pdf')}
                />
                PDF
              </label>
            </div>
          </fieldset>
        </div>

        {loading && (
          <div className="export-report-loading" role="status">
            Đang tải dữ liệu báo cáo…
          </div>
        )}

        {(reportError || reportUnavailable) && (
          <div className="export-report-state" role="alert">
            <span>
              {reportError ||
                'Không thể tải dữ liệu báo cáo. Vui lòng thử lại.'}
            </span>
            <Button onClick={onRetryReport}>Tải lại dữ liệu báo cáo</Button>
          </div>
        )}

        {reportLoaded && (
          <div className="export-preview">
            <div className="export-preview-row">
              <span>Khoảng thời gian báo cáo</span>
              <strong>{reportPeriodLabel(period, date)}</strong>
            </div>
            <div className="export-preview-row">
              <span>Tổng doanh thu</span>
              <strong>{money(report.doanh_thu)}</strong>
            </div>
            <div className="export-preview-row">
              <span>Số ly bán ra</span>
              <strong>{report.so_ly}</strong>
            </div>
            <div className="export-preview-row">
              <span>Tiền mặt</span>
              <strong>{money(report.tien_mat)}</strong>
            </div>
            <div className="export-preview-row">
              <span>Chuyển khoản</span>
              <strong>{money(report.chuyen_khoan)}</strong>
            </div>
          </div>
        )}

        {isEmpty && (
          <div className="export-empty-state" role="alert">
            {noDataError}
          </div>
        )}

        <ErrorMessage message={task.error} />
      </div>

      <footer className="dialog-actions export-dialog-actions">
        <Button
          variant="primary"
          disabled={task.pending || loading || Boolean(reportError) || !hasData}
          onClick={handleConfirm}
        >
          {task.pending ? 'Đang xuất…' : 'Xác nhận'}
        </Button>
      </footer>
    </Modal>
  );
}
