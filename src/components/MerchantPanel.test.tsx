// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MerchantPanel } from './MerchantPanel';

const fixtures = vi.hoisted(() => ({
  establishment: {
    id: 'store', name: 'Teste', owner: 'Teste', slug: 'test', plan: 'teste', theme: {},
    modules: { pdv: true, agendamento: true, cardapio: false, estoque: false, comandas: false, delivery: false, finance: false, employees: false },
  },
  user: { role: 'super-admin', isDemo: true, establishmentPermissions: {} } as {
    role: 'super-admin' | 'merchant'; isDemo: boolean; establishmentPermissions: Record<string, string[]>;
  },
}));
vi.mock('@/store', () => ({ useApp: () => ({ selectedEstablishment: fixtures.establishment, viewPublicPage: vi.fn(), updateEstablishment: vi.fn() }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: fixtures.user }) }));
vi.mock('@/lib/supabase', () => ({ supabase: null }));
vi.mock('@/hooks/usePersistentState', () => ({
  PERSISTENT_STATE_ERROR_EVENT: 'app:persistent-state-error',
  usePersistentState: (_key: string, initial: unknown) => [initial, vi.fn(), true],
}));
vi.mock('@/components/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('@/components/SupportChat', () => ({ SupportChat: () => null }));
vi.mock('./modules/CashRegisterModule', () => ({ CashRegisterModule: ({ mode }: { mode?: string }) => <div>{mode === 'reports' ? 'Relatório de caixa' : 'Operações do caixa'}</div> }));
vi.mock('./modules/AppointmentModule', () => ({ AppointmentModule: () => null, AppointmentSettings: () => <div>Horários e serviços de agendamento</div>, ProfessionalRevenueTab: () => <div>Relatório por profissional</div> }));
vi.mock('recharts', async (original) => ({ ...await original<typeof import('recharts')>(), ResponsiveContainer: () => <div data-testid="chart" /> }));

it('keeps charts out of the dashboard and exposes reports in separate navigation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<MerchantPanel />); });
  expect(container.textContent).toContain('Agendamentos');
  expect(container.querySelector('[data-testid="chart"]')).toBeNull();
  const reportButton = [...container.querySelectorAll('button')].find((item) => item.title === 'Relatórios');
  expect(reportButton).toBeTruthy();
  await act(async () => { reportButton?.click(); });
  expect(container.textContent).toContain('Relatório de caixa');
  expect(container.textContent).not.toContain('Relatório por profissional');
  expect(container.textContent).not.toContain('Atividade do caixa');
  const selectTab = async (label: string) => {
    const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((item) => item.textContent === label);
    if (!tab) throw new Error(`Aba não encontrada: ${label}`);
    await act(async () => tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  };
  await selectTab('Movimentações do caixa');
  expect(container.textContent).toContain('Atividade do caixa');
  expect(container.textContent).toContain('Vendas, sangrias e suprimentos');
  expect(container.textContent).not.toContain('Relatório de caixa');
  expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
  await selectTab('Profissionais');
  expect(container.textContent).toContain('Relatório por profissional');
  expect(container.textContent).not.toContain('Atividade do caixa');
  await act(async () => root.unmount());
  container.remove();
});

it('allows a reports-only user to access reports without exposing the cash register', async () => {
  fixtures.user = { role: 'merchant', isDemo: false, establishmentPermissions: { store: ['pdv-reports'] } };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<MerchantPanel />); });
  expect(container.textContent).toContain('Relatório de caixa');
  expect(container.textContent).not.toContain('Operações do caixa');
  expect(container.textContent).not.toContain('Relatório por profissional');
  expect(container.textContent).not.toContain('Esta conta não tem permissões');
  expect([...container.querySelectorAll('button')].some((button) => button.title === 'Frente de Caixa')).toBe(false);
  await act(async () => root.unmount());
  container.remove();
  fixtures.user = { role: 'super-admin', isDemo: true, establishmentPermissions: {} };
});

it('shows professionals without cash report permission and hides cash report tabs', async () => {
  fixtures.user = { role: 'merchant', isDemo: false, establishmentPermissions: { store: ['agendamento'] } };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<MerchantPanel />));
  const reportButton = [...container.querySelectorAll('button')].find((item) => item.title === 'Relatórios');
  await act(async () => reportButton?.click());
  expect(container.textContent).toContain('Relatório por profissional');
  expect(container.textContent).not.toContain('Movimentações do caixa');
  expect(container.textContent).not.toContain('Relatório de caixa');
  const settings = [...container.querySelectorAll('button')].find((item) => item.title === 'Configurações da loja');
  expect(settings).toBeTruthy();
  await act(async () => settings?.click());
  expect(container.textContent).toContain('Horários e serviços de agendamento');
  expect(container.textContent).not.toContain('Salvar alterações');
  await act(async () => root.unmount());
  container.remove();
  fixtures.user = { role: 'super-admin', isDemo: true, establishmentPermissions: {} };
});
