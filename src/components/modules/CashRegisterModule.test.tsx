// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useState, type SetStateAction } from 'react';
import { CashRegisterModule } from './CashRegisterModule';
import type { PaymentSplit } from '@/types';
import type { AtomicRecordOperation } from '@/lib/atomicEmployeeRecords';

const fixtures = vi.hoisted(() => ({
  commit: vi.fn<(tenant: string, operations: AtomicRecordOperation[]) => Promise<void>>().mockResolvedValue(undefined),
  sync: vi.fn(),
  values: {} as Record<string, unknown>,
  setters: {} as Record<string, (value: unknown) => void>,
  tab: 'sales',
}));

vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: {
    id: 'store', slug: 'test', name: 'Teste',
    modules: { pdv: true, estoque: true, employees: true, comandas: true, agendamento: true },
  } }),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'super-admin', isDemo: false, id: 'user', displayName: 'Teste' } }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/atomicEmployeeRecords', () => ({ commitEmployeeRecords: fixtures.commit }));
vi.mock('recharts', async (importOriginal) => ({
  ...await importOriginal<typeof import('recharts')>(),
  ResponsiveContainer: () => null,
}));
vi.mock('@/hooks/usePersistentState', () => ({
  PERSISTENT_STATE_ERROR_EVENT: 'app:persistent-state-error',
  syncPersistentState: fixtures.sync,
  usePersistentState: <T,>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => (fixtures.values[key] ?? initial) as T);
    fixtures.setters[key] = (next) => setValue(next as T);
    return [value, (next: SetStateAction<T>) => setValue(next), true, { key, value, exists: true }];
  },
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children, value }: { children: ReactNode; value: string }) => value === fixtures.tab ? <div>{children}</div> : null,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/modules/PaymentDialog', () => ({
  PaymentDialog: ({ open, total, onConfirm }: { open: boolean; total: number; onConfirm: (splits: PaymentSplit[], change: number) => void }) =>
    open ? <button onClick={() => onConfirm([{ method: 'pix', amount: total }], 0)}>Confirmar teste</button> : null,
}));

afterEach(() => {
  fixtures.tab = 'sales';
  fixtures.setters = {};
  fixtures.commit.mockReset().mockResolvedValue(undefined);
  fixtures.sync.mockClear();
  vi.restoreAllMocks();
});

it('commits a stock sale, movement and employee commission together', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixtures.commit.mockClear();
  fixtures.sync.mockClear();
  fixtures.values = {
    'cash-register:store': { activeSessionId: 'session', sessions: [{ id: 'session' }], sales: [], movements: [] },
    'inventory:store': [{ id: 'p', name: 'Produto teste', price: 10, stock: 5, unit: 'un' }],
    'inventory-movements:store': [],
    'employee-roster:store': [{ id: 'employee', name: 'Pessoa teste', commissionPercent: 10, active: true }],
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<CashRegisterModule mode={fixtures.tab === 'reports' ? 'reports' : 'cash'} />); });
  const origin = [...container.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === 'produto_estoque'));
  expect(origin).toBeDefined();
  await act(async () => {
    if (!origin) return;
    origin.value = 'produto_estoque';
    origin.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const employee = [...container.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === 'employee'));
  await act(async () => {
    if (!employee) throw new Error('Funcionário não encontrado');
    employee.value = 'employee';
    employee.dispatchEvent(new Event('change', { bubbles: true }));
    [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Produto teste'))?.click();
  });
  await act(async () => { [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Informar pagamento'))?.click(); });
  await act(async () => { [...container.querySelectorAll('button')].find((item) => item.textContent === 'Confirmar teste')?.click(); });
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const operations = fixtures.commit.mock.calls[0][1];
  expect(operations).toHaveLength(4);
  expect(operations.find((entry) => entry.snapshot.key === 'cash-register:store')?.value).toMatchObject({
    sales: [{ employeeId: 'employee', employeeCommissionPercent: 10, total: 10 }],
  });
  expect(operations.find((entry) => entry.snapshot.key === 'inventory:store')?.value).toMatchObject([{ stock: 4 }]);
  expect(operations.find((entry) => entry.snapshot.key === 'inventory-movements:store')?.value).toMatchObject([{ productId: 'p', quantity: 1 }]);
  expect(operations.find((entry) => entry.snapshot.key === 'employee-roster:store')?.write).toBe(false);
  await act(async () => root.unmount());
  container.remove();
});

const command = {
  id: 'command', establishmentId: 'store', number: 1, status: 'open',
  items: [{ productId: 'item', name: 'Café', price: 10, quantity: 1 }], total: 10,
};
const appointment = {
  id: 'appointment', clientName: 'Cliente teste', service: 'Corte', professional: 'Ana',
  date: '2026-01-01', time: '10:00', status: 'confirmed', paymentStatus: 'unpaid',
};

async function renderCash() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<CashRegisterModule mode={fixtures.tab === 'reports' ? 'reports' : 'cash'} />); });
  return { container, cleanup: async () => { await act(async () => root.unmount()); container.remove(); } };
}

