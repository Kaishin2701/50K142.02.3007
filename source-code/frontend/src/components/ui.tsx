import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { dateText, parseDisplayDate } from '../app/format';

export function DateField({ value, onChange, month = false, onBlur, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { label: string; value: string; onChange(value: string): void; month?: boolean; error?: string }) {
  const display = (value: string) => month ? (value ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : '') : (value ? dateText(value) : '');
  const [draft, setDraft] = useState(() => display(value));
  const emitted = useRef(value);
  useEffect(() => { if (value !== emitted.current) { emitted.current = value; setDraft(display(value)); } }, [value, month]);
  return <Field {...props} type="text" inputMode="numeric" placeholder={month ? 'MM/YYYY' : 'DD/MM/YYYY'} value={draft} onBlur={event => { if (value) setDraft(display(value)); onBlur?.(event); }} onChange={event => {
    const text = event.target.value;
    setDraft(text);
    const parsed = month ? (/^(0[1-9]|1[0-2])\/\d{4}$/.test(text) ? `${text.slice(3)}-${text.slice(0, 2)}` : /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : '') : parseDisplayDate(text);
    emitted.current = parsed;
    onChange(parsed);
  }} />;
}

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
}) {
  return (
    <button
      type={type}
      className={`ui-button ui-button-${variant} ${className}`}
      {...props}
    />
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <label className="ui-field" htmlFor={id}>
      <span id={id + '-label'}>{label}</span>
      <input id={id} aria-labelledby={id + '-label'} aria-invalid={error ? true : undefined} aria-describedby={error ? id + '-error' : undefined} {...props} />
      {hint && <small>{hint}</small>}
      {error && <small className="field-error" id={id + '-error'} role="alert">{error}</small>}
    </label>
  );
}
export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} {...props}>
        {children}
      </select>
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
}) {
  const id = useId();
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={500}
        rows={3}
      />
    </label>
  );
}
export function ErrorMessage({ message }: { message?: string }) {
  return message ? (
    <div className="ui-error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading({ active }: { active: boolean }) {
  return active ? (
    <div className="ui-loading" role="status">
      Đang tải…
    </div>
  ) : null;
}
export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'ui-panel ' + className}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
    </header>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="ui-badge" data-value={String(children)}>
      {children}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  className = '',
  inline = false,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  wide?: boolean;
  className?: string;
  inline?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (inline) return;
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      previous?.focus();
    };
  }, [inline]);
  if (inline)
    return (
      <section
        className={'inline-dialog ' + className}
        role="dialog"
        aria-labelledby={titleId}
      >
        <h2 className="visually-hidden" id={titleId}>
          {title}
        </h2>
        {children}
      </section>
    );
  return (
    <dialog
      ref={ref}
      className={
        'ui-dialog' + (wide ? ' ui-dialog-wide' : '') + ' ' + className
      }
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) close.current();
      }}
    >
      <div className="dialog-surface">
        <header className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <Button
            variant="quiet"
            aria-label="Đóng"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Confirm({
  title,
  children,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onConfirm,
  onClose,
  pending,
  error,
  className = '',
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm(): void;
  onClose(): void;
  pending?: boolean;
  error?: string;
  className?: string;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={pending}
      className={'confirm-dialog ' + className}
    >
      <div className="dialog-body">
        {children}
        <ErrorMessage message={error} />
      </div>
      <footer className="dialog-actions">
        <Button onClick={onClose} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      </footer>
    </Modal>
  );
}
export type Column<T> = {
  key: string;
  label: string;
  render(row: T, index: number): ReactNode;
};
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Không có dữ liệu.',
  rowClassName,
  className = '',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T): string;
  empty?: string;
  rowClassName?(row: T): string;
  className?: string;
}) {
  return (
    <div className={'ui-table-scroll ' + className}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" data-column={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} className={rowClassName?.(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  data-column={column.key}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="ui-empty">{empty}</p>}
    </div>
  );
}
export function Pagination({
  page,
  hasMore,
  onChange,
}: {
  page: number;
  hasMore: boolean;
  onChange(page: number): void;
}) {
  return (
    <nav className="ui-pagination" aria-label="Phân trang">
      <Button onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Trang trước
      </Button>
      <span aria-label={`Trang ${page}`}>{page}</span>
      <Button onClick={() => onChange(page + 1)} disabled={!hasMore}>
        Trang sau
      </Button>
    </nav>
  );
}
const NoticeContext = createContext<((message: string) => void) | null>(null);
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return (
    <NoticeContext.Provider value={setMessage}>
      {children}
      {message && (
        <div className="ui-notice" role="status">
          {message}
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function useNotice() {
  const notice = useContext(NoticeContext);
  if (!notice) throw new Error('NoticeProvider is required');
  return notice;
}
