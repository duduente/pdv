import type { CashExpense, CashSale, PaymentMethod } from '@/types';
import { isDateInReportPeriod, type ReportPeriod } from '@/lib/criticalFlows';
import type { FinanceBill } from '@/lib/storeFinances';

export interface FinancialStatementEntry {
  id: string;
  date: string;
  type: 'revenue' | 'expense';
  description: string;
  detail: string;
  amount: number;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  outro: 'Outro',
};

export function buildFinancialStatement({
  sales,
  expenses,
  storeBills,
  kitoBills,
  period,
  referenceDate,
}: {
  sales: CashSale[];
  expenses: CashExpense[];
  storeBills: FinanceBill[];
  kitoBills: FinanceBill[];
  period: ReportPeriod;
  referenceDate: string;
}) {
  const periodSales = sales.filter((sale) => (
    sale.status !== 'cancelled' && isDateInReportPeriod(sale.createdAt, period, referenceDate)
  ));
  const periodExpenses = expenses.filter((expense) => (
    !expense.cancelledAt && isDateInReportPeriod(expense.createdAt, period, referenceDate)
  ));
  const periodStoreBillPayments = storeBills.filter((bill) => (
    Boolean(bill.paidAt) && isDateInReportPeriod(bill.paidAt ?? '', period, referenceDate)
  ));
  const periodKitoBillPayments = kitoBills.filter((bill) => (
    Boolean(bill.paidAt) && isDateInReportPeriod(bill.paidAt ?? '', period, referenceDate)
  ));
  const sumAmount = <T,>(items: T[], getAmount: (item: T) => number) => (
    items.reduce((sum, item) => sum + getAmount(item), 0)
  );
  const grossRevenue = sumAmount(periodSales, (sale) => sale.total);
  const cashExpenseTotal = sumAmount(periodExpenses, (expense) => expense.amount);
  const storeBillPaymentsTotal = sumAmount(periodStoreBillPayments, (bill) => bill.amount);
  const kitoBillPaymentsTotal = sumAmount(periodKitoBillPayments, (bill) => bill.amount);
  const rows: FinancialStatementEntry[] = [
    ...periodSales.map((sale) => ({
      id: `sale:${sale.id}`,
      date: sale.createdAt,
      type: 'revenue' as const,
      description: `Venda · ${sale.items.map((item) => `${item.quantity}× ${item.name}`).join(', ') || 'Venda'}`,
      detail: `Recebimento · ${sale.paymentSplits?.length
        ? sale.paymentSplits.map((split) => PAYMENT_METHOD_LABELS[split.method]).join(' + ')
        : PAYMENT_METHOD_LABELS[sale.paymentMethod]}`,
      amount: sale.total,
    })),
    ...periodExpenses.map((expense) => ({
      id: `expense:${expense.id}`,
      date: expense.createdAt,
      type: 'expense' as const,
      description: expense.description,
      detail: `Despesa · ${expense.category} · ${expense.paymentMethod}`,
      amount: expense.amount,
    })),
    ...periodStoreBillPayments.map((bill) => ({
      id: `store-bill:${bill.id}`,
      date: bill.paidAt ?? bill.dueDate,
      type: 'expense' as const,
      description: bill.description,
      detail: 'Boleto/conta da loja · pagamento confirmado',
      amount: bill.amount,
    })),
    ...periodKitoBillPayments.map((bill) => ({
      id: `kito-bill:${bill.id}`,
      date: bill.paidAt ?? bill.dueDate,
      type: 'expense' as const,
      description: bill.description,
      detail: bill.recurringMonth ? `Mensalidade/cobrança Kito · ${bill.recurringMonth}` : 'Mensalidade/cobrança Kito',
      amount: bill.amount,
    })),
  ].sort((first, second) => second.date.localeCompare(first.date));

  return {
    rows,
    grossRevenue,
    cashExpenseTotal,
    storeBillPaymentsTotal,
    kitoBillPaymentsTotal,
    totalOutflows: cashExpenseTotal + storeBillPaymentsTotal + kitoBillPaymentsTotal,
    balance: grossRevenue - cashExpenseTotal - storeBillPaymentsTotal - kitoBillPaymentsTotal,
  };
}
