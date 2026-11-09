import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORE_FINANCES,
  ensureCurrentRecurringBill,
  getBillAlert,
  type FinanceBill,
} from './storeFinances';
import { ensureAdminMonthlyBill } from './adminBilling';

describe('finanças da loja', () => {
  it('creates one fixed monthly bill for the current month and keeps it editable', () => {
    const recurring = { enabled: true, dueDay: 10, amount: 149.9 };
    const first = ensureCurrentRecurringBill(
      { ...EMPTY_STORE_FINANCES, recurring },
      new Date(2026, 10, 9),
      () => 'bill-1',
    );
    const updated = ensureCurrentRecurringBill(
      { ...first, bills: first.bills.map((bill) => ({ ...bill, boletoCode: '123456' })) },
      new Date(2026, 10, 20),
      () => 'bill-2',
    );

    expect(first.bills).toHaveLength(1);
    expect(first.bills[0]).toMatchObject({ amount: 149.9, dueDate: '2026-11-10', recurringMonth: '2026-11' });
    expect(updated.bills).toHaveLength(1);
    expect(updated.bills[0].boletoCode).toBe('123456');
  });

  it('clamps a recurring due day to the last day of shorter months', () => {
    const finances = ensureCurrentRecurringBill(
      { ...EMPTY_STORE_FINANCES, recurring: { enabled: true, dueDay: 31, amount: 80 } },
      new Date(2027, 1, 5),
      () => 'bill-feb',
    );
    expect(finances.bills[0].dueDate).toBe('2027-02-28');
  });

  it('generates the Kito bill using the store subscription price and admin due day', () => {
    const configured = {
      ...EMPTY_STORE_FINANCES,
      recurring: { enabled: true, dueDay: 15, amount: 0 },
    };
    const generated = ensureAdminMonthlyBill(configured, 249.9, new Date(2026, 10, 9), () => 'kito-nov');

    expect(generated.bills[0]).toMatchObject({
      description: 'Mensalidade recorrente',
      amount: 249.9,
      dueDate: '2026-11-15',
      recurringMonth: '2026-11',
    });
    expect(configured.bills).toHaveLength(0);
    expect(configured.recurring.amount).toBe(0);
  });

  it('shows paid, overdue, due soon, expired and upcoming bill states', () => {
    const today = new Date(2026, 10, 9);
    const bill = (dueDate: string, overrides: Partial<FinanceBill> = {}): FinanceBill => ({
      id: 'bill',
      description: 'Boleto',
      amount: 100,
      dueDate,
      boletoCode: '',
      validUntil: '',
      ...overrides,
    });

    expect(getBillAlert(bill('2026-11-08'), today)).toBe('overdue');
    expect(getBillAlert(bill('2026-11-10'), today)).toBe('due-soon');
    expect(getBillAlert(bill('2026-12-10'), today)).toBe('upcoming');
    expect(getBillAlert(bill('2026-11-30', { validUntil: '2026-11-08' }), today)).toBe('expired');
    expect(getBillAlert(bill('2026-11-08', { paidAt: '2026-11-08T12:00:00.000Z' }), today)).toBe('paid');
  });
});
