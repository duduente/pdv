import type { CashSale } from '@/types';

export interface EmployeeSaleCommission {
  saleId: string;
  saleAmountCents: number;
  commissionPercent: number;
}

export interface EmployeeConsumptionAmount {
  consumptionId: string;
  amountCents: number;
  discountPercent: number;
}

export interface CancelledEmployeeCommission {
  saleId: string;
  commissionCents: number;
}

export interface EmployeeSettlementInput {
  salaryCents: number;
  sales: EmployeeSaleCommission[];
  consumptions: EmployeeConsumptionAmount[];
  cancelledCommissions: CancelledEmployeeCommission[];
  carriedDebtCents: number;
}

export interface EmployeeSettlementTotals {
  salaryCents: number;
  commissionCents: number;
  cancelledCommissionCents: number;
  consumptionCents: number;
  carriedDebtCents: number;
  payableCents: number;
  nextCarriedDebtCents: number;
}

export interface EmployeeSale extends EmployeeSaleCommission {
  employeeId: string;
  month: string;
  cancelledMonth?: string;
}

export interface EmployeeConsumption extends EmployeeConsumptionAmount {
  employeeId: string;
  month: string;
  cancelled?: boolean;
  description?: string;
  createdAt?: string;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  userId?: string;
  salaryCents: number;
  commissionPercent: number;
  consumptionDiscountPercent: number;
  active: boolean;
}

export type EmployeeRosterEntry = Pick<EmployeeProfile, 'id' | 'name' | 'commissionPercent' | 'active'>;

export interface EmployeeRecords {
  employees: EmployeeProfile[];
  consumptions: EmployeeConsumption[];
  settlements: EmployeeMonthlySettlement[];
}

export interface EmployeeMonthlySettlement extends EmployeeSettlementTotals {
  employeeId: string;
  month: string;
  sales: { saleId: string; commissionCents: number }[];
  consumptionIds: string[];
  reversedSaleIds: string[];
}

