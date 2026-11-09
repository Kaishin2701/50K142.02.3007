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
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label className="ui-field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
      {hint && <small>{hint}</small>}
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
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={'ui-dialog' + (wide ? ' ui-dialog-wide' : '')}
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
  onConfirm,
  onClose,
  pending,
  error,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm(): void;
  onClose(): void;
  pending?: boolean;
  error?: string;
}) {
  return (
    <Modal title={title} onClose={onClose} busy={pending}>
      <div className="dialog-body">
        {children}
        <ErrorMessage message={error} />
      </div>
      <footer className="dialog-actions">
        <Button onClick={onClose} disabled={pending}>
          Hủy
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
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey(row: T): string;
  empty?: string;
}) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
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
      <span>Trang {page}</span>
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
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setMessage('')}
          >
            ×
          </button>
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
