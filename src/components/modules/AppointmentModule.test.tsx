// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AppointmentModule, AppointmentSettings } from './AppointmentModule';

vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: { id: 'store', slug: 'test' }, viewPublicPage: vi.fn() }),
}));
vi.mock('@/hooks/usePersistentState', () => ({
  usePersistentState: (_key: string, initial: unknown) => [initial, vi.fn(), true],
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