function setupRecords() {
  fixtures.values = {
    'cash-register:store': { activeSessionId: 'session', sessions: [{ id: 'session' }], sales: [], movements: [] },
    'commands:store': [command],
    'appointments:store': [appointment],
    'services:store': [{ id: 'service', name: 'Corte', price: 10 }],
    'professionals:store': [{ id: 'professional', name: 'Ana' }],
  };
}

async function selectOrigin(container: HTMLElement, value: string) {
  const select = [...container.querySelectorAll('select')].find((item) => [...item.options].some((option) => option.value === value));
  if (!select) throw new Error(`Origem não encontrada: ${value}`);
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Botão não encontrado: ${text}`);
  await act(async () => { button.click(); });
}

it.each([
  ['comanda', 'Cobrar comanda', 'commands:store', { status: 'paid' }],
  ['agendamento', 'Cliente teste', 'appointments:store', { status: 'completed', paymentStatus: 'paid' }],
])('commits %s sale and source in one transaction', async (origin, button, key, expected) => {
  setupRecords();
  const { container, cleanup } = await renderCash();
  await selectOrigin(container, origin);
  await click(container, button);
  await click(container, 'Informar pagamento');
  await click(container, 'Confirmar teste');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const operations = fixtures.commit.mock.calls[0][1];
  expect(operations.find((entry) => entry.snapshot.key === 'cash-register:store')?.value).toMatchObject({ sales: [{ origin, total: 10 }] });
  expect(operations.find((entry) => entry.snapshot.key === key)?.value).toMatchObject([expected]);
  await cleanup();
});

it.each([
  ['comanda', 'Cobrar comanda', 'commands:store', [{ ...command, total: 20 }]],
  ['agendamento', 'Cliente teste', 'appointments:store', [{ ...appointment, status: 'cancelled' }]],
])('does not charge a changed %s while payment is open', async (origin, button, key, changed) => {
  setupRecords();
  const { container, cleanup } = await renderCash();
  await selectOrigin(container, origin);
  await click(container, button);
  await click(container, 'Informar pagamento');
  await act(async () => { fixtures.setters[key](changed); });
  await click(container, 'Confirmar teste');
  expect(fixtures.commit).not.toHaveBeenCalled();
  await cleanup();
});

it('does not apply either side when a linked sale fails', async () => {
  setupRecords();
  fixtures.commit.mockRejectedValueOnce(new Error('conflito'));
  const { container, cleanup } = await renderCash();
  await selectOrigin(container, 'comanda');
  await click(container, 'Cobrar comanda');
  await click(container, 'Informar pagamento');
  await click(container, 'Confirmar teste');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  expect(fixtures.sync).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Comanda 1');
  await cleanup();
});

it.each([
  ['comanda', 'commands:store', { ...command, status: 'paid' }, { status: 'open' }],
  ['agendamento', 'appointments:store', { ...appointment, status: 'completed', paymentStatus: 'paid' }, { status: 'confirmed', paymentStatus: 'unpaid' }],
])('reopens %s atomically when its sale is cancelled', async (origin, key, source, expected) => {
  setupRecords();
  fixtures.tab = 'reports';
  fixtures.values[key] = [source];
  fixtures.values['cash-register:store'] = {
    activeSessionId: 'session', sessions: [{ id: 'session' }], movements: [],
    sales: [{
      id: 'sale', sessionId: 'session', origin, status: 'completed', total: 10,
      createdAt: new Date().toISOString(), paymentMethod: 'pix',
      commandId: origin === 'comanda' ? 'command' : undefined,
      items: [{ productId: 'item', name: 'Teste', price: 10, quantity: 1, sourceRecordId: origin === 'agendamento' ? 'appointment' : undefined }],
    }],
  };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockReturnValue('teste');
  const { container, cleanup } = await renderCash();
  await click(container, 'Estornar');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const operations = fixtures.commit.mock.calls[0][1];
  expect(operations.find((entry) => entry.snapshot.key === 'cash-register:store')?.value).toMatchObject({ sales: [{ status: 'cancelled' }] });
  expect(operations.find((entry) => entry.snapshot.key === key)?.value).toMatchObject([expected]);
  await cleanup();
});

it.each([
  ['comanda', 'commands:store', { ...command, status: 'paid' }, { status: 'open' }],
  ['agendamento', 'appointments:store', { ...appointment, status: 'completed', paymentStatus: 'paid' }, { status: 'confirmed', paymentStatus: 'unpaid' }],
])('reopens %s atomically when its sale is deleted', async (origin, key, source, expected) => {
  setupRecords();
  fixtures.tab = 'reports';
  fixtures.values[key] = [source];
  fixtures.values['cash-register:store'] = {
    activeSessionId: 'session', sessions: [{ id: 'session' }], movements: [],
    sales: [{
      id: 'sale', sessionId: 'session', origin, status: 'completed', total: 10,
      createdAt: new Date().toISOString(), paymentMethod: 'pix',
      commandId: origin === 'comanda' ? 'command' : undefined,
      items: [{ productId: 'item', name: 'Teste', price: 10, quantity: 1, sourceRecordId: origin === 'agendamento' ? 'appointment' : undefined }],
    }],
  };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'prompt').mockReturnValue('teste');
  const { container, cleanup } = await renderCash();
  const button = container.querySelector<HTMLButtonElement>('[aria-label^="Excluir venda"]');
  if (!button) throw new Error('Botão de exclusão não encontrado');
  await act(async () => { button.click(); });
  expect(fixtures.commit).toHaveBeenCalledOnce();
  const operations = fixtures.commit.mock.calls[0][1];
  expect(operations.find((entry) => entry.snapshot.key === 'cash-register:store')?.value).toMatchObject({ sales: [] });
  expect(operations.find((entry) => entry.snapshot.key === key)?.value).toMatchObject([expected]);
  await cleanup();
});

it('allows a previously cancelled appointment to be charged again', async () => {
  setupRecords();
  fixtures.values['cash-register:store'] = {
    activeSessionId: 'session', sessions: [{ id: 'session' }], movements: [],
    sales: [{ id: 'old', origin: 'agendamento', status: 'cancelled', items: [{ sourceRecordId: 'appointment' }] }],
  };
  const { container, cleanup } = await renderCash();
  await selectOrigin(container, 'agendamento');
  await click(container, 'Cliente teste');
  await click(container, 'Informar pagamento');
  await click(container, 'Confirmar teste');
  expect(fixtures.commit).toHaveBeenCalledOnce();
  await cleanup();
});
