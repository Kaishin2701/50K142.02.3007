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
  const [selected, setSelected] = useState(
    shift.nhan_vien.map((person) => person.ma_nhan_vien),
  );
  const task = useTask();
  const { refresh } = useDataStore();
  const notice = useNotice();
  const readonly = shiftTime(shift) <= Date.now();
  const toggle = (id: string) =>
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id],
    );
  const save = () =>
    void task.run(async () => {
      await api(`/shifts/${shift.ma_ca}/assignments`, {
        method: 'PUT',
        body: { ma_nhan_vien: selected },
      });
      refresh();
      onClose();
      notice('Phân công ca làm thành công.');
    });
  return (
    <Modal
      title="Phân công nhân viên cho ca làm"
      onClose={onClose}
      busy={task.pending}
    >
      <div className="dialog-body">
        <dl className="detail-grid">
          <dt>Ngày làm</dt>
          <dd>{dateText(shift.ngay_lam)}</dd>
          <dt>Giờ bắt đầu</dt>
          <dd>{timeText(shift.gio_bat_dau)}</dd>
          <dt>Giờ kết thúc</dt>
          <dd>{timeText(shift.gio_ket_thuc)}</dd>
          <dt>Số lượng nhân viên tối thiểu</dt>
          <dd>{shift.so_nhan_vien_toi_thieu}</dd>
          <dt>Số lượng nhân viên tối đa</dt>
          <dd>{shift.so_nhan_vien_toi_da}</dd>
          <dt>Nhân viên đã được phân công</dt>
          <dd>
            {shift.nhan_vien.map((person) => person.ho_ten).join(' · ') || '—'}
          </dd>
        </dl>
        <h3>Nhân viên có thể được phân công</h3>
        <Loading active={candidates.loading} />
        <ErrorMessage message={candidates.error || task.error} />
        <div className="candidate-list">
          {candidates.data.map((person) => (
            <label className="candidate" key={person.ma_nguoi_dung}>
              <input
                type="checkbox"
                aria-label={person.ho_ten}
                checked={selected.includes(person.ma_nguoi_dung)}
                onChange={() => toggle(person.ma_nguoi_dung)}
                disabled={readonly || task.pending}
              />
              <span>{person.ho_ten}</span>
              <Badge>{person.loai_dang_ky}</Badge>
            </label>
          ))}
          {!candidates.loading && !candidates.data.length && (
            <p className="ui-empty">
              Chưa có nhân viên đăng ký phù hợp với ca làm.
            </p>
          )}
        </div>
      </div>
      <footer className="dialog-actions">
        <Button onClick={onClose} disabled={task.pending}>
          Hủy
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={
            readonly ||
            task.pending ||
            candidates.loading ||
            selected.length < shift.so_nhan_vien_toi_thieu ||
            selected.length > shift.so_nhan_vien_toi_da
          }
        >
          Lưu
        </Button>
      </footer>
    </Modal>
  );
}
