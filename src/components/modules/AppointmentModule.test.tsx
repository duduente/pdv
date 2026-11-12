// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AppointmentModule, AppointmentSettings } from './AppointmentModule';

const fixtures = vi.hoisted(() => ({ rpc: vi.fn(), sync: vi.fn(), errors: vi.fn(), remote: false, keys: [] as string[] }));
vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: { id: 'store', slug: 'test' }, viewPublicPage: vi.fn() }),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: { isDemo: !fixtures.remote } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: fixtures.rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: fixtures.errors } }));
vi.mock('@/hooks/usePersistentState', () => ({
  syncPersistentState: fixtures.sync,
  usePersistentState: (key: string, initial: unknown) => {
    fixtures.keys.push(key);
    return [initial, vi.fn(), true];
  },
}));

it('keeps the calendar in appointments and moves its configuration to settings', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AppointmentModule />));
  expect(container.textContent).toContain('Configurações da loja');
  expect(container.textContent).not.toContain('Dias e Horários de Funcionamento');
  expect(container.querySelector('[aria-label="Configurações de agendamento"]')).toBeNull();
  await act(async () => root.render(<AppointmentSettings />));
  expect(container.textContent).toContain('Dias e Horários de Funcionamento');
  const services = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === 'Serviços');
  await act(async () => services?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(container.textContent).toContain('Cadastrar Novo Serviço');
  const professionals = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === 'Profissionais');
  await act(async () => professionals?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(container.textContent).toContain('Adicionar Profissional');
  await act(async () => root.unmount());
  container.remove();
});

it('creates a professional through the restricted server function without loading financial records', async () => {
  fixtures.remote = true;
  fixtures.keys = [];
  fixtures.rpc.mockResolvedValue({ data: [{ id: 'new', name: 'Carlos', role: 'Barbeiro' }], error: null });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AppointmentSettings />));
  const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === 'Profissionais');
  await act(async () => tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Ex: João Silva"]');
  if (!input) throw new Error('Campo de nome não encontrado');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Carlos');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const add = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Adicionar');
  await act(async () => { add?.click(); });
  expect(fixtures.rpc).toHaveBeenCalledWith('create_appointment_professional', {
    target_tenant: 'store', staff_name: 'Carlos', staff_role: '',
  });
  expect(fixtures.sync).toHaveBeenCalledWith('professionals:store', [{ id: 'new', name: 'Carlos', role: 'Barbeiro' }]);
  expect(fixtures.keys).not.toContain('store-finances:store');
  expect(fixtures.keys).not.toContain('employee-roster:store');
  await act(async () => root.unmount());
  container.remove();
  fixtures.remote = false;
});

it('reports server failure without updating the professional list', async () => {
  fixtures.remote = true;
  fixtures.sync.mockClear();
  fixtures.errors.mockClear();
  fixtures.rpc.mockResolvedValue({ data: null, error: { message: 'Acesso negado' } });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AppointmentSettings />));
  const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === 'Profissionais');
  await act(async () => tab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Ex: João Silva"]');
  if (!input) throw new Error('Campo de nome não encontrado');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Carlos');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const add = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Adicionar');
  await act(async () => { add?.click(); });
  expect(fixtures.errors).toHaveBeenCalledWith('Acesso negado');
  expect(fixtures.sync).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  container.remove();
  fixtures.remote = false;
});
