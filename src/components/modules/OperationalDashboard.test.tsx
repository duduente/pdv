// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OperationalDashboard } from './OperationalDashboard';

const fixtures = vi.hoisted(() => ({ values: {} as Record<string, unknown>, permissions: [] as string[] }));
vi.mock('@/store', () => ({ useApp: () => ({ selectedEstablishment: {
  id: 'store', slug: 'test', modules: { pdv: true, agendamento: true, cardapio: true, delivery: true, finance: true, estoque: true, comandas: true },
} }) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: {} }) }));
vi.mock('@/auth/permissions', () => ({ hasStorePermission: (_user: unknown, _id: string, permission: string) => fixtures.permissions.includes(permission) }));
vi.mock('@/lib/adminBilling', () => ({
  loadAdminBilling: vi.fn().mockResolvedValue({ recurring: { enabled: false }, bills: [{ dueDate: '2000-01-01' }] }),
  ensureNextAdminMonthlyBill: vi.fn(),
}));
vi.mock('@/hooks/usePersistentState', () => ({
  usePersistentState: (key: string, initial: unknown) => [fixtures.values[key] ?? initial, vi.fn(), true],
}));

it('counts active daily activity and pending items only for authorized modules', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  fixtures.permissions = ['agendamento', 'delivery', 'finance'];
  fixtures.values = {
    'appointments:store': [
      { date: today, status: 'confirmed' }, { date: today, status: 'completed' }, { date: today, status: 'cancelled' },
    ],
    'menu-orders:store': [
      { createdAt: `${today}T12:00:00`, status: 'pending', deliveryStatus: 'production' },
      { createdAt: `${today}T12:00:00`, status: 'pending', deliveryStatus: 'cancelled' },
    ],
    'store-finances:store': { bills: [
      { dueDate: today }, { dueDate: today, paidAt: `${today}T12:00:00` },
    ], recurring: { enabled: false } },
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<OperationalDashboard />); });
  const card = (title: string) => [...container.querySelectorAll('h2')].find((item) => item.textContent === title)?.parentElement?.textContent;
  expect(card('Agendamentos')).toContain('Hoje2');
  expect(card('Agendamentos')).toContain('A realizar hoje1');
  expect(card('Pedidos')).toContain('Hoje1');
  expect(card('Pedidos')).toContain('Aguardando pagamento1');
  expect(card('Contas da loja')).toContain('Vencem hoje1');
  expect(card('Cobranças Kito')).toContain('Vencidas1');
  expect(card('Vendas')).toBeUndefined();
  expect(card('Estoque')).toBeUndefined();
  expect(container.querySelector('svg.recharts-surface')).toBeNull();
  await act(async () => root.unmount());
  container.remove();
});