function assertCents(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} deve ser um valor não negativo em centavos.`);
  }
}

function percentOfCents(value: number, percentage: number) {
  assertCents(value, 'Valor');
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('O percentual deve estar entre 0 e 100.');
  }
  const basisPoints = Math.round(percentage * 100);
  if (Math.abs(percentage * 100 - basisPoints) > 1e-8) {
    throw new Error('O percentual deve ter no máximo duas casas decimais.');
  }
  const result = Number((BigInt(value) * BigInt(basisPoints) + 5_000n) / 10_000n);
  assertCents(result, 'Resultado');
  return result;
}

function sumCents(values: number[], field: string) {
  const total = values.reduce((sum, value) => {
    assertCents(value, field);
    return sum + value;
  }, 0);
  assertCents(total, field);
  return total;
}

function assertUniqueIds(ids: string[], field: string) {
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`${field} devem ter identificadores únicos.`);
  }
}

export function calculateEmployeeSettlement(input: EmployeeSettlementInput): EmployeeSettlementTotals {
  assertCents(input.salaryCents, 'Salário');
  assertCents(input.carriedDebtCents, 'Saldo anterior');
  assertUniqueIds(input.sales.map((sale) => sale.saleId), 'Vendas');
  assertUniqueIds(input.consumptions.map((consumption) => consumption.consumptionId), 'Consumos');
  assertUniqueIds(input.cancelledCommissions.map((commission) => commission.saleId), 'Estornos');
  const saleIds = new Set(input.sales.map((sale) => sale.saleId));
  if (input.cancelledCommissions.some((commission) => saleIds.has(commission.saleId))) {
    throw new Error('Uma venda não pode ser comissionada e estornada no mesmo fechamento.');
  }

  const commissionCents = sumCents(input.sales.map((sale) =>
    percentOfCents(sale.saleAmountCents, sale.commissionPercent)), 'Comissões');
  const cancelledCommissionCents = sumCents(input.cancelledCommissions.map((commission) => commission.commissionCents), 'Comissões estornadas');
  const consumptionCents = sumCents(input.consumptions.map((consumption) => {
    const discount = percentOfCents(consumption.amountCents, consumption.discountPercent);
    return consumption.amountCents - discount;
  }), 'Consumos');
  const credits = sumCents([input.salaryCents, commissionCents], 'Créditos');
  const deductions = sumCents([consumptionCents, cancelledCommissionCents, input.carriedDebtCents], 'Descontos');
  const balance = credits - deductions;

  return {
    salaryCents: input.salaryCents,
    commissionCents,
    cancelledCommissionCents,
    consumptionCents,
    carriedDebtCents: input.carriedDebtCents,
    payableCents: Math.max(balance, 0),
    nextCarriedDebtCents: Math.max(-balance, 0),
  };
}
function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000-')) {
    throw new Error('Informe um mês válido no formato AAAA-MM.');
  }
}

function nextMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
}

export function employeeSaleAttribution(employeeId: string, roster: EmployeeRosterEntry[]): Pick<CashSale, 'employeeId' | 'employeeCommissionPercent'> {
  if (!employeeId) return {};
  const employee = roster.find((entry) => entry.id === employeeId && entry.active);
  if (!employee) throw new Error('Funcionário indisponível. Selecione novamente.');
  percentOfCents(0, employee.commissionPercent);
  return { employeeId: employee.id, employeeCommissionPercent: employee.commissionPercent };
}

function saleMonth(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('Uma venda contém data inválida.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function employeeSalesFromCashRegister(sales: CashSale[], establishmentId: string): EmployeeSale[] {
  if (!establishmentId.trim()) throw new Error('Selecione uma empresa.');
  return sales.flatMap((sale) => {
    if (sale.establishmentId !== establishmentId) throw new Error('Há uma venda de outra empresa no caixa.');
    if (!sale.employeeId && sale.employeeCommissionPercent === undefined) return [];
    if (!sale.employeeId?.trim() || sale.employeeCommissionPercent === undefined) {
      throw new Error('Uma venda contém dados incompletos de comissão.');
    }
    if (!Number.isFinite(sale.total) || sale.total < 0 || !Number.isSafeInteger(Math.round(sale.total * 100))) {
      throw new Error('Uma venda contém um valor inválido.');
    }
    if (sale.status === 'cancelled' && !sale.cancelledAt) {
      throw new Error('Uma venda cancelada não possui data de cancelamento.');
    }
    const saleAmountCents = Math.round(sale.total * 100);
    percentOfCents(saleAmountCents, sale.employeeCommissionPercent);
    return [{
      saleId: sale.id,
      employeeId: sale.employeeId,
      month: saleMonth(sale.createdAt),
      saleAmountCents,
      commissionPercent: sale.employeeCommissionPercent,
      ...(sale.status === 'cancelled' && sale.cancelledAt ? { cancelledMonth: saleMonth(sale.cancelledAt) } : {}),
    }];
  });
}

export function calculateEmployeeMonthlySettlement(input: {
  employeeId: string;
  month: string;
  salaryCents: number;
  sales: EmployeeSale[];
  consumptions: EmployeeConsumption[];
  previousSettlements: EmployeeMonthlySettlement[];
}): EmployeeMonthlySettlement {
  if (!input.employeeId.trim()) throw new Error('Selecione um funcionário.');
  assertMonth(input.month);
  assertUniqueIds(input.sales.map((sale) => sale.saleId), 'Vendas');
  assertUniqueIds(input.consumptions.map((consumption) => consumption.consumptionId), 'Consumos');

  const previous = [...input.previousSettlements].sort((a, b) => a.month.localeCompare(b.month));
  for (let index = 0; index < previous.length; index += 1) {
    const settlement = previous[index];
    assertMonth(settlement.month);
    if (settlement.employeeId !== input.employeeId || settlement.month >= input.month
      || (index > 0 && nextMonth(previous[index - 1].month) !== settlement.month)) {
      throw new Error('Histórico de fechamentos inválido ou fora de ordem.');
    }
    assertCents(settlement.nextCarriedDebtCents, 'Saldo anterior');
  }
  const last = previous.at(-1);
  if (last && nextMonth(last.month) !== input.month) {
    throw new Error('Feche os meses anteriores antes de continuar.');
  }

  const previousSales = previous.flatMap((settlement) => settlement.sales);
  const previousReversals = previous.flatMap((settlement) => settlement.reversedSaleIds);
  assertUniqueIds(previousSales.map((sale) => sale.saleId), 'Vendas já fechadas');
  assertUniqueIds(previousReversals, 'Estornos anteriores');
  const previousSalesById = new Map(previousSales.map((sale) => [sale.saleId, sale]));
  if (previousReversals.some((saleId) => !previousSalesById.has(saleId))) {
    throw new Error('O histórico contém estorno sem venda comissionada.');
  }
  const salesById = new Map(input.sales.map((sale) => [sale.saleId, sale]));
  for (const sale of input.sales) {
    assertMonth(sale.month);
    if (sale.cancelledMonth) {
      assertMonth(sale.cancelledMonth);
      if (sale.cancelledMonth < sale.month) throw new Error('O cancelamento não pode ser anterior à venda.');
    }
  }
  for (const sale of previousSales) {
    const source = salesById.get(sale.saleId);
    if (!source || source.employeeId !== input.employeeId) {
      throw new Error('Não foi possível localizar uma venda de um fechamento anterior.');
    }
    assertCents(sale.commissionCents, 'Comissão anterior');
  }
  for (const consumption of input.consumptions) assertMonth(consumption.month);

  const sales = input.sales.filter((sale) => sale.employeeId === input.employeeId
    && sale.month === input.month && (!sale.cancelledMonth || sale.cancelledMonth > input.month)
    && !previousSalesById.has(sale.saleId));
  const consumptions = input.consumptions.filter((consumption) => consumption.employeeId === input.employeeId
    && consumption.month === input.month && !consumption.cancelled);
  const previousConsumptionIds = previous.flatMap((settlement) => settlement.consumptionIds);
  assertUniqueIds(previousConsumptionIds, 'Consumos já fechados');
  if (consumptions.some((consumption) => previousConsumptionIds.includes(consumption.consumptionId))) {
    throw new Error('Um consumo já consta em um fechamento anterior.');
  }
  const reversed = new Set(previousReversals);
  const cancelledCommissions = previousSales.flatMap((sale) => {
    const source = salesById.get(sale.saleId);
    return source?.cancelledMonth && source.cancelledMonth <= input.month && !reversed.has(sale.saleId)
      ? [{ saleId: sale.saleId, commissionCents: sale.commissionCents }]
      : [];
  });
  const totals = calculateEmployeeSettlement({
    salaryCents: input.salaryCents,
    sales,
    consumptions,
    cancelledCommissions,
    carriedDebtCents: last?.nextCarriedDebtCents ?? 0,
  });
  return {
    ...totals,
    employeeId: input.employeeId,
    month: input.month,
    sales: sales.map((sale) => ({
      saleId: sale.saleId,
      commissionCents: percentOfCents(sale.saleAmountCents, sale.commissionPercent),
    })),
    consumptionIds: consumptions.map((consumption) => consumption.consumptionId),
    reversedSaleIds: cancelledCommissions.map((commission) => commission.saleId),
  };
}
