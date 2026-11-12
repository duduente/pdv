// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useState, type SetStateAction } from 'react';
import { expect, it, vi } from 'vitest';
import { DeliveryModule } from './DeliveryModule';
import type { AtomicRecordOperation } from '@/lib/atomicEmployeeRecords';
import type { EmployeeRosterEntry } from '@/lib/employeeSettlement';
import type { PaymentSplit } from '@/types';

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
vi.mock('@/components/modules/PaymentDialog', () => ({
  PaymentDialog: ({ open, total, onConfirm, employeeSelection }: {
    open: boolean; total: number; onConfirm: (splits: PaymentSplit[], change: number) => void;
    employeeSelection?: { employees: EmployeeRosterEntry[]; selectedId: string; onChange: (id: string) => void };
  }) => open ? <div>
    <select value={employeeSelection?.selectedId} onChange={(event) => employeeSelection?.onChange(event.target.value)}>
      <option value="">Sem funcionário</option>
      {employeeSelection?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
    </select>
    <button onClick={() => onConfirm([{ method: 'pix', amount: total }], 0)}>Confirmar teste</button>
  </div> : null,
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
  const employee = [...container.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === 'employee'));
  await act(async () => {
    if (!employee) throw new Error('Funcionário não encontrado');
    employee.value = 'employee';
    employee.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => { [...container.querySelectorAll('button')].find((item) => item.textContent === 'Confirmar teste')?.click(); });
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
