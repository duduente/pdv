// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode, type SetStateAction } from 'react';
import { EmployeesModule } from './EmployeesModule';

const fixtures = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  error: vi.fn(),
  listStoreUsers: vi.fn(async () => []),
  remote: false,
  commit: vi.fn(),
  exportConsumptions: vi.fn(),
}));

vi.mock('@/store', () => ({
  useApp: () => ({ selectedEstablishment: { id: 'store', name: 'Loja teste', slug: 'test', modules: { estoque: true, cardapio: false } } }),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'super-admin', isDemo: !fixtures.remote }, listStoreUsers: fixtures.listStoreUsers }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/atomicEmployeeRecords', () => ({ commitEmployeeRecords: fixtures.commit }));
vi.mock('@/lib/reportExport', () => ({ downloadEmployeeConsumptionReport: fixtures.exportConsumptions }));
vi.mock('@/hooks/usePersistentState', () => ({
  PERSISTENT_STATE_ERROR_EVENT: 'app:persistent-state-error',
  PERSISTENT_STATE_SAVED_EVENT: 'app:persistent-state-saved',
  syncPersistentState: vi.fn(),
  usePersistentState: <T,>(key: string, initial: T) => {
    const [value, setValue] = useState<T>(() => (fixtures.values[key] ?? initial) as T);
    return [value, (next: SetStateAction<T>) => setValue((previous) => {
      const updated = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
      fixtures.values[key] = updated;
      return updated;
    }), true, { key, value, exists: true }];
  },
}));
vi.mock('sonner', () => ({ toast: { error: fixtures.error, success: vi.fn() } }));
vi.mock('@/components/ui/currency-input', () => ({
  CurrencyInput: ({ value, onValueChange }: { value: number; onValueChange: (value: number | null) => void }) =>
    <input type="number" value={value} onChange={(event) => onValueChange(Number(event.target.value))} />,
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function field(container: HTMLElement, label: string): HTMLInputElement | HTMLSelectElement {
  const found = [...container.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label));
  const input = found?.querySelector('input, select');
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) throw new Error(`Missing field: ${label}`);
  return input;
}

function setField(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

function button(container: HTMLElement, text: string) {
  const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe('employee integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fixtures.values = {
      'store-finances:store': {
        recurring: { enabled: false, dueDay: 10, amount: 0 }, bills: [],
        employees: {
          employees: [{ id: 'employee', name: 'Pessoa teste', salaryCents: 10_000, commissionPercent: 10, consumptionDiscountPercent: 50, active: true }],
          consumptions: [], settlements: [],
        },
      },
      'employee-roster:store': [{ id: 'employee', name: 'Pessoa teste', commissionPercent: 10, active: true }],
      'cash-register:store': {
        sessions: [], movements: [], activeSessionId: null,
        sales: [{ id: 'sale', establishmentId: 'store', employeeId: 'employee', employeeCommissionPercent: 10, createdAt: '2020-11-15T12:00:00', total: 100 }],
      },
      'inventory:store': [{ id: 'product', name: 'Produto teste', price: 10, stock: 5, unit: 'un' }],
      'inventory-movements:store': [],
      'menu-items:store': [],
    };
    fixtures.error.mockClear();
    fixtures.remote = false;
    fixtures.commit.mockReset();
    fixtures.exportConsumptions.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<EmployeesModule />); });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('deducts inventory for a consumption and generates a pending payroll bill', async () => {
    await act(async () => {
      setField(field(container, 'Funcionário'), 'employee');
      setField(field(container, 'Origem'), 'inventory');
    });

    await act(async () => {
      setField(field(container, 'Item'), 'product');
      setField(field(container, 'Quantidade'), '2');
      setField(field(container, 'Data'), '2020-11-15');
    });
    await act(async () => { button(container, 'Lançar consumo').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixtures.values['inventory:store']).toMatchObject([{ id: 'product', stock: 3 }]);
    expect(fixtures.values['inventory-movements:store']).toMatchObject([{ productId: 'product', quantity: 2 }]);
    await act(async () => {
      setField(field(container, 'Mês'), '2020-11');
      setField(field(container, 'Vencimento da conta'), '2020-12-05');
    });
    await act(async () => {
      const close = button(container, 'Fechar mês e gerar conta');
      close.click();
      close.click();
    });
    expect(fixtures.values['store-finances:store']).toMatchObject({
      bills: [{ amount: 100, dueDate: '2020-12-05', source: 'employee-settlement' }],
      employees: {
        consumptions: [{ amountCents: 2_000, discountPercent: 50 }],
        settlements: [{ month: '2020-11', salaryCents: 10_000, commissionCents: 1_000, consumptionCents: 1_000, payableCents: 10_000 }],
      },
    });
  });

  it('only shows the local storage limitation in demonstration mode', async () => {
    expect(container.textContent).toContain('Modo demonstração: dados locais');
    fixtures.remote = true;
    await act(async () => { root.render(<EmployeesModule />); });
    expect(container.textContent).not.toContain('Modo demonstração: dados locais');
    expect(container.textContent).not.toContain('Versão para testes');
  });

  it('exports the visible consumptions and reports export failures', async () => {
    const finances = fixtures.values['store-finances:store'] as { employees: { consumptions: unknown[] } };
    finances.employees.consumptions.push(
      { consumptionId: 'one', employeeId: 'employee', month: '2020-11', amountCents: 500, discountPercent: 0 },
      { consumptionId: 'two', employeeId: 'other', month: '2020-11', amountCents: 600, discountPercent: 0, cancelled: true },
    );
    await act(async () => { root.render(<EmployeesModule />); });
    await act(async () => { button(container, 'Exportar Excel').click(); });
    expect(fixtures.exportConsumptions).toHaveBeenLastCalledWith(expect.objectContaining({
      establishmentName: 'Loja teste',
      consumptions: expect.arrayContaining([expect.objectContaining({ consumptionId: 'one' }), expect.objectContaining({ consumptionId: 'two', cancelled: true })]),
    }));
    await act(async () => { setField(field(container, 'Funcionário'), 'employee'); });
    fixtures.exportConsumptions.mockRejectedValueOnce(new Error('erro no arquivo'));
    await act(async () => { button(container, 'Exportar Excel').click(); });
    expect(fixtures.exportConsumptions).toHaveBeenLastCalledWith(expect.objectContaining({
      consumptions: [expect.objectContaining({ consumptionId: 'one' })],
    }));
    expect(fixtures.error).toHaveBeenCalledWith('Não foi possível exportar os consumos: erro no arquivo');
  });

  it('creates an employee and publishes only the sales roster fields', async () => {
    await act(async () => {
      setField(field(container, 'Nome'), 'Nova pessoa');
      setField(field(container, 'Salário mensal'), '200');
      setField(field(container, 'Comissão (%)'), '12.5');
      setField(field(container, 'Desconto no consumo (%)'), '20');
    });
    await act(async () => { button(container, 'Cadastrar funcionário').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixtures.values['store-finances:store']).toMatchObject({
      employees: { employees: [
        { id: 'employee' },
        { name: 'Nova pessoa', salaryCents: 20_000, commissionPercent: 12.5, consumptionDiscountPercent: 20 },
      ] },
    });
    const roster = fixtures.values['employee-roster:store'] as Record<string, unknown>[];
    expect(roster[1]).toMatchObject({ name: 'Nova pessoa', commissionPercent: 12.5 });
    expect(roster[1]).not.toHaveProperty('salaryCents');
    expect(roster[1]).not.toHaveProperty('consumptionDiscountPercent');
    const professionals = JSON.parse(window.localStorage.getItem('professionals:store') ?? '[]');
    expect(professionals).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Nova pessoa' })]));
    expect(professionals[1]).not.toHaveProperty('commissionPercent');
  });

  it('preserves the role and publishes deactivation with the employee transaction', async () => {
    fixtures.remote = true;
    fixtures.commit.mockResolvedValue(undefined);
    const finances = fixtures.values['store-finances:store'] as { employees: { employees: { role?: string }[] } };
    finances.employees.employees[0].role = 'Barbeiro';
    await act(async () => { root.render(<EmployeesModule />); });
    await act(async () => { button(container, 'Editar').click(); });
    const active = field(container, 'Ativo para vendas e agendamentos');
    await act(async () => { active.click(); });
    await act(async () => { button(container, 'Salvar funcionário').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixtures.commit).toHaveBeenCalledOnce();
    expect(fixtures.commit.mock.calls[0][1]).toMatchObject([
      { value: { employees: { employees: [{ id: 'employee', role: 'Barbeiro', active: false }] } } },
      { value: [{ id: 'employee', active: false }] },
    ]);
  });

  it('does not record a consumption when inventory is insufficient', async () => {
    await act(async () => {
      setField(field(container, 'Funcionário'), 'employee');
      setField(field(container, 'Origem'), 'inventory');
    });
    await act(async () => {
      setField(field(container, 'Item'), 'product');
      setField(field(container, 'Quantidade'), '6');
    });
    await act(async () => { button(container, 'Lançar consumo').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixtures.error).toHaveBeenCalledWith('Produto indisponível ou estoque insuficiente.');
    expect(fixtures.values['inventory:store']).toMatchObject([{ stock: 5 }]);
    expect(fixtures.values['store-finances:store']).toMatchObject({ employees: { consumptions: [] } });
  });

  it('does not close a month before it ends', async () => {
    await act(async () => { setField(field(container, 'Funcionário'), 'employee'); });
    await act(async () => { button(container, 'Fechar mês e gerar conta').click(); });
    expect(fixtures.error).toHaveBeenCalledWith('Feche o mês somente após seu término.');
    expect(fixtures.values['store-finances:store']).toMatchObject({ employees: { settlements: [] }, bills: [] });
  });

  it('prevents adding or cancelling a consumption before a later closed month', async () => {
    const finances = fixtures.values['store-finances:store'] as {
      employees: { consumptions: unknown[]; settlements: unknown[] };
    };
    finances.employees.consumptions.push({
      consumptionId: 'old', employeeId: 'employee', month: '2020-10', amountCents: 500,
      discountPercent: 0, description: 'Consumo anterior', createdAt: '2020-10-10',
    });
    finances.employees.settlements.push({
      employeeId: 'employee', month: '2020-11', nextCarriedDebtCents: 0,
      sales: [], consumptionIds: [], reversedSaleIds: [],
    });
    await act(async () => { root.render(<EmployeesModule />); });
    await act(async () => {
      setField(field(container, 'Funcionário'), 'employee');
      setField(field(container, 'Descrição'), 'Outro consumo');
      setField(field(container, 'Valor unitário'), '5');
      setField(field(container, 'Data'), '2020-10-15');
    });
    await act(async () => {
      button(container, 'Lançar consumo').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fixtures.error).toHaveBeenLastCalledWith('O mês deste consumo ou um mês posterior já foi fechado.');
    await act(async () => { button(container, 'Cancelar').click(); });
    expect(fixtures.error).toHaveBeenLastCalledWith('O mês deste consumo ou um mês posterior já foi fechado.');
    expect(finances.employees.consumptions).toHaveLength(1);
    expect(finances.employees.consumptions[0]).not.toHaveProperty('cancelled');
  });

  it('does not apply inventory or consumption when the transaction fails', async () => {
    fixtures.remote = true;
    fixtures.commit.mockRejectedValue(new Error('conflito de gravação'));
    await act(async () => { root.render(<EmployeesModule />); });
    await act(async () => {
      setField(field(container, 'Funcionário'), 'employee');
      setField(field(container, 'Origem'), 'inventory');
    });
    await act(async () => {
      setField(field(container, 'Item'), 'product');
      setField(field(container, 'Quantidade'), '2');
    });
    await act(async () => { button(container, 'Lançar consumo').closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(fixtures.commit).toHaveBeenCalledOnce();
    expect(fixtures.commit.mock.calls[0][1]).toHaveLength(3);
    expect(fixtures.error).toHaveBeenCalledWith('conflito de gravação');
    expect(fixtures.values['inventory:store']).toMatchObject([{ stock: 5 }]);
    expect(fixtures.values['store-finances:store']).toMatchObject({ employees: { consumptions: [] } });
  });

  it('checks the cash register and prevents duplicate monthly closings while saving', async () => {
    fixtures.remote = true;
    let finish: (() => void) | undefined;
    fixtures.commit.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await act(async () => { root.render(<EmployeesModule />); });
    await act(async () => {
      setField(field(container, 'Funcionário'), 'employee');
      setField(field(container, 'Mês'), '2020-11');
    });
    await act(async () => {
      const close = button(container, 'Fechar mês e gerar conta');
      close.click();
      close.click();
    });
    expect(fixtures.commit).toHaveBeenCalledOnce();
    expect(fixtures.commit.mock.calls[0][1]).toMatchObject([
      { snapshot: { key: 'store-finances:store' }, write: true },
      { snapshot: { key: 'cash-register:store' }, write: false },
    ]);
    await act(async () => { finish?.(); });
  });
});
