export interface FinanceBill {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  boletoCode: string;
  validUntil: string;
  recurringMonth?: string;
  paidAt?: string;
}

export interface StoreFinances {
  recurring: {
    enabled: boolean;
    dueDay: number;
    amount: number;
  };
  bills: FinanceBill[];
}

export const EMPTY_STORE_FINANCES: StoreFinances = {
  recurring: { enabled: false, dueDay: 10, amount: 0 },
  bills: [],
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMonthDueDate(year: number, month: number, dueDay: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return dateKey(new Date(year, month, Math.min(Math.max(dueDay, 1), lastDay)));
}

export function ensureCurrentRecurringBill(
  finances: StoreFinances,
  referenceDate: Date,
  createId: () => string,
): StoreFinances {
  if (!finances.recurring.enabled) return finances;
  const month = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  if (finances.bills.some((bill) => bill.recurringMonth === month)) return finances;

  return {
    ...finances,
    bills: [...finances.bills, {
      id: createId(),
      description: 'Mensalidade recorrente',
      amount: finances.recurring.amount,
      dueDate: getMonthDueDate(referenceDate.getFullYear(), referenceDate.getMonth(), finances.recurring.dueDay),
      boletoCode: '',
      validUntil: '',
      recurringMonth: month,
    }],
  };
}

export type BillAlert = 'paid' | 'overdue' | 'due-soon' | 'upcoming' | 'expired' | 'none';

export function getBillAlert(bill: FinanceBill, referenceDate: Date): BillAlert {
  if (bill.paidAt) return 'paid';
  const today = dateKey(referenceDate);
  if (bill.validUntil && bill.validUntil < today) return 'expired';
  const [year, month, day] = bill.dueDate.split('-').map(Number);
  const parsedDueDate = new Date(Date.UTC(year, month - 1, day));
  if (!year || month < 1 || month > 12 || day < 1
    || parsedDueDate.getUTCFullYear() !== year
    || parsedDueDate.getUTCMonth() !== month - 1
    || parsedDueDate.getUTCDate() !== day) return 'none';
  const todayParts = today.split('-').map(Number);
  const dueTimestamp = Date.UTC(year, month - 1, day);
  const todayTimestamp = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const daysUntilDue = Math.round((dueTimestamp - todayTimestamp) / 86_400_000);
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 7) return 'due-soon';
  return 'upcoming';
}
