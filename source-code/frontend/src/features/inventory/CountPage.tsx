import { useEffect, useState } from 'react';
import { useSession } from '../../app/auth';
import { useDataStore, useResource, useTask } from '../../app/data';
import {
  addDays,
  dateText,
  money,
  numberText,
  shiftText,
  shiftTime,
  stockDifference,
  today,
} from '../../app/format';
import { useRouter } from '../../app/router';
import { api, ApiError } from '../../services/api';
import type {
  CalendarData,
  ClosingReport,
  CountPreview,
} from '../../services/models';
import {
  Button,
  DataTable,
  ErrorMessage,
  Field,
  Loading,
  PageHeader,
  Panel,
  SelectField,
  TextField,
  useNotice,
} from '../../components/ui';
import { ClosingDetails } from './ClosingPage';

type Entry = { actual: string; reason: string; note: string };
type CountPayload = {
  ma_ca: string;
  tien_mat_thuc_thu: number;
  chuyen_khoan_thuc_thu: number;
  ly_do_chenh_lech_tien?: string;
  items: {
    ma_nguyen_lieu: string;
    ton_ly_thuyet: number;
    ton_thuc_te: number;
    ly_do_chenh_lech?: string;
    ghi_chu?: string;
  }[];
};
type PendingCount = {
  shiftId: string;
  countId?: string;
  requestKey: string;
  payload: CountPayload;
};
function previewSignature(preview: CountPreview | null) {
  if (!preview) return '';
  const items = preview.items
    .map(
      (item) =>
        [
          item.ma_nguyen_lieu,
          Number(item.ton_ly_thuyet),
          Number(item.nguong_chenh_lech),
        ] as const,
    )
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([preview.ma_ca, Number(preview.doanh_thu), items]);
}
export default function CountPage() {
  const { user } = useSession();
  const { go } = useRouter();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const task = useTask();
  const storageKey = 'me-cafe-pending-count:' + user!.ma_nguoi_dung;
  const calendar = useResource<CalendarData>(
    `/shifts?from=${addDays(today(), -30)}&to=${today()}`,
    { shifts: [], registrations: [] },
  );
  const reports = useResource<ClosingReport[]>('/inventory/close-reports', []);
  const [shiftId, setShiftId] = useState('');
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [cash, setCash] = useState('');
  const [transfer, setTransfer] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [checkedPreview, setCheckedPreview] = useState<CountPreview | null>(
    null,
  );
  const [createdReport, setCreatedReport] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<PendingCount | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    } catch {
      return null;
    }
  });
  const counted = new Set(reports.data.map((report) => report.ma_ca));
  const shifts = calendar.data.shifts
    .filter(
      (shift) =>
        shiftTime(shift, true) <= Date.now() && !counted.has(shift.ma_ca),
    )
    .sort((a, b) => shiftTime(b, true) - shiftTime(a, true));
  const selected = calendar.data.shifts.find(
    (shift) => shift.ma_ca === shiftId,
  );
  const preview = useResource<CountPreview | null>(
    shiftId ? '/inventory/counts/preview?ma_ca=' + shiftId : null,
    null,
  );
  const checked =
    checkedPreview !== null &&
    previewSignature(checkedPreview) === previewSignature(preview.data);
  const setChecked = (value: boolean) =>
    setCheckedPreview(value ? preview.data : null);
  useEffect(() => {
    if (!shiftId && !calendar.loading && !reports.loading)
      setShiftId(pendingCount?.shiftId ?? shifts[0]?.ma_ca ?? '');
  }, [calendar.loading, reports.loading, shiftId, pendingCount]);
  useEffect(() => {
    if (pendingCount)
      sessionStorage.setItem(storageKey, JSON.stringify(pendingCount));
    else sessionStorage.removeItem(storageKey);
  }, [pendingCount, storageKey]);
  const changeShift = (value: string) => {
    setShiftId(value);
    setEntries({});
    setCash('');
    setTransfer('');
    setCashReason('');
    setChecked(false);
    task.setError('');
  };
  const changeEntry = (id: string, field: keyof Entry, value: string) => {
    setChecked(false);
    setEntries((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? { actual: '', reason: '', note: '' }),
        [field]: value,
      },
    }));
  };
  const cashDifference =
    Number(cash) + Number(transfer) - Number(preview.data?.doanh_thu ?? 0);
  const invalidNumber = (value: string) =>
    value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0;
  const reconcile = () => {
    task.setError('');
    if (
      !preview.data?.items.length ||
      invalidNumber(cash) ||
      invalidNumber(transfer) ||
      preview.data.items.some((item) =>
        invalidNumber(entries[item.ma_nguyen_lieu]?.actual ?? ''),
      )
    ) {
      task.setError(
        'Vui lòng nhập đầy đủ tiền thực thu và tồn thực tế hợp lệ.',
      );
      return;
    }
    if (
      !Number.isInteger(Number(cash)) ||
      !Number.isInteger(Number(transfer))
    ) {
      task.setError('Số tiền phải là số nguyên không âm.');
      return;
    }
    if (cashDifference !== 0 && !cashReason.trim()) {
      task.setError('Vui lòng nhập lý do chênh lệch tiền.');
      return;
    }
    for (const item of preview.data.items) {
      const entry = entries[item.ma_nguyen_lieu];
      const different =
        Math.abs(stockDifference(entry.actual, item.ton_ly_thuyet)) >
        Number(item.nguong_chenh_lech);
      if (different && !entry.reason) {
        task.setError('Vui lòng chọn lý do cho nguyên liệu lệch vượt ngưỡng.');
        return;
      }
      if (different && entry.reason === 'Khác' && !entry.note.trim()) {
        task.setError('Vui lòng nhập ghi chú cho lý do Khác.');
        return;
      }
    }
    setChecked(true);
  };
  const save = () =>
    void task.run(async () => {
      let pending = pendingCount;
      if (!pending) {
        if (!checked || !preview.data)
          throw new Error(
            'Vui lòng đối chiếu lại trước khi lưu phiếu kiểm kho.',
          );
        const payload: CountPayload = {
          ma_ca: shiftId,
          tien_mat_thuc_thu: Number(cash),
          chuyen_khoan_thuc_thu: Number(transfer),
          ...(cashDifference
            ? { ly_do_chenh_lech_tien: cashReason.trim() }
            : {}),
          items: preview.data.items.map((item) => {
            const entry = entries[item.ma_nguyen_lieu];
            const different =
              Math.abs(stockDifference(entry.actual, item.ton_ly_thuyet)) >
              Number(item.nguong_chenh_lech);
            return {
              ma_nguyen_lieu: item.ma_nguyen_lieu,
              ton_ly_thuyet: Number(item.ton_ly_thuyet),
              ton_thuc_te: Number(entry.actual),
              ...(different
                ? {
                    ly_do_chenh_lech: entry.reason,
                    ...(entry.reason === 'Khác'
                      ? { ghi_chu: entry.note.trim() }
                      : {}),
                  }
                : {}),
            };
          }),
        };
        pending = { shiftId, requestKey: crypto.randomUUID(), payload };
        sessionStorage.setItem(storageKey, JSON.stringify(pending));
        setPendingCount(pending);
      }
      if (!pending.countId) {
        try {
          const count = await api<{ ma_phieu: string }>('/inventory/counts', {
            method: 'POST',
            key: pending.requestKey,
            body: pending.payload,
          });
          pending = { ...pending, countId: count.ma_phieu };
          sessionStorage.setItem(storageKey, JSON.stringify(pending));
          setPendingCount(pending);
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            sessionStorage.removeItem(storageKey);
            setPendingCount(null);
            setChecked(false);
          }
          throw error;
        }
      }
      const report = await api<ClosingReport>('/inventory/close-reports', {
        method: 'POST',
        body: { ma_phieu: pending.countId },
      });
      sessionStorage.removeItem(storageKey);
      setPendingCount(null);
      setCreatedReport(report.ma_bao_cao);
      refresh();
      notice('Lưu phiếu kiểm kho thành công.');
    });
  return (
    <>
      <PageHeader title="Kiểm kê nguyên liệu" />
      <Loading
        active={calendar.loading || reports.loading || preview.loading}
      />
      <ErrorMessage
        message={calendar.error || reports.error || preview.error}
      />
      {!shifts.length &&
      !pendingCount &&
      !calendar.loading &&
      !reports.loading ? (
        <Panel>
          <p>Chưa có ca làm đã kết thúc cần kiểm kê.</p>
          <Button onClick={() => go('closing')}>Báo cáo cuối ca</Button>
        </Panel>
      ) : (
        <>
          <Panel className="count-metadata-panel">
            <div className="metadata-grid">
              <div>
                <p className="muted">Mã phiếu</p>
                <strong>{pendingCount?.countId?.slice(0, 8) ?? '—'}</strong>
              </div>
              <SelectField
                label="Ca"
                value={shiftId}
                disabled={task.pending || Boolean(pendingCount)}
                onChange={(event) => changeShift(event.target.value)}
              >
                <option value="">Chọn ca làm</option>
                {shifts.map((shift) => (
                  <option key={shift.ma_ca} value={shift.ma_ca}>
                    {shiftText(shift)}
                  </option>
                ))}
              </SelectField>
              <div>
                <p className="muted">Ngày</p>
                <strong>{dateText(today())}</strong>
              </div>
              <div>
                <p className="muted">Người kiểm kê</p>
                <strong>{user!.ho_ten}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Đối chiếu tiền" className="count-money-panel">
            <fieldset disabled={task.pending || Boolean(pendingCount)}>
              <div className="money-reconciliation-grid">
                <Field
                  label="Doanh số trên hệ thống"
                  value={money(preview.data?.doanh_thu)}
                  readOnly
                />
                <Field
                  label="Tiền mặt thực thu"
                  type="number"
                  min={0}
                  max={99999999999999}
                  step={1}
                  value={cash}
                  onChange={(event) => {
                    setCash(event.target.value);
                    setChecked(false);
                  }}
                  required
                />
                <Field
                  label="Chuyển khoản thực thu"
                  type="number"
                  min={0}
                  max={99999999999999}
                  step={1}
                  value={transfer}
                  onChange={(event) => {
                    setTransfer(event.target.value);
                    setChecked(false);
                  }}
                  required
                />
                <Field
                  label="Chênh lệch tiền"
                  value={checked ? money(cashDifference) : ''}
                  readOnly
                />
              </div>
              <TextField
                label="Lý do chênh lệch tiền"
                value={cashReason}
                onChange={(value) => {
                  setCashReason(value);
                  setChecked(false);
                }}
              />
            </fieldset>
          </Panel>
          <Panel title="Nguyên liệu" className="count-stock-panel">
            <fieldset disabled={task.pending || Boolean(pendingCount)}>
              <DataTable
                rows={preview.data?.items ?? []}
                rowKey={(item) => item.ma_nguyen_lieu}
                columns={[
                  {
                    key: 'code',
                    label: 'Mã nguyên liệu',
                    render: (item) => item.ma_nguyen_lieu.slice(0, 8),
                  },
                  {
                    key: 'name',
                    label: 'Tên nguyên liệu',
                    render: (item) => item.ten_nguyen_lieu,
                  },
                  {
                    key: 'unit',
                    label: 'Đơn vị tính',
                    render: (item) => item.don_vi_tinh,
                  },
                  {
                    key: 'theoretical',
                    label: 'Tồn lý thuyết',
                    render: (item) => numberText(item.ton_ly_thuyet),
                  },
                  {
                    key: 'actual',
                    label: 'Tồn thực tế',
                    render: (item) => (
                      <Field
                        label={`Tồn thực tế ${item.ten_nguyen_lieu}`}
                        type="number"
                        min={0}
                        step="0.001"
                        value={entries[item.ma_nguyen_lieu]?.actual ?? ''}
                        onChange={(event) =>
                          changeEntry(
                            item.ma_nguyen_lieu,
                            'actual',
                            event.target.value,
                          )
                        }
                        required
                      />
                    ),
                  },
                  {
                    key: 'difference',
                    label: 'Chênh lệch',
                    render: (item) =>
                      checked
                        ? numberText(
                            stockDifference(
                              entries[item.ma_nguyen_lieu]?.actual,
                              item.ton_ly_thuyet,
                            ),
                          )
                        : '—',
                  },
                  {
                    key: 'reason',
                    label: 'Lý do chênh lệch',
                    render: (item) => (
                      <>
                        <SelectField
                          label={`Lý do chênh lệch ${item.ten_nguyen_lieu}`}
                          value={entries[item.ma_nguyen_lieu]?.reason ?? ''}
                          onChange={(event) =>
                            changeEntry(
                              item.ma_nguyen_lieu,
                              'reason',
                              event.target.value,
                            )
                          }
                        >
                          <option value="">—</option>
                          {['Hao hụt', 'Đổ vỡ', 'Hết hạn', 'Khác'].map(
                            (reason) => (
                              <option key={reason}>{reason}</option>
                            ),
                          )}
                        </SelectField>
                        {entries[item.ma_nguyen_lieu]?.reason === 'Khác' && (
                          <TextField
                            label={`Ghi chú ${item.ten_nguyen_lieu}`}
                            value={entries[item.ma_nguyen_lieu]?.note ?? ''}
                            onChange={(value) =>
                              changeEntry(item.ma_nguyen_lieu, 'note', value)
                            }
                            required
                          />
                        )}
                      </>
                    ),
                  },
                ]}
              />
            </fieldset>
            <ErrorMessage message={task.error} />
            {checked && (
              <p role="status">Đã đối chiếu tiền thực thu và tồn thực tế.</p>
            )}
            <div className="ui-actions">
              <Button
                onClick={reconcile}
                disabled={
                  task.pending || !preview.data || Boolean(pendingCount)
                }
              >
                Đối chiếu
              </Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={task.pending || (!checked && !pendingCount)}
              >
                Lưu phiếu kiểm kho
              </Button>
            </div>
          </Panel>
        </>
      )}
      {createdReport && (
        <ClosingDetails
          id={createdReport}
          onClose={() => {
            setCreatedReport(null);
            go('closing');
          }}
        />
      )}
      <p className="breadcrumb">KHO / KIỂM KÊ NGUYÊN LIỆU</p>
    </>
  );
}
