// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicBookingPage } from './PublicBookingPage';

const fixtures = vi.hoisted(() => ({ commit: vi.fn(), sync: vi.fn(), error: vi.fn() }));
vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: { id: 'store', name: 'Teste', slug: 'test', theme: { accentColor: '#000' } }, goBack: vi.fn() }),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { isDemo: false } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/atomicEmployeeRecords', () => ({ commitEmployeeRecords: fixtures.commit }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: fixtures.error } }));
vi.mock('@/hooks/usePersistentState', () => ({
  syncPersistentState: fixtures.sync,
  usePersistentState: (key: string, initial: unknown) => {
    const values: Record<string, unknown> = {
      'services:store': [{ id: 'service', name: 'Corte teste', price: 10, duration: 30 }],
      'professionals:store': [],
      'appointments:store': [],
      'working-hours:store': ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day) => ({ day, enabled: true, start: '09:00', end: '10:00' })),
    };
    const value = values[key] ?? initial;
    return [value, vi.fn(), true, { key, value, exists: true }];
  },
}));

afterEach(() => {
  fixtures.commit.mockReset();
  fixtures.sync.mockReset();
  fixtures.error.mockReset();
});

async function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Botão não encontrado: ${label}`);
  await act(async () => { button.click(); });
}

async function openConfirmation() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<PublicBookingPage />); });
  const service = [...container.querySelectorAll('p')].find((item) => item.textContent === 'Corte teste');
  if (!service) throw new Error('Serviço não encontrado');
  await act(async () => { service.click(); });
  await click(container, 'Continuar');
  const dateButton = [...container.querySelectorAll('button')].find((item) => item.querySelectorAll('span').length === 3);
  if (!dateButton) throw new Error('Data não encontrada');
  await act(async () => { dateButton.click(); });
  await click(container, '09:00');
  await click(container, 'Continuar');
  for (const [id, value] of [['name', 'Cliente'], ['whatsapp', '11999999999']]) {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  await click(container, 'Continuar');
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); } };
}

it('waits for remote confirmation and prevents duplicate submission', async () => {
  let resolve!: () => void;
  fixtures.commit.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const { container, cleanup } = await openConfirmation();
  await click(container, 'Confirmar Agendamento');
  expect(container.textContent).not.toContain('Agendamento Confirmado!');
  expect(container.textContent).toContain('Confirmando...');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Confirmando'));
  expect(button?.disabled).toBe(true);
  await act(async () => { resolve(); });
  expect(container.textContent).toContain('Agendamento Confirmado!');
  expect(fixtures.sync).toHaveBeenCalledOnce();
  await cleanup();
});

it('does not confirm or synchronize a booking when the transaction fails', async () => {
  fixtures.commit.mockRejectedValue(new Error('conflito'));
  const { container, cleanup } = await openConfirmation();
  await click(container, 'Confirmar Agendamento');
  expect(container.textContent).not.toContain('Agendamento Confirmado!');
  expect(fixtures.sync).not.toHaveBeenCalled();
  expect(fixtures.error).toHaveBeenCalledWith(expect.stringContaining('conflito'));
  await cleanup();
});
