import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORE_FINANCES,
  ensureCurrentStoreRecurringBills,
  getBillAlert,
  getCustomerBillStatus,
  getBillPaymentOptions,
  type FinanceBill,
} from './storeFinances';
import { ensureAdminMonthlyBill } from './adminBilling';

describe('finanças da loja', () => {
  it('creates the next monthly bill from the recurring bill details', () => {
    const finances = {
      ...EMPTY_STORE_FINANCES,
      bills: [{
        id: 'internet-nov',
        description: 'Internet da loja',
        amount: 149.9,
        dueDate: '2026-11-10',
        boletoCode: '123456',
        validUntil: '2026-11-30',
        isRecurring: true,
        recurrenceId: 'internet-series',
        recurrenceDay: 10,
        recurringMonth: '2026-11',
      }],
    };
    const updated = ensureCurrentStoreRecurringBills(finances, new Date(2026, 11, 1), () => 'internet-dec');

    expect(updated.bills).toHaveLength(2);
    expect(updated.bills[1]).toMatchObject({
      id: 'internet-dec',
      description: 'Internet da loja',
      amount: 149.9,
      dueDate: '2026-12-10',
      boletoCode: '',
      validUntil: '',
      isRecurring: true,
      recurrenceId: 'internet-series',
      recurrenceDay: 10,
      recurringMonth: '2026-12',
    });
  });

  it('does not duplicate a recurring bill within the same month', () => {
    const finances = {
      ...EMPTY_STORE_FINANCES,
      bills: [{
        id: 'internet-nov',
        description: 'Internet da loja',
        amount: 149.9,
        dueDate: '2026-11-10',
        boletoCode: '',
        validUntil: '',
        isRecurring: true,
        recurrenceId: 'internet-series',
        recurrenceDay: 10,
        recurringMonth: '2026-11',
      }],
    };
    const updated = ensureCurrentStoreRecurringBills(finances, new Date(2026, 10, 20), () => 'should-not-be-used');

    expect(updated).toBe(finances);
  });

  it('stops future bills when the latest occurrence has recurrence disabled', () => {
    const finances = {
      ...EMPTY_STORE_FINANCES,
      bills: [{
        id: 'internet-nov',
        description: 'Internet da loja',
        amount: 149.9,
        dueDate: '2026-11-10',
        boletoCode: '',
        validUntil: '',
        isRecurring: false,
        recurrenceId: 'internet-series',
        recurrenceDay: 10,
        recurringMonth: '2026-11',
      }],
    };
    const updated = ensureCurrentStoreRecurringBills(finances, new Date(2026, 11, 1), () => 'should-not-be-used');

    expect(updated).toBe(finances);
  });

  it('migrates existing fixed recurrence settings to a regular recurring bill', () => {
    const migrated = ensureCurrentStoreRecurringBills(
      { ...EMPTY_STORE_FINANCES, recurring: { enabled: true, dueDay: 10, amount: 80, description: 'Aluguel' } },
      new Date(2026, 10, 9),
      () => 'legacy-bill',
    );

    expect(migrated.recurring.enabled).toBe(false);
    expect(migrated.bills[0]).toMatchObject({
      id: 'legacy-bill',
      description: 'Aluguel',
      amount: 80,
      dueDate: '2026-11-10',
      isRecurring: true,
      recurrenceId: 'legacy-bill',
      recurrenceDay: 10,
      recurringMonth: '2026-11',
    });
  });

  it('keeps the existing recurring bill details when migrating old settings', () => {
    const migrated = ensureCurrentStoreRecurringBills({
      ...EMPTY_STORE_FINANCES,
      recurring: { enabled: true, dueDay: 10, amount: 80, description: 'Aluguel' },
      bills: [{
        id: 'legacy-nov',
        description: 'Aluguel revisado',
        amount: 95,
        dueDate: '2026-11-12',
        boletoCode: 'codigo-antigo',
        validUntil: '2026-11-30',
        recurringMonth: '2026-11',
      }],
    }, new Date(2026, 10, 20), () => 'should-not-be-used');
    const nextMonth = ensureCurrentStoreRecurringBills(migrated, new Date(2026, 11, 1), () => 'legacy-dec');

    expect(migrated.bills[0]).toMatchObject({
      description: 'Aluguel revisado',
      amount: 95,
      boletoCode: 'codigo-antigo',
      isRecurring: true,
      recurrenceId: 'legacy-nov',
      recurrenceDay: 12,
    });
    expect(nextMonth.bills[1]).toMatchObject({
      description: 'Aluguel revisado',
      amount: 95,
      dueDate: '2026-12-12',
      boletoCode: '',
    });
  });

  it('clamps the recurring day to the last day of shorter months', () => {
    const finances = {
      ...EMPTY_STORE_FINANCES,
      bills: [{
        id: 'rent-jan',
        description: 'Aluguel',
        amount: 800,
        dueDate: '2027-01-31',
        boletoCode: '',
        validUntil: '',
        isRecurring: true,
        recurrenceId: 'rent-series',
        recurrenceDay: 31,
        recurringMonth: '2027-01',
      }],
    };
    const updated = ensureCurrentStoreRecurringBills(finances, new Date(2027, 1, 5), () => 'rent-feb');

    expect(updated.bills[1].dueDate).toBe('2027-02-28');
  });

  it('generates the Kito bill with boleto and Pix payment options', () => {
    const configured = {
      ...EMPTY_STORE_FINANCES,
      recurring: {
        enabled: true,
        dueDay: 15,
        amount: 249.9,
        paymentType: 'boleto' as const,
        paymentCode: 'boleto-code',
        boletoCode: 'boleto-code',
        pixCode: 'pix@example.com',
      },
    };
    const generated = ensureAdminMonthlyBill(configured, configured.recurring.amount, new Date(2026, 10, 9), () => 'kito-nov');

    expect(generated.bills[0]).toMatchObject({
      description: 'Mensalidade recorrente',
      amount: 249.9,
      dueDate: '2026-11-15',
      paymentType: 'boleto',
      boletoCode: 'boleto-code',
      pixCode: 'pix@example.com',
      recurringMonth: '2026-11',
    });
    expect(getBillPaymentOptions(generated.bills[0])).toEqual([
      { type: 'boleto', code: 'boleto-code' },
      { type: 'pix', code: 'pix@example.com' },
    ]);
    expect(configured.bills).toHaveLength(0);
    expect(configured.recurring.amount).toBe(249.9);
  });

  it('updates current fixed monthly billing when admin changes the payment options', () => {
    const original = {
      ...EMPTY_STORE_FINANCES,
      recurring: { enabled: true, dueDay: 10, amount: 100, boletoCode: 'old-boleto' },
    };
    const first = ensureAdminMonthlyBill(original, 100, new Date(2026, 10, 9), () => 'november-bill');
    const updatedSettings = {
      ...first,
      recurring: { ...first.recurring, amount: 125, boletoCode: 'new-boleto', pixCode: 'new-pix' },
    };
    const updatedBill = ensureAdminMonthlyBill(updatedSettings, 125, new Date(2026, 10, 10), () => 'duplicate-bill');

    expect(updatedBill.bills).toHaveLength(1);
    expect(updatedBill.bills[0]).toMatchObject({
      amount: 125,
      boletoCode: 'new-boleto',
      pixCode: 'new-pix',
    });
  });

  it('shows paid, overdue, due today, due soon, expired and upcoming bill states', () => {
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
    expect(getBillAlert(bill('2026-11-09'), today)).toBe('due-today');
    expect(getBillAlert(bill('2026-11-10'), today)).toBe('due-soon');
    expect(getBillAlert(bill('2026-11-15'), today)).toBe('due-soon');
    expect(getBillAlert(bill('2026-11-16'), today)).toBe('upcoming');
    expect(getBillAlert(bill('2026-11-17'), today)).toBe('upcoming');
    expect(getBillAlert(bill('2026-11-30', { validUntil: '2026-11-08' }), today)).toBe('expired');
    expect(getBillAlert(bill('2026-11-08', { paidAt: '2026-11-08T12:00:00.000Z' }), today)).toBe('paid');
    expect(getCustomerBillStatus(bill('2026-11-08'), today)).toBe('overdue');
    expect(getCustomerBillStatus(bill('2026-11-30', { validUntil: '2026-11-08' }), today)).toBe('expired');
    expect(getCustomerBillStatus(bill('2026-12-10'), today)).toBe('pending');
    expect(getCustomerBillStatus(bill('2026-11-08', { paidAt: '2026-11-08T12:00:00.000Z' }), today)).toBe('paid');
  });
});
