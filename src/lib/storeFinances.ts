export interface FinanceBill {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  boletoCode: string;
  paymentType?: 'boleto' | 'pix';
  validUntil: string;
  isRecurring?: boolean;
  recurrenceId?: string;
  recurrenceDay?: number;
  recurringMonth?: string;
  pixCode?: string;
  paidAt?: string;
}

export interface StoreFinances {
  recurring: {
    enabled: boolean;
    dueDay: number;
    amount: number;
    description?: string;
    paymentType?: 'boleto' | 'pix';
    paymentCode?: string;
    boletoCode?: string;
    pixCode?: string;
  };
  bills: FinanceBill[];
}

export const EMPTY_STORE_FINANCES: StoreFinances = {
  recurring: { enabled: false, dueDay: 10, amount: 0 },
  bills: [],
};

export type BillPaymentOption = { type: 'boleto' | 'pix'; code: string };

export function getBillPaymentOptions(bill: FinanceBill): BillPaymentOption[] {
  const options: BillPaymentOption[] = [];
  if (bill.boletoCode && (bill.paymentType !== 'pix' || bill.pixCode)) {
    options.push({ type: 'boleto', code: bill.boletoCode });
  }
  if (bill.pixCode) options.push({ type: 'pix', code: bill.pixCode });
  if (bill.paymentType === 'pix' && bill.boletoCode && !bill.pixCode) {
    options.push({ type: 'pix', code: bill.boletoCode });
  }
  return options;
}

function getRecurringPaymentCodes(recurring: StoreFinances['recurring']) {
  return {
    boletoCode: recurring.boletoCode ?? (recurring.paymentType === 'boleto' ? recurring.paymentCode : '') ?? '',
    pixCode: recurring.pixCode ?? (recurring.paymentType === 'pix' ? recurring.paymentCode : '') ?? '',
  };
}

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
  const paymentCodes = getRecurringPaymentCodes(finances.recurring);
  const existingBill = finances.bills.find((bill) => bill.recurringMonth === month);
  if (existingBill) {
    const updatedBill: FinanceBill = {
      ...existingBill,
      description: finances.recurring.description?.trim() || 'Mensalidade recorrente',
      amount: finances.recurring.amount,
      dueDate: getMonthDueDate(referenceDate.getFullYear(), referenceDate.getMonth(), finances.recurring.dueDay),
      ...paymentCodes,
      paymentType: paymentCodes.pixCode && !paymentCodes.boletoCode ? 'pix' : 'boleto',
    };
    if (JSON.stringify(existingBill) === JSON.stringify(updatedBill)) return finances;
    return {
      ...finances,
      bills: finances.bills.map((bill) => bill.id === existingBill.id ? updatedBill : bill),
    };
  }

  return {
    ...finances,
    bills: [...finances.bills, {
      id: createId(),
      description: finances.recurring.description?.trim() || 'Mensalidade recorrente',
      amount: finances.recurring.amount,
      dueDate: getMonthDueDate(referenceDate.getFullYear(), referenceDate.getMonth(), finances.recurring.dueDay),
      ...paymentCodes,
      paymentType: paymentCodes.pixCode && !paymentCodes.boletoCode ? 'pix' : 'boleto',
      validUntil: '',
      recurringMonth: month,
    }],
  };
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDayOfMonth(dateKey: string) {
  return Number(dateKey.slice(-2));
}

export function ensureCurrentStoreRecurringBills(
  finances: StoreFinances,
  referenceDate: Date,
  createId: () => string,
): StoreFinances {
  const month = getMonthKey(referenceDate);
  let updated = finances;

  if (finances.recurring.enabled) {
    const legacyBill = [...finances.bills]
      .filter((bill) => bill.recurringMonth)
      .sort((first, second) => (second.recurringMonth ?? '').localeCompare(first.recurringMonth ?? ''))[0];
    if (legacyBill) {
      updated = {
        ...finances,
        recurring: { ...finances.recurring, enabled: false },
        bills: finances.bills.map((bill) => bill.id === legacyBill.id
          ? {
              ...bill,
              isRecurring: true,
              recurrenceId: bill.recurrenceId ?? bill.id,
              recurrenceDay: bill.recurrenceDay ?? getDayOfMonth(bill.dueDate),
            }
          : bill),
      };
    } else {
      const billId = createId();
      const paymentCodes = getRecurringPaymentCodes(finances.recurring);
      const bill: FinanceBill = {
        id: billId,
        description: finances.recurring.description?.trim() || 'Mensalidade recorrente',
        amount: finances.recurring.amount,
        dueDate: getMonthDueDate(referenceDate.getFullYear(), referenceDate.getMonth(), finances.recurring.dueDay),
        ...paymentCodes,
        paymentType: paymentCodes.pixCode && !paymentCodes.boletoCode ? 'pix' : 'boleto',
        validUntil: '',
        isRecurring: true,
        recurrenceId: billId,
        recurrenceDay: finances.recurring.dueDay,
        recurringMonth: month,
      };
      updated = {
        ...finances,
        recurring: { ...finances.recurring, enabled: false },
        bills: [...finances.bills, bill],
      };
    }
  }

  const series = new Map<string, FinanceBill>();
  for (const bill of updated.bills.filter((entry) => entry.recurrenceId || entry.isRecurring)) {
    const recurrenceId = bill.recurrenceId ?? bill.id;
    const latest = series.get(recurrenceId);
    if (!latest || (bill.recurringMonth ?? '').localeCompare(latest.recurringMonth ?? '') > 0) {
      series.set(recurrenceId, bill);
    }
  }

  const missingBills = [...series.entries()].flatMap(([recurrenceId, latest]) => {
    if (!latest.isRecurring || (latest.recurringMonth ?? '') >= month) return [];
    if (updated.bills.some((bill) => bill.recurrenceId === recurrenceId && bill.recurringMonth === month)) return [];
    const recurrenceDay = latest.recurrenceDay ?? getDayOfMonth(latest.dueDate);
    return [{
      id: createId(),
      description: latest.description,
      amount: latest.amount,
      dueDate: getMonthDueDate(referenceDate.getFullYear(), referenceDate.getMonth(), recurrenceDay),
      boletoCode: '',
      paymentType: latest.paymentType,
      pixCode: '',
      validUntil: '',
      isRecurring: true,
      recurrenceId,
      recurrenceDay,
      recurringMonth: month,
    }];
  });

  return missingBills.length
    ? { ...updated, bills: [...updated.bills, ...missingBills] }
    : updated;
}

export type BillAlert = 'paid' | 'overdue' | 'due-soon' | 'upcoming' | 'expired' | 'none';
export type CustomerBillStatus = 'paid' | 'overdue' | 'expired' | 'pending';

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

export function getCustomerBillStatus(bill: FinanceBill, referenceDate: Date): CustomerBillStatus {
  const alert = getBillAlert(bill, referenceDate);
  if (alert === 'paid' || alert === 'overdue' || alert === 'expired') return alert;
  return 'pending';
}
