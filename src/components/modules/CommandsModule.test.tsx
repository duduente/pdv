// @vitest-environment jsdom
import { act, useState, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandsModule } from './CommandsModule';
import type { Command } from '@/types';

const fixtures = vi.hoisted(() => ({
  remote: false,
  commit: vi.fn(),
  sync: vi.fn(),
  error: vi.fn(),
  setCommands: null as null | ((value: Command[]) => void),
  command: {
    id: 'command', establishmentId: 'store', number: 1, createdAt: '2026-01-01T10:00:00Z',
    status: 'open' as const, items: [{ productId: 'old', name: 'Café', price: 5, quantity: 1 }], total: 5,
  },
}));
vi.mock('@/store', () => ({ useApp: () => ({ selectedEstablishment: { id: 'store', slug: 'test' } }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { isDemo: !fixtures.remote } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/atomicEmployeeRecords', () => ({ commitEmployeeRecords: fixtures.commit }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: fixtures.error } }));
vi.mock('@/hooks/usePersistentState', () => ({
  syncPersistentState: fixtures.sync,
  usePersistentState: <T,>(key: string, initial: T) => {
    const initialData = key === 'commands:store' ? [fixtures.command]
      : key === 'menu-items:store' ? [{ id: 'cake', name: 'Bolo', price: 8 }]
        : initial;
    const [value, setValue] = useState(initialData as T);
    if (key === 'commands:store') fixtures.setCommands = (next) => setValue(next as T);
    return [value, (next: SetStateAction<T>) => setValue(next), true, { key, value, exists: true }];
  },
}));

afterEach(() => {
  fixtures.remote = false;
  fixtures.commit.mockReset();
  fixtures.sync.mockReset();
  fixtures.error.mockReset();
  fixtures.setCommands = null;
});

async function setup() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<CommandsModule />));
  const command = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('Comanda 1'));
  if (!command) throw new Error('Comanda não encontrada');
  const cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
  return { container, command, cleanup };
}

async function clickButton(label: string, root: ParentNode = document) {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Botão não encontrado: ${label}`);
  await act(async () => button.click());
}

it('shows items on one click and opens a cancellable editor on double-click or Editar', async () => {
  const { container, command, cleanup } = await setup();
  expect(container.textContent).not.toContain('Café');
  await act(async () => command.click());
  expect(container.textContent).toContain('Café');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => command.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Editar comanda 1');
  await clickButton('BoloR$ 8,00');
  await clickButton('Cancelar');
  expect(container.textContent).not.toContain('Bolo');
  await clickButton('Editar');
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error('Edição não encontrada');
  for (const [label, value] of [['Nome da comanda', 'Mesa 4'], ['Nome do cliente', 'Ana'], ['Telefone do cliente', '123'], ['Observações', 'Aniversário']]) {
    const input = [...dialog.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label))?.querySelector('input');
    if (!input) throw new Error(`Campo não encontrado: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await clickButton('BoloR$ 8,00');
  await clickButton('Salvar comanda');
  expect(container.textContent).toContain('Mesa 4');
  expect(container.textContent).toContain('Cliente: Ana');
  expect(container.textContent).toContain('Telefone: 123');
  expect(container.textContent).toContain('Aniversário');
  expect(container.textContent).toContain('Bolo');
  expect(container.textContent).toContain('R$ 13,00');
  await cleanup();
});

it('does not overwrite a command changed while editing', async () => {
  const { container, command, cleanup } = await setup();
  await act(async () => command.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await act(async () => fixtures.setCommands?.([{ ...fixtures.command, status: 'paid' }]));
  await clickButton('Salvar comanda');
  expect(fixtures.error).toHaveBeenCalledWith(expect.stringContaining('alterada ou fechada'));
  expect(container.textContent).toContain('Finalizadas');
  await cleanup();
});

it('allows viewing a paid command without editing it', async () => {
  const { container, cleanup } = await setup();
  await act(async () => fixtures.setCommands?.([{ ...fixtures.command, status: 'paid' }]));
  const command = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Comanda 1'));
  await act(async () => command?.click());
  expect(container.textContent).toContain('Café');
  expect(container.textContent).toContain('Comanda finalizada');
  expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Editar')).toBe(false);
  await cleanup();
});

it('keeps the editor open when the remote save fails', async () => {
  fixtures.remote = true;
  fixtures.commit.mockRejectedValue(new Error('conflito no banco'));
  const { command, cleanup } = await setup();
  await act(async () => command.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await clickButton('Salvar comanda');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  expect(fixtures.sync).not.toHaveBeenCalled();
  expect(fixtures.error).toHaveBeenCalledWith('conflito no banco');
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  await cleanup();
});

it('waits for the atomic remote save before closing the editor', async () => {
  fixtures.remote = true;
  let resolveSave: () => void = () => {};
  fixtures.commit.mockReturnValue(new Promise<void>((resolve) => { resolveSave = resolve; }));
  const { command, cleanup } = await setup();
  await act(async () => command.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await clickButton('BoloR$ 8,00');
  await clickButton('Salvar comanda');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  expect(fixtures.commit).toHaveBeenCalledWith('store', [expect.objectContaining({
    snapshot: expect.objectContaining({ key: 'commands:store' }),
    value: [expect.objectContaining({ id: 'command', total: 13, items: expect.arrayContaining([expect.objectContaining({ name: 'Bolo' })]) })],
    write: true,
  })]);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Salvando...');
  expect(fixtures.sync).not.toHaveBeenCalled();
  await act(async () => resolveSave());
  expect(fixtures.sync).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await cleanup();
});
