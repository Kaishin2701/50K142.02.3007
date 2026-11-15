import { useState } from 'react';
import { useDataStore, useResource, useTask } from '../../app/data';
import { dateText, shiftTime, timeText } from '../../app/format';
import { api } from '../../services/api';
import type { Candidate, Shift } from '../../services/models';
import {
  Badge,
  Button,
  ErrorMessage,
  Loading,
  Modal,
  useNotice,
} from '../../components/ui';

export function AssignmentDialog({
  shift,
  onClose,
}: {
  shift: Shift;
  onClose(): void;
}) {
  const candidates = useResource<Candidate[]>(
    `/shifts/${shift.ma_ca}/candidates`,
    [],
  );
  const initialSelection = shift.nhan_vien.map(
    (person) => person.ma_nhan_vien,
  );
  const [selected, setSelected] = useState(initialSelection);
  const [validationError, setValidationError] = useState('');
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const readonly = shiftTime(shift) <= Date.now();
  const candidateIds = new Set(
    candidates.data.map((person) => person.ma_nguoi_dung),
  );
  const missingAssignments = shift.nhan_vien.filter(
    (person) => !candidateIds.has(person.ma_nhan_vien),
  );
  const choices = [
    ...candidates.data.map((person) => ({
      id: person.ma_nguoi_dung,
      name: person.ho_ten,
      status: person.loai_dang_ky,
      assignedOnly: false,
    })),
    ...missingAssignments.map((person) => ({
      id: person.ma_nhan_vien,
      name: person.ho_ten,
      status: 'Đã phân công',
      assignedOnly: true,
    })),
  ];
  const hasChanges =
    selected.length !== initialSelection.length ||
    initialSelection.some((id) => !selected.includes(id));
  const showSave =
    candidates.loading ||
    Boolean(candidates.error) ||
    candidates.data.length > 0;
  const toggle = (id: string) => {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
    setValidationError('');
    task.setError('');
  };
  const save = () => {
    if (!selected.length) {
      setValidationError(
        initialSelection.length
          ? 'Ca làm cần có ít nhất 1 nhân viên được phân công.'
          : 'Vui lòng chọn nhân viên cần phân công',
      );
      return;
    }
    if (selected.length > shift.so_nhan_vien_toi_da) {
      setValidationError(
        'Số nhân viên được phân công không được vượt quá số lượng tối đa của ca',
      );
      return;
    }
    setValidationError('');
    void task.run(async () => {
      await api(`/shifts/${shift.ma_ca}/assignments`, {
        method: 'PUT',
        body: { ma_nhan_vien: selected },
      });
      refresh();
      onClose();
      notice('Phân công ca làm thành công.', 'shift-assignment-success');
    });
  };
  return (
    <Modal
      title="Phân công nhân viên cho ca làm"
      onClose={onClose}
      busy={task.pending}
      className="assignment-modal"
    >
      <div className="dialog-body assignment-body">
        <dl className="assignment-shift-info">
          <div>
            <dt>Ngày làm</dt>
            <dd>{dateText(shift.ngay_lam)}</dd>
          </div>
          <div>
            <dt>Giờ bắt đầu</dt>
            <dd>{timeText(shift.gio_bat_dau)}</dd>
          </div>
          <div>
            <dt>Giờ kết thúc</dt>
            <dd>{timeText(shift.gio_ket_thuc)}</dd>
          </div>
          <div>
            <dt>Số lượng nhân viên tối thiểu</dt>
            <dd>{shift.so_nhan_vien_toi_thieu}</dd>
          </div>
          <div>
            <dt>Số lượng nhân viên tối đa</dt>
            <dd>{shift.so_nhan_vien_toi_da}</dd>
          </div>
        </dl>
        <section className="assignment-current">
          <h3>Nhân viên đã được phân công</h3>
          <p>
            {shift.nhan_vien.map((person) => person.ho_ten).join(' · ') ||
              'Chưa có nhân viên nào được phân công.'}
          </p>
        </section>
        <section className="assignment-candidates">
          <h3>Nhân viên có thể được phân công</h3>
          <Loading active={candidates.loading} />
          {!candidates.error && !candidates.loading && (
            <div className="candidate-list">
              {choices.map((person) => (
                <label
                  className="candidate"
                  key={person.id}
                  data-assigned-only={person.assignedOnly}
                >
                  <input
                    type="checkbox"
                    aria-label={person.name}
                    checked={selected.includes(person.id)}
                    onChange={() => toggle(person.id)}
                    disabled={
                      readonly ||
                      task.pending ||
                      (person.assignedOnly && candidates.data.length === 0)
                    }
                  />
                  <span className="assignment-person">
                    <span>{person.name}</span>
                    {person.assignedOnly && (
                      <small className="assignment-stale-label">
                        Không còn trong danh sách ứng viên
                      </small>
                    )}
                  </span>
                  <Badge>{person.status}</Badge>
                </label>
              ))}
              {!choices.length && (
                <p className="assignment-empty">
                  Không có nhân viên phù hợp với ca làm này
                </p>
              )}
            </div>
          )}
          {validationError && (
            <p className="assignment-validation-error" role="alert">
              {validationError}
            </p>
          )}
          <ErrorMessage message={task.error || candidates.error} />
        </section>
      </div>
      <footer className="dialog-actions assignment-actions">
        <Button onClick={onClose} disabled={task.pending}>
          Hủy
        </Button>
        {showSave && (
          <Button
            variant="primary"
            onClick={save}
            disabled={
              readonly ||
              task.pending ||
              candidates.loading ||
              Boolean(candidates.error) ||
              (!hasChanges && initialSelection.length > 0)
            }
          >
            Lưu
          </Button>
        )}
      </footer>
    </Modal>
  );
}
