import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../services/api';
import type { User } from '../../services/models';
import { Modal } from '../../components/ui';

type Form = {
  ten_dang_nhap: string;
  ho_ten: string;
  so_dien_thoai: string;
  vai_tro: User['vai_tro'] | '';
  mat_khau: string;
  xac_nhan_mat_khau: string;
};
const roles: User['vai_tro'][] = ['Quản lý', 'Nhân viên'];
const inputIds = { ten_dang_nhap: 'create-username', ho_ten: 'create-fullname',
  so_dien_thoai: 'create-phone', mat_khau: 'create-password', xac_nhan_mat_khau: 'create-confirm-password' };

function RoleSelect({ value, invalid, onChange }: {
  value: Form['vai_tro'];
  invalid: boolean;
  onChange(value: User['vai_tro']): void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? roles.indexOf(value) : 0;
  const [active, setActive] = useState(selected);
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
    <div className="accounts-role-select-wrapper" ref={wrapper} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" id="create-role-btn"
        className={`accounts-create-input accounts-role-select-btn${invalid ? ' is-error' : ''}`}
        aria-haspopup="listbox" aria-expanded={open} aria-controls="create-role-list"
        aria-invalid={invalid}
        onClick={() => { setActive(selected); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setActive(selected); setOpen(true);
          }
        }}>
        {value && <span>{value}</span>}
        <span className="accounts-role-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div ref={list} id="create-role-list" className="accounts-role-dropdown"
        role="listbox" aria-label="Vai trò" tabIndex={-1}
        aria-activedescendant={`create-role-${active}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((previous) => (previous + (event.key === 'ArrowDown' ? 1 : roles.length - 1)) % roles.length);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); choose(active);
          } else if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
          } else if (event.key === 'Tab') {
            // Return to the trigger before normal tab navigation continues.
            setOpen(false); trigger.current?.focus();
          }
        }}>
        {roles.map((role, index) => <div key={role} id={`create-role-${index}`}
          role="option" aria-selected={value === role}
          className={`accounts-role-option${active === index ? ' is-selected' : ''}`}
          onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(index)}>{role}</div>)}
      </div>}
    </div>
  );
}

export default function CreateAccountDialog({ onClose, onCreated }: {
  onClose(): void; onCreated(): void;
}) {
  const [form, setForm] = useState<Form>({ten_dang_nhap: '', ho_ten: '', so_dien_thoai: '',
    vai_tro: '', mat_khau: '', xac_nhan_mat_khau: ''});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const submitButton = useRef<HTMLButtonElement>(null);
  const submittedForm = useRef<Form>(form);
  const change = (key: keyof Form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => { const next = { ...previous }; delete next[key]; return next; });
    setGeneralError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || confirming) return;
    const next: Record<string, string> = {};
    const values = { ...form, ho_ten: form.ho_ten.trim() };
    let missing = false;
    for (const [key, value] of Object.entries(values)) {
      if (key.includes('mat_khau') ? !value : !value.trim()) { next[key] = ' '; missing = true; }
    }
    if (values.ten_dang_nhap.trim() && !/^[a-zA-Z0-9_.-]{3,50}$/.test(values.ten_dang_nhap))
      next.ten_dang_nhap = 'Tên đăng nhập gồm 3–50 ký tự chữ, số hoặc dấu _ . -';
    if (values.ho_ten.length > 100) next.ho_ten = 'Họ và tên tối đa 100 ký tự.';
    if (values.so_dien_thoai.trim() && !/^\+?[0-9]{9,15}$/.test(values.so_dien_thoai))
      next.so_dien_thoai = 'Số điện thoại phải gồm 9–15 chữ số, có thể bắt đầu bằng dấu +.';
    if (values.mat_khau && (values.mat_khau.length < 8 || values.mat_khau.length > 128))
      next.mat_khau = 'Mật khẩu phải có từ 8 đến 128 ký tự.';
    if (values.xac_nhan_mat_khau && values.mat_khau !== values.xac_nhan_mat_khau)
      next.xac_nhan_mat_khau = 'Vui lòng xác nhận lại mật khẩu';
    setErrors(next);
    setGeneralError(missing ? 'Vui lòng điền đầy đủ thông tin bắt buộc' : '');
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.accounts-create-input.is-error')?.focus());
      return;
    }
    submittedForm.current = values;
    submitButton.current?.focus();
    setConfirming(true);
  };
  const cancelConfirmation = () => { if (!sending.current) setConfirming(false); };
  const create = async () => {
    if (sending.current) return;
    sending.current = true; setPending(true);
    try {
      await api('/users', { method: 'POST', body: submittedForm.current });
      onCreated();
    } catch (error) {
      setConfirming(false);
      const next: Record<string, string> = {};
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        for (const detail of error.details ?? []) {
          if (detail.field in form) next[detail.field] = detail.message;
        }
      } else if (error instanceof ApiError && error.code === 'DUPLICATE_DATA') {
        for (const detail of error.details ?? []) {
          if (detail.field === 'ten_dang_nhap') next.ten_dang_nhap = 'Tên đăng nhập đã tồn tại. Vui lòng kiểm tra lại';
          if (detail.field === 'so_dien_thoai') next.so_dien_thoai = 'Số điện thoại đã tồn tại. Vui lòng kiểm tra lại';
        }
      }
      setErrors(next);
      setGeneralError(Object.keys(next).length ? '' : error instanceof Error ? error.message : 'Không thể tạo tài khoản. Vui lòng thử lại.');
    } finally {
      sending.current = false; setPending(false);
    }
  };
  const input = (key: Exclude<keyof Form, 'vai_tro'>, label: string, type = 'text') => (
    <div className="accounts-create-field">
      <label className="accounts-create-label" htmlFor={inputIds[key]}>{label}</label>
      <input id={inputIds[key]} name={key} type={type}
        className={`accounts-create-input${errors[key] ? ' is-error' : ''}`}
        value={form[key]} onChange={(event) => change(key, event.target.value)}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?.trim() ? `error-${key}` : undefined} />
      {errors[key]?.trim() && <span id={`error-${key}`} className="accounts-create-field-error" role="alert">{errors[key]}</span>}
    </div>
  );
  return <>
    <Modal title="Tạo tài khoản" className="accounts-create-modal" busy={confirming || pending}
      onClose={() => { if (!sending.current && !confirming) onClose(); }}>
      <form className="accounts-create-form" noValidate onSubmit={submit}>
        <div className="accounts-create-grid">
          {input('ten_dang_nhap', 'Tên đăng nhập')}
          {input('ho_ten', 'Họ và tên')}
          {input('so_dien_thoai', 'Số điện thoại', 'tel')}
          <div className="accounts-create-field">
            <label className="accounts-create-label" htmlFor="create-role-btn">Vai trò</label>
            <RoleSelect
              value={form.vai_tro}
              invalid={Boolean(errors.vai_tro)}
              onChange={(value) => change('vai_tro', value)}
            />
          </div>
          {input('mat_khau', 'Mật khẩu', 'password')}
          {input('xac_nhan_mat_khau', 'Xác nhận mật khẩu', 'password')}
        </div>
        {generalError && <div className="accounts-create-general-error" role="alert">{generalError}</div>}
        <footer className="accounts-create-actions">
          <button ref={submitButton} type="submit" className="accounts-create-submit-btn" disabled={pending}>Tạo tài khoản</button>
        </footer>
      </form>
    </Modal>
    {confirming && <Modal title="Xác nhận tạo tài khoản" className="accounts-confirm-modal" busy={pending} onClose={cancelConfirmation}>
      <div className="accounts-confirm-actions" onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); cancelConfirmation(); return;
        }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
      }}>
        <button type="button" className="accounts-confirm-cancel-btn" onClick={cancelConfirmation} disabled={pending} autoFocus>Hủy</button>
        <button type="button" className="accounts-confirm-submit-btn" onClick={() => void create()} disabled={pending}>{pending ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </div>
    </Modal>}
  </>;
}
