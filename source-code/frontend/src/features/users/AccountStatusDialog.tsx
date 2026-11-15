import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import type { User } from '../../services/models';
import { Modal } from '../../components/ui';

export default function AccountStatusDialog({
  user,
  currentUser,
  onClose,
  onSuccess,
  onError,
}: {
  user: User;
  currentUser?: User | null;
  onClose(): void;
  onSuccess(action: 'lock' | 'activate'): void;
  onError(action: 'lock' | 'activate', error: Error): void;
}) {
  const isLocking = user.trang_thai !== 'Đã khóa';
  const title = isLocking ? 'Khóa tài khoản' : 'Kích hoạt tài khoản';
  const actionLabel = isLocking ? 'Khóa' : 'Kích hoạt';
  const targetStatus = isLocking ? 'Đã khóa' : 'Đang hoạt động';

  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  const cancel = () => {
    if (pending || sending.current) return;
    onClose();
  };

  const confirm = async () => {
    if (pending || sending.current) return;
    sending.current = true;
    setPending(true);
    setError('');

    try {
      await api(`/users/${user.ma_nguoi_dung}/status`, {
        method: 'PATCH',
        body: { trang_thai: targetStatus },
      });

      // Nếu quản lý tự khóa tài khoản của chính mình, ghi nhận lý do khóa để hiển thị hộp thoại đăng xuất phù hợp
      if (isLocking && currentUser?.ma_nguoi_dung === user.ma_nguoi_dung) {
        window.dispatchEvent(
          new CustomEvent('me-session-ended', { detail: { reason: 'locked' } }),
        );
      }

      onSuccess(isLocking ? 'lock' : 'activate');
    } catch (err: any) {
      const message =
        err?.code === 'LAST_MANAGER'
          ? 'Không thể vô hiệu hóa quản lý cuối cùng.'
          : err?.message || 'Có lỗi xảy ra khi cập nhật trạng thái.';
      setError(message);
      onError(isLocking ? 'lock' : 'activate', err);
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      title={title}
      className="accounts-status-modal"
      busy={pending}
      onClose={cancel}
    >
      <div
        className="accounts-status-content"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
            return;
          }
          if (event.key !== 'Tab') return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          );
          if (!buttons.length) return;
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          event.preventDefault();
          buttons[
            (index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length
          ].focus();
        }}
      >
        <div className="accounts-status-body">
          <span className="accounts-status-label">Tên đăng nhập</span>
          <strong className="accounts-status-username">
            {user.ten_dang_nhap}
          </strong>
          {error && (
            <div className="accounts-status-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <div className="accounts-status-actions">
          <button
            type="button"
            className="accounts-status-cancel-btn"
            onClick={cancel}
            disabled={pending}
            autoFocus
          >
            Hủy
          </button>
          <button
            type="button"
            className="accounts-status-submit-btn"
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending ? 'Đang xử lý…' : actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
