import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../services/api';
import type { User } from '../../services/models';
import { Modal } from '../../components/ui';

type EditForm = {
  ten_dang_nhap: string;
  ho_ten: string;
  so_dien_thoai: string;
  vai_tro: User['vai_tro'];
  trang_thai: User['trang_thai'];
};

const roles: User['vai_tro'][] = ['Quản lý', 'Nhân viên'];

const inputIds = {
  ten_dang_nhap: 'edit-username',
  ho_ten: 'edit-fullname',
  so_dien_thoai: 'edit-phone',
  vai_tro: 'edit-role-btn',
  trang_thai: 'edit-status',
};

function RoleSelect({
  value,
  onChange,
}: {
  value: User['vai_tro'];
  onChange(value: User['vai_tro']): void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(roles.indexOf(value));
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const choose = (index: number) => {
    onChange(roles[index]);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div
      className="accounts-role-select-wrapper"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        id="edit-role-btn"
        className="accounts-edit-input accounts-role-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="edit-role-list"
        onClick={() => {
          setActive(roles.indexOf(value));
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(roles.indexOf(value));
            setOpen(true);
          }
        }}
      >
        <span>{value}</span>
        <span className="accounts-role-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          ref={list}
          id="edit-role-list"
          className="accounts-role-dropdown"
          role="listbox"
          aria-label="Vai trò"
          tabIndex={-1}
          aria-activedescendant={`edit-role-${active}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setActive(
                (previous) =>
                  (previous + (event.key === 'ArrowDown' ? 1 : roles.length - 1)) %
                  roles.length,
              );
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              choose(active);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            } else if (event.key === 'Tab') {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          {roles.map((role, index) => (
            <div
              key={role}
              id={`edit-role-${index}`}
              role="option"
              aria-selected={value === role}
              className={`accounts-role-option${active === index ? ' is-selected' : ''}`}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {role}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditAccountDialog({
  user,
  onClose,
  onUpdated,
  onFailed,
}: {
  user: User;
  onClose(): void;
  onUpdated(): void;
  onFailed?(): void;
}) {
  const [form, setForm] = useState<EditForm>({
    ten_dang_nhap: user.ten_dang_nhap,
    ho_ten: user.ho_ten,
    so_dien_thoai: user.so_dien_thoai,
    vai_tro: user.vai_tro,
    trang_thai: user.trang_thai,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  const submittedForm = useRef<EditForm>(form);

  const change = (key: keyof EditForm, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setGeneralError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || confirming) return;

    const next: Record<string, string> = {};
    const values = {
      ten_dang_nhap: form.ten_dang_nhap.trim(),
      ho_ten: form.ho_ten.trim(),
      so_dien_thoai: form.so_dien_thoai.trim(),
      vai_tro: form.vai_tro,
      trang_thai: form.trang_thai,
    };

    let missing = false;
    if (!values.ten_dang_nhap) {
      next.ten_dang_nhap = 'Vui lòng điền đầy đủ thông tin bắt buộc';
      missing = true;
    }
    if (!values.ho_ten) {
      next.ho_ten = 'Vui lòng điền đầy đủ thông tin bắt buộc';
      missing = true;
    }
    if (!values.so_dien_thoai) {
      next.so_dien_thoai = 'Vui lòng điền đầy đủ thông tin bắt buộc';
      missing = true;
    }

    if (
      values.ten_dang_nhap &&
      !/^[a-zA-Z0-9_.-]{3,50}$/.test(values.ten_dang_nhap)
    ) {
      next.ten_dang_nhap =
        'Tên đăng nhập gồm 3–50 ký tự chữ, số hoặc dấu _ . -';
    }
    if (values.ho_ten && values.ho_ten.length > 100) {
      next.ho_ten = 'Họ và tên tối đa 100 ký tự.';
    }
    if (
      values.so_dien_thoai &&
      !/^\+?[0-9]{9,15}$/.test(values.so_dien_thoai)
    ) {
      next.so_dien_thoai =
        'Số điện thoại phải gồm 9–15 chữ số, có thể bắt đầu bằng dấu +.';
    }

    setErrors(next);
    if (missing) {
      setGeneralError('');
    }
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>('.accounts-edit-input.is-error')
          ?.focus(),
      );
      return;
    }

    submittedForm.current = values;
    submitButton.current?.focus();
    setConfirming(true);
  };

  const cancelConfirmation = () => {
    if (!sending.current) setConfirming(false);
  };

  const save = async () => {
    if (sending.current || !confirming) return;
    sending.current = true;
    setPending(true);
    try {
      await api(`/users/${user.ma_nguoi_dung}`, {
        method: 'PATCH',
        body: {
          ten_dang_nhap: submittedForm.current.ten_dang_nhap,
          ho_ten: submittedForm.current.ho_ten,
          so_dien_thoai: submittedForm.current.so_dien_thoai,
          vai_tro: submittedForm.current.vai_tro,
        },
      });
      onUpdated();
    } catch (error) {
      setConfirming(false);
      const next: Record<string, string> = {};
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        for (const detail of error.details ?? []) {
          if (detail.field in form) next[detail.field] = detail.message;
        }
      } else if (error instanceof ApiError && error.code === 'DUPLICATE_DATA') {
        for (const detail of error.details ?? []) {
          if (detail.field === 'ten_dang_nhap') {
            next.ten_dang_nhap =
              'Tên đăng nhập đã tồn tại. Vui lòng kiểm tra lại';
          }
          if (detail.field === 'so_dien_thoai') {
            next.so_dien_thoai =
              'Số điện thoại đã tồn tại. Vui lòng kiểm tra lại';
          }
        }
      } else {
        onFailed?.();
      }
      setErrors(next);
      setGeneralError(
        Object.keys(next).length ? '' : error instanceof Error
          ? error.message : 'Không thể cập nhật thông tin tài khoản. Vui lòng thử lại.',
      );
      if (Object.keys(next).length) {
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLInputElement>('.accounts-edit-input.is-error')
            ?.focus(),
        );
      }
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  const input = (
    key: 'ten_dang_nhap' | 'ho_ten' | 'so_dien_thoai',
    label: string,
    type = 'text',
  ) => (
    <div className="accounts-edit-field">
      <label className="accounts-edit-label" htmlFor={inputIds[key]}>
        {label}
      </label>
      <input
        id={inputIds[key]}
        name={key}
        type={type}
        className={`accounts-edit-input${errors[key] ? ' is-error' : ''}`}
        value={form[key]}
        onChange={(event) => change(key, event.target.value)}
        autoComplete="off"
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key]?.trim() ? `error-${key}` : undefined}
      />
      {errors[key]?.trim() && (
        <span
          id={`error-${key}`}
          className="accounts-edit-field-error"
          role="alert"
        >
          {errors[key]}
        </span>
      )}
    </div>
  );

  return (
    <>
      <Modal
        title="Chỉnh sửa thông tin tài khoản"
        className="accounts-edit-modal"
        busy={confirming || pending}
        onClose={() => {
          if (!sending.current && !confirming) onClose();
        }}
      >
        <form className="accounts-edit-form" noValidate onSubmit={submit}>
          <div className="accounts-edit-grid">
            {input('ten_dang_nhap', 'Tên đăng nhập')}
            {input('ho_ten', 'Họ và tên')}
            {input('so_dien_thoai', 'Số điện thoại', 'tel')}
            <div className="accounts-edit-field">
              <label
                className="accounts-edit-label"
                htmlFor={inputIds.vai_tro}
              >
                Vai trò
              </label>
              <RoleSelect
                value={form.vai_tro}
                onChange={(value) => change('vai_tro', value)}
              />
            </div>
            <div className="accounts-edit-field accounts-edit-field-full accounts-edit-status-field">
              <label
                className="accounts-edit-label"
                htmlFor={inputIds.trang_thai}
              >
                Trạng thái tài khoản
              </label>
                <input
                  id={inputIds.trang_thai}
                  name="trang_thai"
                  type="text"
                  readOnly
                  tabIndex={-1}
                  aria-readonly="true"
                  className="accounts-edit-input accounts-edit-input-readonly"
                  value={form.trang_thai}
                />
            </div>
          </div>
          {generalError && (
            <div className="accounts-edit-general-error" role="alert">
              {generalError}
            </div>
          )}
          <footer className="accounts-edit-actions">
            <button
              ref={submitButton}
              type="submit"
              className="accounts-edit-submit-btn"
              disabled={pending}
            >
              Lưu
            </button>
          </footer>
        </form>
      </Modal>

      {confirming && (
        <Modal
          title="Xác nhận thay đổi thông tin tài khoản"
          className="accounts-confirm-modal"
          busy={pending}
          onClose={cancelConfirmation}
        >
          <div
            className="accounts-confirm-actions"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancelConfirmation();
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
                (index + (event.shiftKey ? buttons.length - 1 : 1)) %
                  buttons.length
              ].focus();
            }}
          >
            <button
              type="button"
              className="accounts-confirm-cancel-btn"
              onClick={cancelConfirmation}
              disabled={pending}
              autoFocus
            >
              Hủy
            </button>
            <button
              type="button"
              className="accounts-confirm-submit-btn"
              onClick={() => void save()}
              disabled={pending}
            >
              {pending ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
