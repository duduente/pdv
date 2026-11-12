// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SuperAdminPanel } from './SuperAdminPanel';

const fixtures = vi.hoisted(() => ({ supportActive: vi.fn() }));
vi.mock('@/store', () => ({ useApp: () => ({ establishments: [], updateEstablishment: vi.fn(), createEstablishment: vi.fn(), deleteEstablishment: vi.fn(), viewPublicPage: vi.fn() }) }));
vi.mock('@/components/UserManagementDialog', () => ({ UserManagementPanel: () => <div>Lista de usuários</div> }));
vi.mock('@/components/modules/AdminBillingPanel', () => ({ AdminBillingPanel: () => <div>Finanças</div> }));
vi.mock('@/components/SupportInbox', async () => {
  const { useEffect } = await import('react');
  return { SupportInbox: ({ active, onUnreadCountChange }: { active: boolean; onUnreadCountChange: (count: number) => void }) => {
    useEffect(() => { onUnreadCountChange(3); }, [onUnreadCountChange]);
    fixtures.supportActive(active);
    return <div>Caixa de suporte</div>;
  } };
});

it('keeps support mounted with a badge and separates users and support from stores', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SuperAdminPanel />));
  const tab = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) => button.textContent?.startsWith(name));
  const support = tab('Suporte');
  expect(support?.textContent).toContain('3');
  expect(container.querySelector('[aria-label="3 notificações de suporte não lidas"]')).toBeTruthy();
  expect(fixtures.supportActive).toHaveBeenLastCalledWith(false);
  expect([...container.querySelectorAll('[hidden]')].some((item) => item.textContent?.includes('Caixa de suporte'))).toBe(true);
  await act(async () => tab('Usuários')?.click());
  expect(container.textContent).toContain('Lista de usuários');
  expect(fixtures.supportActive).toHaveBeenLastCalledWith(false);
  await act(async () => support?.click());
  expect(container.textContent).not.toContain('Lista de usuários');
  expect(fixtures.supportActive).toHaveBeenLastCalledWith(true);
  expect([...container.querySelectorAll('[hidden]')].some((item) => item.textContent?.includes('Caixa de suporte'))).toBe(false);
  await act(async () => root.unmount());
  container.remove();
});

it('enables finance and employees by default when creating a store', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SuperAdminPanel />));
  const create = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Nova loja'));
  await act(async () => create?.click());
  const dialog = document.querySelector('[role="dialog"]');
  for (const name of ['Finanças', 'Funcionários']) {
    const label = [...(dialog?.querySelectorAll('label') ?? [])].find((item) => item.textContent?.includes(name));
    expect(label?.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
  }
  await act(async () => root.unmount());
  container.remove();
});
