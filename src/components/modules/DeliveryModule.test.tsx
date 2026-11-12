// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState, type SetStateAction } from 'react';
import { expect, it, vi } from 'vitest';
import { DeliveryModule } from './DeliveryModule';
import type { AtomicRecordOperation } from '@/lib/atomicEmployeeRecords';

const fixtures = vi.hoisted(() => ({
  commit: vi.fn<(tenant: string, operations: AtomicRecordOperation[]) => Promise<void>>().mockResolvedValue(undefined),
  sync: vi.fn(),
  values: {} as Record<string, unknown>,
}));

vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: {
    id: 'store', slug: 'test', name: 'Teste', theme: { accentColor: '#fff' },
    modules: { delivery: true, employees: true },
  } }),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'super-admin', isDemo: false, id: 'user', displayName: 'Teste' } }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: fixtures.values['menu-orders:store'] }, error: null }) }) }) }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/lib/atomicEmployeeRecords', () => ({ commitEmployeeRecords: fixtures.commit }));
vi.mock('@/hooks/usePersistentState', () => ({
  PERSISTENT_STATE_ERROR_EVENT: 'app:persistent-state-error',
  syncPersistentState: fixtures.sync,
  usePersistentState: <T,>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => (fixtures.values[key] ?? initial) as T);
    return [value, (next: SetStateAction<T>) => setValue(next), true, { key, value, exists: true }];
  },
}));
it('commits delivery payment, order status and employee commission together', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.commit.mockClear();
  fixtures.sync.mockClear();
  fixtures.values = {
    'cash-register:store': { activeSessionId: 'session', sessions: [{ id: 'session' }], sales: [], movements: [] },
    'employee-roster:store': [{ id: 'employee', name: 'Pessoa teste', commissionPercent: 10, active: true }],
    'menu-orders:store': [{
      id: 'order', establishmentId: 'store', channel: 'delivery', status: 'pending', deliveryStatus: 'dispatched',
      orderType: 'pickup', customerName: 'Cliente', items: [{ productId: 'p', name: 'Produto', price: 10, quantity: 1 }],
      total: 10, createdAt: '2020-11-15T12:00:00',
    }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<DeliveryModule />); });
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-expanded="false"]')?.click(); });
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Finalizar pagamento"]')?.click(); });
  const employee = [...document.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === 'employee'));
  await act(async () => {
    if (!employee) throw new Error('Funcionário não encontrado');
    employee.value = 'employee';
    employee.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { [...document.querySelectorAll('button')].find((item) => item.textContent === 'Confirmar pagamento')?.click(); });
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const operations = fixtures.commit.mock.calls[0][1];
  expect(operations).toHaveLength(3);
  expect(operations.find((entry) => entry.snapshot.key === 'cash-register:store')?.value).toMatchObject({
    sales: [{ employeeId: 'employee', employeeCommissionPercent: 10, total: 10 }],
  });
  expect(operations.find((entry) => entry.snapshot.key === 'menu-orders:store')?.value).toMatchObject([{ id: 'order', status: 'paid', deliveryStatus: 'finalized' }]);
  expect(operations.find((entry) => entry.snapshot.key === 'employee-roster:store')?.write).toBe(false);
  await act(async () => root.unmount());
  container.remove();
});

it('creates an order in customer, products and payment steps and supports going back', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.values = {
    'cash-register:store': { activeSessionId: null, sessions: [], sales: [], movements: [] },
    'menu-orders:store': [],
    'menu-items:store': [{ id: 'item', name: 'Hambúrguer teste', price: 25 }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<DeliveryModule />));
  const click = async (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === label);
    if (!button) throw new Error(`Botão não encontrado: ${label}`);
    await act(async () => button.click());
  };
  const input = async (label: string, value: string) => {
    const field = [...document.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label))?.querySelector('input');
    if (!field) throw new Error(`Campo não encontrado: ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  await click('Novo pedido');
  expect(document.body.textContent).toContain('Etapa 1 de 3');
  expect(document.body.textContent).not.toContain('Adicionar do cardápio');
  await click('Próximo: produtos');
  expect(document.body.textContent).toContain('Etapa 1 de 3');
  await click('RETIRADA');
  await input('Nome', 'Cliente teste');
  await input('Telefone', '11999999999');
  await input('CPF ou CNPJ', '12345678900');
  await click('Próximo: produtos');
  expect(document.body.textContent).toContain('Etapa 2 de 3');
  expect(document.body.textContent).not.toContain('CPF ou CNPJ');
  await click('Próximo: pagamento');
  expect(document.body.textContent).not.toContain('Etapa 3 de 3');
  await click('Hambúrguer testeR$ 25,00');
  await click('Voltar');
  expect([...document.querySelectorAll('label')].find((item) => item.textContent?.startsWith('Nome'))?.querySelector('input')?.value).toBe('Cliente teste');
  await click('Próximo: produtos');
  expect(document.body.textContent).toContain('1× Hambúrguer teste');
  await click('Próximo: pagamento');
  expect(document.body.textContent).toContain('Etapa 3 de 3');
  const paymentDialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent?.includes('Etapa 3 de 3'));
  const back = [...(paymentDialog?.querySelectorAll('button') ?? [])].find((item) => item.textContent === 'Voltar');
  await act(async () => back?.click());
  expect(document.body.textContent).toContain('1× Hambúrguer teste');
  expect(container.textContent).not.toContain('Cliente teste');
  await click('Próximo: pagamento');
  const payment = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent?.includes('Etapa 3 de 3'));
  const method = payment?.querySelector<HTMLSelectElement>('select');
  if (!method) throw new Error('Forma de pagamento não encontrada');
  await act(async () => { method.value = 'pix'; method.dispatchEvent(new Event('change', { bubbles: true })); });
  const confirm = [...(payment?.querySelectorAll('button') ?? [])].find((item) => item.textContent === 'Criar pedido');
  expect(confirm).toBeTruthy();
  await act(async () => confirm?.click());
  expect(container.textContent).toContain('Cliente teste');
  expect(container.textContent).toContain('R$ 25,00');
  expect(document.body.textContent).not.toContain('Etapa 3 de 3');
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-expanded="false"]')?.click());
  expect(container.textContent).toContain('Pix');
  await act(async () => root.unmount());
  container.remove();
});
