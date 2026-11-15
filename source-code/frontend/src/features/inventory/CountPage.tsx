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
  timeText,
  stockDifference,
  shortId,
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
  ErrorMessage,
  Field,
  Loading,
  PageHeader,
  Pagination,
  Panel,
  SelectField,
  useNotice,
} from '../../components/ui';
import { ClosingDetails } from './ClosingPage';
import './count-page.css';

type Entry = { actual: string; reason: string; note: string };
type EntryValidation = Partial<Record<keyof Entry, boolean>>;
type CountValidation = {
  cash?: boolean;
  transfer?: boolean;
  cashReason?: boolean;
  entries: Record<string, EntryValidation>;
  moneyMessage?: string;
  stockMessage?: string;
};
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

const MAX_COUNT_MONEY = 99_999_999_999_999;
const MAX_COUNT_QUANTITY = 99_999_999_999.999;
const COUNT_PAGE_SIZE = 6;

function emptyCountValidation(): CountValidation {
  return { entries: {} };
}

function moneyError(value: string, label: string) {
  if (!value.trim()) return `Vui lòng nhập ${label.toLocaleLowerCase('vi-VN')}.`;
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0)
    return 'Tiền thực thu phải là số nguyên không âm.';
  if (amount > MAX_COUNT_MONEY)
    return 'Tiền thực thu vượt quá giới hạn cho phép.';
  return '';
}

function hasAllowedPrecision(value: string, places: number) {
  const [mantissa, exponentText = '0'] = value.toLowerCase().split('e');
  const exponent = Number(exponentText);
  const fractionLength = mantissa.split('.')[1]?.length ?? 0;
  return Number.isFinite(exponent) && fractionLength - exponent <= places;
}

function quantityError(value: string, name: string) {
  if (!value.trim())
    return `Vui lòng nhập tồn thực tế cho nguyên liệu ${name}.`;
  const quantity = Number(value);
  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > MAX_COUNT_QUANTITY ||
    !hasAllowedPrecision(value, 3)
  )
    return 'Tồn thực tế phải là số không âm, tối đa 3 chữ số thập phân.';
  return '';
}

