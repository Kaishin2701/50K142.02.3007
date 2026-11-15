import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectField } from '../src/components/SelectField';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Example({ onSubmit = () => {}, disabled = false }: { onSubmit?: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return <form onSubmit={event => { event.preventDefault(); onSubmit(value); }}>
    <fieldset disabled={disabled}><SelectField label="Vai trò" name="role" value={value} required onChange={event => setValue(event.target.value)}>
      <option value="" disabled></option><option>Quản lý</option><option>Nhân viên</option>
    </SelectField></fieldset><button type="submit">Lưu</button><button type="button">Ngoài danh sách</button>
  </form>;
}

describe('Figma dropdown interaction', () => {
  it('opens the two ordered roles without a blank row and submits the chosen value', async () => {
    const save = vi.fn(); const user = userEvent.setup(); render(<Example onSubmit={save} />);
    const trigger = screen.getByRole('combobox', { name: 'Vai trò' });
    await user.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Vai trò' });
    expect(within(list).getAllByRole('option').map(option => option.textContent)).toEqual(['Quản lý', 'Nhân viên']);
    await user.click(within(list).getByRole('option', { name: 'Quản lý' }));
    expect(trigger.textContent).toContain('Quản lý');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(save).toHaveBeenCalledWith('Quản lý');
  });
  it('supports keyboard selection, cancels without changing the value and permits normal Tab navigation', async () => {
    const user = userEvent.setup(); render(<Example />);
    const trigger = screen.getByRole('combobox', { name: 'Vai trò' }); trigger.focus();
    await user.keyboard('{ArrowDown}{End}{Enter}');
    expect(trigger.textContent).toContain('Nhân viên');
    await user.keyboard('{ArrowDown}{Home}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull(); expect(trigger.textContent).toContain('Nhân viên');
    await user.keyboard('{ArrowDown}{Tab}');
    expect(screen.queryByRole('listbox')).toBeNull(); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lưu' }));
  });
  it('preserves required validation, focuses the visible control and respects a disabled fieldset', async () => {
    const save = vi.fn(); const user = userEvent.setup(); const view = render(<Example onSubmit={save} />);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    const trigger = screen.getByRole('combobox', { name: 'Vai trò' });
    expect(save).not.toHaveBeenCalled(); expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    view.rerender(<Example onSubmit={save} disabled />);
    await user.click(trigger); expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('mounts inside its dialog and closes on outside interaction or viewport changes', async () => {
    const user = userEvent.setup(); render(<dialog open aria-label="Tạo tài khoản"><Example /></dialog>);
    const trigger = screen.getByRole('combobox', { name: 'Vai trò' });
    await user.click(trigger);
    expect(screen.getByRole('listbox').closest('dialog')).toBe(screen.getByRole('dialog'));
    await user.click(screen.getByRole('button', { name: 'Ngoài danh sách' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(trigger); fireEvent.resize(window); expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('skips disabled options during navigation and supports typing a matching prefix', async () => {
    const user = userEvent.setup(); const received = vi.fn(); const change = vi.fn(event => received(event.target.value));
    render(<SelectField label="Đồng nghiệp" value="a" onChange={change}>
      <option value="a">An</option><option value="b" disabled>Bình</option><option value="c">Chi</option>
    </SelectField>);
    const trigger = screen.getByRole('combobox'); trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); expect(change).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith('c');
    await user.keyboard('Ch');
    const active = screen.getByRole('option', { name: 'Chi' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(active.id);
  });
});
