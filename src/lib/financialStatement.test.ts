import { describe, expect, it } from 'vitest';
import type { CashExpense, CashSale } from '@/types';
import type { FinanceBill } from '@/lib/storeFinances';
import { buildFinancialStatement } from './financialStatement';

const createSale = (id: string, createdAt: string, total: number, status: CashSale['status'] = 'paid'): CashSale => ({
  id,
  establishmentId: 'store-1',
  sessionId: 'session-1',
  createdAt,
  items: [{ productId: 'product-1', name: 'Café', price: total, quantity: 1 }],
  total,
  origin: 'avulso',
  paymentMethod: 'pix',
  amountReceived: total,
  change: 0,
  status,
});

const createExpense = (
  id: string,
  createdAt: string,
  amount: number,
  cancelledAt?: string,
): CashExpense => ({
  id,
  establishmentId: 'store-1',
  createdAt,
  description: 'Energia',
  category: 'Contas',
  amount,
  paymentMethod: 'pix',
  recordedBy: 'Admin',
  cancelledAt,
});

const createBill = (id: string, paidAt?: string, recurringMonth?: string): FinanceBill => ({
  id,
  description: id,
  amount: 25,
  dueDate: '2026-11-09',
  boletoCode: '',
  validUntil: '',
  paidAt,
  recurringMonth,
});

describe('extrato financeiro', () => {
  it('sums only valid sales, expenses and bill payments within the selected period', () => {
    const statement = buildFinancialStatement({
      sales: [
        createSale('sale-today', '2026-11-09T10:00:00', 100),
        createSale('sale-cancelled', '2026-11-09T11:00:00', 900, 'cancelled'),
        createSale('sale-other-day', '2026-11-08T10:00:00', 500),
      ],
      expenses: [
        createExpense('expense-today', '2026-11-09T12:00:00', 20),
        createExpense('expense-cancelled', '2026-11-09T13:00:00', 500, '2026-11-09T14:00:00'),
      ],
      storeBills: [
        createBill('store-paid', '2026-11-09T15:00:00'),
        createBill('store-unpaid'),
      ],
      kitoBills: [
        createBill('kito-paid', '2026-11-09T16:00:00', '2026-11'),
        createBill('kito-unpaid'),
      ],
      period: 'day',
      referenceDate: '2026-11-09',
    });

    expect(statement).toMatchObject({
      grossRevenue: 100,
      cashExpenseTotal: 20,
      storeBillPaymentsTotal: 25,
      kitoBillPaymentsTotal: 25,
      totalOutflows: 70,
      balance: 30,
    });
    expect(statement.rows.map((row) => row.id)).toEqual([
      'kito-bill:kito-paid',
      'store-bill:store-paid',
      'expense:expense-today',
      'sale:sale-today',
    ]);
  });
});