function exceedsThreshold(difference: number, threshold: unknown) {
  return Math.abs(Math.round(difference * 1000)) >
    Math.round(Number(threshold) * 1000);
}

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
  const [countPage, setCountPage] = useState(1);
  const [checkedPreview, setCheckedPreview] = useState<CountPreview | null>(
    null,
  );
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [validation, setValidation] = useState<CountValidation>(
    emptyCountValidation,
  );
  const [createdReport, setCreatedReport] = useState<string | null>(null);
  const [savedCountId, setSavedCountId] = useState<string | null>(null);
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
  const setChecked = (value: boolean) => {
    if (value) {
      setCheckedPreview(preview.data);
      setNeedsReconciliation(false);
    } else {
      if (checkedPreview !== null) setNeedsReconciliation(true);
      setCheckedPreview(null);
    }
  };
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
    setCountPage(1);
    setEntries({});
    setCash('');
    setTransfer('');
    setCashReason('');
    setCheckedPreview(null);
    setNeedsReconciliation(false);
    setValidation(emptyCountValidation());
    setSavedCountId(null);
    task.setError('');
  };
  const changeEntry = (id: string, field: keyof Entry, value: string) => {
    setChecked(false);
    setValidation(emptyCountValidation());
    task.setError('');
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
  const overThresholdCount =
    preview.data?.items.filter((item) => {
      const actual = entries[item.ma_nguyen_lieu]?.actual ?? '';
      return (
        !quantityError(actual, item.ten_nguyen_lieu) &&
        exceedsThreshold(
          stockDifference(actual, item.ton_ly_thuyet),
          item.nguong_chenh_lech,
        )
      );
    }).length ?? 0;
  const exactMatch =
    preview.data !== null &&
    cashDifference === 0 &&
    preview.data.items.every((item) => {
      const actual = entries[item.ma_nguyen_lieu]?.actual ?? '';
      return (
        actual !== '' &&
        !quantityError(actual, item.ten_nguyen_lieu) &&
        stockDifference(actual, item.ton_ly_thuyet) === 0
      );
    });
  const clearValidation = () => {
    setChecked(false);
    setValidation(emptyCountValidation());
    task.setError('');
  };
  const reconcile = () => {
    task.setError('');
    setNeedsReconciliation(false);
    if (!preview.data) return;
    const nextValidation = emptyCountValidation();
    const cashInputError = moneyError(cash, 'tiền mặt thực thu');
    const transferInputError = moneyError(transfer, 'chuyển khoản thực thu');
    if (cashInputError) {
      nextValidation.cash = true;
      nextValidation.moneyMessage = cashInputError;
    }
    if (transferInputError) {
      nextValidation.transfer = true;
      nextValidation.moneyMessage ??= transferInputError;
    }
    if (!cashInputError && !transferInputError && cashDifference !== 0) {
      if (!cashReason.trim()) {
        nextValidation.cashReason = true;
        nextValidation.moneyMessage =
          'Tiền thực thu lệch so với doanh số trên hệ thống.';
      } else if (cashReason.trim().length > 500) {
        nextValidation.cashReason = true;
        nextValidation.moneyMessage =
          'Lý do chênh lệch tiền không được vượt quá 500 ký tự.';
      }
    }

    let hasStockError = false;
    for (const item of preview.data.items) {
      const entry = entries[item.ma_nguyen_lieu] ?? {
        actual: '',
        reason: '',
        note: '',
      };
      const actualError = quantityError(entry.actual, item.ten_nguyen_lieu);
      if (actualError) {
        nextValidation.entries[item.ma_nguyen_lieu] = { actual: true };
        nextValidation.stockMessage ??= actualError;
        hasStockError = true;
        continue;
      }
      const difference = stockDifference(entry.actual, item.ton_ly_thuyet);
      const different = exceedsThreshold(
        difference,
        item.nguong_chenh_lech,
      );
      if (different && !entry.reason) {
        nextValidation.entries[item.ma_nguyen_lieu] = { reason: true };
        nextValidation.stockMessage ??= `Vui lòng chọn lý do chênh lệch cho nguyên liệu ${item.ten_nguyen_lieu}.`;
        hasStockError = true;
      } else if (!different && entry.reason) {
        nextValidation.entries[item.ma_nguyen_lieu] = { reason: true };
        nextValidation.stockMessage ??=
          'Nguyên liệu khớp không cần lý do chênh lệch.';
        hasStockError = true;
      }
      if (different && entry.reason === 'Khác' && !entry.note.trim()) {
        nextValidation.entries[item.ma_nguyen_lieu] = {
          ...nextValidation.entries[item.ma_nguyen_lieu],
          note: true,
        };
        nextValidation.stockMessage ??=
          'Vui lòng nhập ghi chú cho lý do Khác.';
        hasStockError = true;
      } else if (
        different &&
        entry.reason === 'Khác' &&
        entry.note.trim().length > 500
      ) {
        nextValidation.entries[item.ma_nguyen_lieu] = {
          ...nextValidation.entries[item.ma_nguyen_lieu],
          note: true,
        };
        nextValidation.stockMessage ??=
          'Ghi chú không được vượt quá 500 ký tự.';
        hasStockError = true;
      }
    }
    setValidation(nextValidation);
    if (
      cashInputError ||
      transferInputError ||
      nextValidation.cashReason ||
      hasStockError
    )
      return;
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
            const different = exceedsThreshold(
              stockDifference(entry.actual, item.ton_ly_thuyet),
              item.nguong_chenh_lech,
            );
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
          setSavedCountId(count.ma_phieu);
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
      setSavedCountId(pending.countId ?? null);
      sessionStorage.removeItem(storageKey);
      setPendingCount(null);
      setCreatedReport(report.ma_bao_cao);
      refresh();
      notice('Lưu phiếu kiểm kho thành công.', 'inventory-success');
    });
  const formShifts =
    pendingCount && selected && !shifts.some((shift) => shift.ma_ca === shiftId)
      ? [selected, ...shifts]
      : shifts;
  const hasEndedShift = calendar.data.shifts.some(
    (shift) => shiftTime(shift, true) <= Date.now(),
  );
  const countTotalPages = preview.data
    ? Math.max(1, Math.ceil(preview.data.items.length / COUNT_PAGE_SIZE))
    : 1;
  const countRows = preview.data
    ? preview.data.items.slice(
        (countPage - 1) * COUNT_PAGE_SIZE,
        countPage * COUNT_PAGE_SIZE,
      )
    : [];
  useEffect(() => {
    setCountPage(1);
  }, [shiftId, preview.data?.ma_ca]);
  const canShowCashDifference =
    !moneyError(cash, 'tiền mặt thực thu') &&
    !moneyError(transfer, 'chuyển khoản thực thu');
  const formAvailable = shifts.length > 0 || Boolean(pendingCount);

  return (
    <div className="inventory-count-page">
      <p className="breadcrumb">KHO / KIỂM KÊ NGUYÊN LIỆU</p>
      <PageHeader title="Kiểm kê nguyên liệu" />

      {calendar.loading || reports.loading ? (
        <Panel className="count-page-state">
          <Loading active />
        </Panel>
      ) : calendar.error || reports.error ? (
        <Panel title="Không tải được dữ liệu" className="count-page-state">
          <ErrorMessage message={calendar.error || reports.error} />
          <div className="ui-actions">
            <Button
              onClick={() => {
                calendar.refresh();
                reports.refresh();
              }}
            >
              Tải lại
            </Button>
          </div>
        </Panel>
      ) : !formAvailable ? (
        <Panel className="count-page-state">
          <p>
            {hasEndedShift
              ? 'Ca này đã có phiếu kiểm kho.'
              : 'Chưa có ca làm đã kết thúc cần kiểm kê.'}
          </p>
          {!hasEndedShift && (
            <Button onClick={() => go('closing')}>Báo cáo cuối ca</Button>
          )}
        </Panel>
      ) : (
        <>
          <Panel className="count-page-meta">
            <div className="count-page-meta-grid">
              <div className="count-page-meta-item">
                <span>Mã phiếu</span>
                <strong>{shortId(savedCountId ?? pendingCount?.countId)}</strong>
              </div>
              <div className="count-page-meta-item">
                <span>Ngày</span>
                <strong>{dateText(selected?.ngay_lam)}</strong>
              </div>
              {formShifts.length === 1 && selected ? (
                <div className="count-page-meta-item">
                  <span>Ca</span>
                  <strong>{timeText(selected.gio_bat_dau)}–{timeText(selected.gio_ket_thuc)}</strong>
                </div>
              ) : (
                <SelectField
                  label="Ca"
                  value={shiftId}
                  disabled={task.pending || Boolean(pendingCount)}
                  onChange={(event) => changeShift(event.target.value)}
                >
                  <option value="">Chọn ca làm</option>
                  {formShifts.map((shift) => (
                    <option key={shift.ma_ca} value={shift.ma_ca}>
                      {shiftText(shift)}
                    </option>
                  ))}
                </SelectField>
              )}
              <div className="count-page-meta-item">
                <span>Người kiểm kê</span>
                <strong>{user!.ho_ten}</strong>
              </div>
            </div>
          </Panel>

          {!shiftId ? (
            <Panel className="count-page-state">
              <p>Chọn ca đã kết thúc để tải dữ liệu kiểm kê.</p>
            </Panel>
          ) : preview.loading ? (
            <Panel title="Đang tải dữ liệu kiểm kê" className="count-page-state">
              <Loading active />
            </Panel>
          ) : preview.error ? (
            <Panel title="Không tải được dữ liệu" className="count-page-state">
              <ErrorMessage message={preview.error} />
              <div className="ui-actions">
                <Button onClick={preview.refresh}>Tải lại</Button>
                {pendingCount && (
                  <Button variant="primary" onClick={save} disabled={task.pending}>
                    Lưu phiếu kiểm kho
                  </Button>
                )}
              </div>
            </Panel>
          ) : !preview.data ? (
            <Panel className="count-page-state">
              <p>Chưa có dữ liệu đối chiếu.</p>
              <div className="ui-actions">
                <Button onClick={preview.refresh}>Tải lại</Button>
                {pendingCount && (
                  <Button variant="primary" onClick={save} disabled={task.pending}>
                    Lưu phiếu kiểm kho
                  </Button>
                )}
              </div>
            </Panel>
          ) : !preview.data.items.length ? (
            <Panel className="count-page-state">
              <p>Không có nguyên liệu đang hoạt động để kiểm kê.</p>
            </Panel>
          ) : (
            <>
              <Panel title="Đối chiếu tiền" className="count-page-money">
                <fieldset disabled={task.pending || Boolean(pendingCount)}>
                  <div className="count-page-money-grid">
                    <div
                      className="count-readonly-value"
                      role="group"
                      aria-label="Doanh số hệ thống"
                    >
                      <span>Doanh số hệ thống</span>
                      <strong>{money(preview.data.doanh_thu)}</strong>
                    </div>
                    <Field
                      label="Tiền mặt thực thu"
                      type="number"
                      min={0}
                      max={MAX_COUNT_MONEY}
                      step={1}
                      value={cash}
                      className={validation.cash ? 'is-invalid' : ''}
                      aria-invalid={Boolean(validation.cash)}
                      onChange={(event) => {
                        setCash(event.target.value);
                        clearValidation();
                      }}
                      required
                    />
                    <Field
                      label="Chuyển khoản thực thu"
                      type="number"
                      min={0}
                      max={MAX_COUNT_MONEY}
                      step={1}
                      value={transfer}
                      className={validation.transfer ? 'is-invalid' : ''}
                      aria-invalid={Boolean(validation.transfer)}
                      onChange={(event) => {
                        setTransfer(event.target.value);
                        clearValidation();
                      }}
                      required
                    />
                    <div
                      className="count-readonly-value count-money-difference"
                      role="group"
                      aria-label="Chênh lệch tiền"
                    >
                      <span>Chênh lệch tiền</span>
                      <strong
                        className={
                          canShowCashDifference && cashDifference < 0
                            ? 'is-negative'
                            : ''
                        }
                      >
                        {canShowCashDifference ? money(cashDifference) : '—'}
                      </strong>
                    </div>
                    <label className="ui-field count-cash-reason">
                      <span>Lý do chênh lệch tiền</span>
                      <input
                        type="text"
                        value={cashReason}
                        maxLength={500}
                        className={
                          validation.cashReason ? 'is-invalid' : ''
                        }
                        aria-invalid={Boolean(validation.cashReason)}
                        onChange={(event) => {
                          setCashReason(event.target.value);
                          setChecked(false);
                          task.setError('');
                        }}
                      />
                    </label>
                  </div>
                </fieldset>
                {validation.moneyMessage && (
                  <p className="count-validation-message" role="alert">
                    {validation.moneyMessage}
                  </p>
                )}
              </Panel>

              <Panel title="Nguyên liệu" className="count-page-materials">
                <fieldset disabled={task.pending || Boolean(pendingCount)}>
                  <div className="count-page-table-scroll">
                    <table className="count-page-table">
                      <thead>
                        <tr>
                          <th scope="col">Mã nguyên liệu</th>
                          <th scope="col">Tên nguyên liệu</th>
                          <th scope="col">Đơn vị tính</th>
                          <th scope="col">Tồn lý thuyết</th>
                          <th scope="col">Tồn thực tế</th>
                          <th scope="col">Chênh lệch</th>
                          <th scope="col">Lý do chênh lệch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countRows.map((item) => {
                          const entry = entries[item.ma_nguyen_lieu] ?? {
                            actual: '',
                            reason: '',
                            note: '',
                          };
                          const rowValidation =
                            validation.entries[item.ma_nguyen_lieu] ?? {};
                          const actualInvalid = Boolean(
                            quantityError(entry.actual, item.ten_nguyen_lieu),
                          );
                          const difference = actualInvalid
                            ? null
                            : stockDifference(
                                entry.actual,
                                item.ton_ly_thuyet,
                              );
                          const overThreshold =
                            difference !== null &&
                            exceedsThreshold(
                              difference,
                              item.nguong_chenh_lech,
                            );
                          return (
                            <tr
                              key={item.ma_nguyen_lieu}
                              className={
                                overThreshold ? 'is-over-threshold' : ''
                              }
                            >
                              <td data-label="Mã nguyên liệu">
                                {shortId(item.ma_nguyen_lieu)}
                              </td>
                              <td data-label="Tên nguyên liệu">
                                {item.ten_nguyen_lieu}
                              </td>
                              <td data-label="Đơn vị tính">
                                {item.don_vi_tinh}
                              </td>
                              <td data-label="Tồn lý thuyết">
                                {numberText(item.ton_ly_thuyet)}
                              </td>
                              <td data-label="Tồn thực tế">
                                <Field
                                  label={`Tồn thực tế ${item.ten_nguyen_lieu}`}
                                  type="number"
                                  min={0}
                                  max={MAX_COUNT_QUANTITY}
                                  step="0.001"
                                  value={entry.actual}
                                  className={
                                    rowValidation.actual ? 'is-invalid' : ''
                                  }
                                  aria-invalid={Boolean(rowValidation.actual)}
                                  onChange={(event) =>
                                    changeEntry(
                                      item.ma_nguyen_lieu,
                                      'actual',
                                      event.target.value,
                                    )
                                  }
                                  required
                                />
                              </td>
                              <td
                                data-label="Chênh lệch"
                                className={
                                  difference !== null && difference < 0
                                    ? 'is-negative'
                                    : ''
                                }
                              >
                                {difference === null
                                  ? '—'
                                  : `${difference > 0 ? '+' : ''}${numberText(difference)}`}
                              </td>
                              <td data-label="Lý do chênh lệch">
                                <SelectField
                                  label={`Lý do chênh lệch ${item.ten_nguyen_lieu}`}
                                  value={entry.reason}
                                  className={
                                    rowValidation.reason ? 'is-invalid' : ''
                                  }
                                  aria-invalid={Boolean(rowValidation.reason)}
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
                                {entry.reason === 'Khác' && (
                                  <label className="ui-field count-note-field">
                                    <span>Ghi chú:</span>
                                    <textarea
                                      value={entry.note}
                                      maxLength={500}
                                      rows={1}
                                      aria-label={`Ghi chú ${item.ten_nguyen_lieu}`}
                                      aria-invalid={Boolean(rowValidation.note)}
                                      className={
                                        rowValidation.note
                                          ? 'is-invalid'
                                          : ''
                                      }
                                      onChange={(event) =>
                                        changeEntry(
                                          item.ma_nguyen_lieu,
                                          'note',
                                          event.target.value,
                                        )
                                      }
                                      required
                                    />
                                  </label>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {countTotalPages > 1 && (
                    <Pagination
                      page={countPage}
                      hasMore={countPage < countTotalPages}
                      onChange={(nextPage) =>
                        setCountPage(
                          Math.min(Math.max(1, nextPage), countTotalPages),
                        )
                      }
                    />
                  )}
                </fieldset>
                {validation.stockMessage && (
                  <p className="count-validation-message" role="alert">
                    {validation.stockMessage}
                  </p>
                )}
                {!validation.stockMessage &&
                  overThresholdCount > 0 &&
                  !needsReconciliation &&
                  !checked && (
                    <p className="count-validation-message" role="status">
                      Có {overThresholdCount} nguyên liệu lệch vượt ngưỡng cho
                      phép.
                    </p>
                  )}
                {needsReconciliation && !checked && (
                  <p className="count-recheck-message" role="alert">
                    Vui lòng đối chiếu lại.
                  </p>
                )}
                {checked && (
                  <p className="count-success-message" role="status">
                    {exactMatch
                      ? 'Tiền thực thu và tồn thực tế đều khớp.'
                      : 'Đã đối chiếu tiền thực thu và tồn thực tế.'}
                  </p>
                )}
                <ErrorMessage message={task.error} />
              </Panel>
              <div className="ui-actions count-page-actions">
                <Button
                  onClick={reconcile}
                  disabled={task.pending || Boolean(pendingCount)}
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
            </>
          )}
          {task.error && !preview.data && <ErrorMessage message={task.error} />}
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
    </div>
  );
}
