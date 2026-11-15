import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type Option = { value: string; text: string; disabled: boolean };
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? textOf(child.props.children) : String(child)).join('');
}
function optionsOf(nodes: ReactNode): Option[] {
  return Children.toArray(nodes).flatMap(node => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(node)) return [];
    if (node.type === Fragment) return optionsOf(node.props.children);
    if (node.type !== 'option') return [];
    const text = textOf(node.props.children);
    return [{ value: String(node.props.value ?? text), text, disabled: Boolean(node.props.disabled) }];
  });
}

/** A styled listbox, with a native control retained only for form validation and submission. */
export function SelectField({ label, children, className = '', leadingIcon, chevronSrc, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode; leadingIcon?: string; chevronSrc?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(String(props.defaultValue ?? ''));
  const [placement, setPlacement] = useState<CSSProperties>({});
  const search = useRef({ text: '', time: 0 });
  const options = optionsOf(children);
  const visible = options.filter(option => option.text.trim());
  const value = String(props.value ?? uncontrolledValue);
  const selected = options.find(option => option.value === value);
  const openList = () => {
    if (trigger.current?.matches(':disabled')) return;
    const selectedIndex = visible.findIndex(option => option.value === value && !option.disabled);
    setActive(selectedIndex >= 0 ? selectedIndex : Math.max(0, visible.findIndex(option => !option.disabled)));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = visible[index];
    if (!option || option.disabled || !native.current || trigger.current?.matches(':disabled')) return;
    native.current.value = option.value;
    setUncontrolledValue(option.value);
    setInvalid(false);
    native.current.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const scale = trigger.current.offsetWidth ? rect.width / trigger.current.offsetWidth : 1;
    const zoom = scale > 0 ? scale : 1;
    const desiredHeight = Math.min(300, visible.length * 36 + 10) * zoom;
    const below = window.innerHeight - rect.bottom - 8 * zoom;
    const above = rect.top - 8 * zoom;
    const upward = below < desiredHeight && above > below;
    const maxHeight = Math.max(36, Math.min(300, (upward ? above : below) / zoom - 4));
    setPlacement({ position: 'fixed', left: Math.max(8, Math.min(rect.left / zoom, window.innerWidth / zoom - rect.width / zoom - 8)),
      width: rect.width / zoom, maxHeight,
      ...(upward ? { bottom: (window.innerHeight - rect.top) / zoom + 4 } : { top: rect.bottom / zoom + 4 }) });
  }, [open, visible.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close); };
  }, [open]);
  useEffect(() => { if (open) popup.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [active, open]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);
  const move = (direction: number) => {
    for (let step = 1; step <= visible.length; step++) {
      const next = (active + direction * step + visible.length) % visible.length;
      if (!visible[next].disabled) { setActive(next); return; }
    }
  };
  const portalRoot = trigger.current?.closest('dialog') ?? document.body;
  return <div className={'ui-field ui-select-field ' + className}>
    <span id={id + '-label'}>{label}</span>
    <select {...props} ref={native} id={id + '-native'} hidden aria-hidden="true" aria-invalid={undefined} tabIndex={-1}
      onInvalid={event => { event.preventDefault(); setInvalid(true); trigger.current?.focus(); props.onInvalid?.(event); }}>
      {children}
    </select>
    <button ref={trigger} type="button" id={id} className="ui-select-trigger" role="combobox"
      aria-label={props['aria-label']} aria-labelledby={props['aria-label'] ? undefined : id + '-label'}
      aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id + '-list' : undefined}
      aria-activedescendant={open && visible[active] ? id + '-option-' + active : undefined}
      aria-required={props.required || undefined} aria-invalid={props['aria-invalid'] || invalid || undefined}
      aria-describedby={props['aria-describedby']} disabled={props.disabled}
      onClick={() => open ? setOpen(false) : openList()}
      onBlur={event => { if (!popup.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (event.key === 'Tab') setOpen(false);
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) openList(); else move(event.key === 'ArrowDown' ? 1 : -1); }
        else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); if (!open) openList(); const enabled = visible.map((o, i) => !o.disabled ? i : -1).filter(i => i >= 0); setActive((event.key === 'Home' ? enabled[0] : enabled.at(-1)) ?? 0); }
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else openList(); }
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now(); search.current = { text: (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase('vi'), time: now };
          if (!open) openList();
          const match = visible.findIndex(option => !option.disabled && option.text.toLocaleLowerCase('vi').startsWith(search.current.text));
          if (match >= 0) setActive(match);
        }
      }}>
      {leadingIcon && <img className="ui-select-leading" src={leadingIcon} alt="" />}
      <span className="ui-select-value">{selected?.text || '\u00a0'}</span><span className="ui-select-chevron" aria-hidden="true">{chevronSrc ? <img src={chevronSrc} alt="" /> : '⌄'}</span>
    </button>
    {open && createPortal(<div ref={popup} id={id + '-list'} role="listbox" aria-label={label}
      className={'ui-select-popup' + (label === 'Vai trò' ? ' role-select-popup' : '')} style={placement}>
      {visible.map((option, index) => <div key={option.value} id={id + '-option-' + index} role="option"
        data-value={option.value} aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        className={index === active ? 'is-active' : ''}
        onPointerMove={() => { if (!option.disabled) setActive(index); }} onMouseDown={event => event.preventDefault()}
        onClick={() => choose(index)}>{option.text}</div>)}
    </div>, portalRoot)}
  </div>;
}
