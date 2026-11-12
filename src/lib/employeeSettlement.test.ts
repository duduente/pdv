import { describe, expect, it } from 'vitest';
import type { CashSale } from '@/types';
import { calculateEmployeeMonthlySettlement, calculateEmployeeSettlement, employeeSaleAttribution, employeeSalesFromCashRegister } from './employeeSettlement';

describe('employee settlement', () => {
  it('calculates salary, sales commission and discounted consumption in cents', () => {
    expect(calculateEmployeeSettlement({
      salaryCents: 200_000,
      sales: [{ saleId: 'sale-1', saleAmountCents: 10_000, commissionPercent: 10 }],
      consumptions: [{ consumptionId: 'consumption-1', amountCents: 10_000, discountPercent: 20 }],
      cancelledCommissions: [],
      carriedDebtCents: 0,
    })).toMatchObject({ commissionCents: 1_000, consumptionCents: 8_000, payableCents: 193_000, nextCarriedDebtCents: 0 });
  });

  describe('employee monthly settlement', () => {
    it('settles only the selected employee and month, carrying debt to the following month', () => {
      const sales = [
        { saleId: 's1', employeeId: 'employee', month: '2026-11', saleAmountCents: 10_000, commissionPercent: 10 },
        { saleId: 's2', employeeId: 'other', month: '2026-11', saleAmountCents: 50_000, commissionPercent: 50 },
        { saleId: 's3', employeeId: 'employee', month: '2026-11', cancelledMonth: '2026-11', saleAmountCents: 10_000, commissionPercent: 20 },
      ];
      const consumptions = [
        { consumptionId: 'c1', employeeId: 'employee', month: '2026-11', amountCents: 5_000, discountPercent: 20 },
        { consumptionId: 'c2', employeeId: 'other', month: '2026-11', amountCents: 9_000, discountPercent: 0 },
        { consumptionId: 'c3', employeeId: 'employee', month: '2026-11', cancelled: true, amountCents: 9_000, discountPercent: 0 },
      ];
      const november = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-11', salaryCents: 2_000, sales, consumptions, previousSettlements: [],
      });

      expect(november.sales).toEqual([{ saleId: 's1', commissionCents: 1_000 }]);
      expect(november.consumptionIds).toEqual(['c1']);
      expect(november.payableCents).toBe(0);
      expect(november.nextCarriedDebtCents).toBe(1_000);
      const december = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-12', salaryCents: 2_000, sales, consumptions, previousSettlements: [november],
      });
      expect(december.payableCents).toBe(1_000);
    });

    it('reverses a cancelled prior sale once, using the original commission', () => {
      const sale = { saleId: 'sale', employeeId: 'employee', month: '2026-11', saleAmountCents: 10_000, commissionPercent: 10 };
      const november = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-11', salaryCents: 0, sales: [sale], consumptions: [], previousSettlements: [],
      });
      const cancelledSale = { ...sale, commissionPercent: 99, cancelledMonth: '2026-12' };
      const december = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-12', salaryCents: 0,
        sales: [cancelledSale], consumptions: [], previousSettlements: [november],
      });
      expect(december.cancelledCommissionCents).toBe(1_000);
      expect(december.reversedSaleIds).toEqual(['sale']);
      expect(december.nextCarriedDebtCents).toBe(1_000);
      const january = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2027-01', salaryCents: 2_000,
        sales: [cancelledSale], consumptions: [], previousSettlements: [november, december],
      });
      expect(january.reversedSaleIds).toEqual([]);
      expect(january.payableCents).toBe(1_000);
    });

    it('rejects repeated or skipped months and missing previously settled sales', () => {
      const sale = { saleId: 'sale', employeeId: 'employee', month: '2026-11', saleAmountCents: 10_000, commissionPercent: 10 };
      const november = calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-11', salaryCents: 0, sales: [sale], consumptions: [], previousSettlements: [],
      });
      expect(() => calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-11', salaryCents: 0, sales: [sale], consumptions: [], previousSettlements: [november],
      })).toThrow();
      expect(() => calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2027-01', salaryCents: 0, sales: [sale], consumptions: [], previousSettlements: [november],
      })).toThrow();
      expect(() => calculateEmployeeMonthlySettlement({
        employeeId: 'employee', month: '2026-12', salaryCents: 0, sales: [], consumptions: [], previousSettlements: [november],
      })).toThrow();
    });
  });

  it('carries excess deductions and cancelled commissions to the next period', () => {
    const result = calculateEmployeeSettlement({
      salaryCents: 5_000,
      sales: [],
      consumptions: [{ consumptionId: 'consumption-1', amountCents: 7_000, discountPercent: 0 }],
      cancelledCommissions: [{ saleId: 'earlier-sale', commissionCents: 1_000 }],
      carriedDebtCents: 500,
    });
    expect(result.payableCents).toBe(0);
    expect(result.nextCarriedDebtCents).toBe(3_500);
    expect(calculateEmployeeSettlement({
      salaryCents: 10_000,
      sales: [],
      consumptions: [],
      cancelledCommissions: [],
      carriedDebtCents: result.nextCarriedDebtCents,
    }).payableCents).toBe(6_500);
  });

  it('accepts percentage boundaries and rounds each transaction to cents', () => {
    const result = calculateEmployeeSettlement({
      salaryCents: 0,
      sales: [
        { saleId: 'a', saleAmountCents: 101, commissionPercent: 50 },
        { saleId: 'b', saleAmountCents: 100, commissionPercent: 100 },
        { saleId: 'd', saleAmountCents: 50_000, commissionPercent: 0.29 },
      ],
      consumptions: [{ consumptionId: 'c', amountCents: 500, discountPercent: 100 }],
      cancelledCommissions: [],
      carriedDebtCents: 0,
    });
    expect(result.commissionCents).toBe(296);
    expect(result.consumptionCents).toBe(0);
    expect(result.payableCents).toBe(296);
  });

  it('rejects invalid percentages and duplicate transactions', () => {
    const input = {
      salaryCents: 0, sales: [], consumptions: [], cancelledCommissions: [], carriedDebtCents: 0,
    };
    expect(() => calculateEmployeeSettlement({
      ...input, sales: [{ saleId: 'a', saleAmountCents: 100, commissionPercent: 101 }],
    })).toThrow();
    expect(() => calculateEmployeeSettlement({
      ...input,
      sales: [
        { saleId: 'a', saleAmountCents: 100, commissionPercent: 10 },
        { saleId: 'a', saleAmountCents: 100, commissionPercent: 10 },
      ],
    })).toThrow();
    expect(() => calculateEmployeeSettlement({
      ...input,
      sales: [{ saleId: 'a', saleAmountCents: 100, commissionPercent: 10 }],
      cancelledCommissions: [{ saleId: 'a', commissionCents: 10 }],
    })).toThrow();
  });

  it('applies each discount separately before summing consumptions', () => {
    const result = calculateEmployeeSettlement({
      salaryCents: 1_000,
      sales: [],
      consumptions: [
        { consumptionId: 'a', amountCents: 101, discountPercent: 50 },
        { consumptionId: 'b', amountCents: 101, discountPercent: 50 },
      ],
      cancelledCommissions: [],
      carriedDebtCents: 0,
    });
    expect(result.consumptionCents).toBe(100);
    expect(result.payableCents).toBe(900);
  });

  it.each([-1, 100.01, NaN, Infinity, 10.001])('rejects an invalid percentage: %s', (percent) => {
    expect(() => calculateEmployeeSettlement({
      salaryCents: 0,
      sales: [{ saleId: 'sale', saleAmountCents: 100, commissionPercent: percent }],
      consumptions: [],
      cancelledCommissions: [],
      carriedDebtCents: 0,
    })).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid monetary values: %s', (amount) => {
    expect(() => calculateEmployeeSettlement({
      salaryCents: amount,
      sales: [],
      consumptions: [],
      cancelledCommissions: [],
      carriedDebtCents: 0,
    })).toThrow();
  });

  it('rejects overflow and duplicate or blank consumption and reversal IDs', () => {
    const input = {
      salaryCents: 0, sales: [], consumptions: [], cancelledCommissions: [], carriedDebtCents: 0,
    };
    expect(() => calculateEmployeeSettlement({
      ...input,
      salaryCents: Number.MAX_SAFE_INTEGER,
      sales: [{ saleId: 'sale', saleAmountCents: 1, commissionPercent: 100 }],
    })).toThrow();
    expect(() => calculateEmployeeSettlement({
      ...input,
      consumptions: [
        { consumptionId: 'a', amountCents: 100, discountPercent: 0 },
        { consumptionId: 'a', amountCents: 100, discountPercent: 0 },
      ],
    })).toThrow();
    expect(() => calculateEmployeeSettlement({
      ...input,
      cancelledCommissions: [
        { saleId: 'sale', commissionCents: 100 },
        { saleId: 'sale', commissionCents: 100 },
      ],
    })).toThrow();
    expect(() => calculateEmployeeSettlement({
      ...input,
      consumptions: [{ consumptionId: ' ', amountCents: 100, discountPercent: 0 }],
    })).toThrow();
  });
});

describe('cash register commission data', () => {
  const sale: CashSale = {
    id: 'sale', establishmentId: 'store', sessionId: 'session', createdAt: '2026-11-15T12:00:00',
    items: [], total: 99.95, origin: 'avulso', paymentMethod: 'pix', amountReceived: 99.95, change: 0,
    employeeId: 'employee', employeeCommissionPercent: 12.5,
  };

  it('converts an attributed sale using its stored commission rate and cancellation month', () => {
    expect(employeeSalesFromCashRegister([{
      ...sale, status: 'cancelled', cancelledAt: '2026-12-15T12:00:00',
    }], 'store')).toEqual([{
      saleId: 'sale', employeeId: 'employee', month: '2026-11', saleAmountCents: 9_995,
      commissionPercent: 12.5, cancelledMonth: '2026-12',
    }]);
  });

  it('captures an active employee commission without requiring one for every sale', () => {
    const roster = [{ id: 'employee', name: 'Teste', commissionPercent: 12.5, active: true }];
    expect(employeeSaleAttribution('', roster)).toEqual({});
    expect(employeeSaleAttribution('employee', roster)).toEqual({ employeeId: 'employee', employeeCommissionPercent: 12.5 });
    expect(() => employeeSaleAttribution('employee', [{ ...roster[0], active: false }])).toThrow();
    expect(() => employeeSaleAttribution('employee', [{ ...roster[0], commissionPercent: 101 }])).toThrow();
  });

  it('ignores legacy sales without an attributed employee', () => {
    expect(employeeSalesFromCashRegister([{
      ...sale, employeeId: undefined, employeeCommissionPercent: undefined,
    }], 'store')).toEqual([]);
  });

  it('rejects another store, incomplete data, and cancelled sales without a date', () => {
    expect(() => employeeSalesFromCashRegister([sale], 'other')).toThrow();
    expect(() => employeeSalesFromCashRegister([{ ...sale, employeeCommissionPercent: undefined }], 'store')).toThrow();
    expect(() => employeeSalesFromCashRegister([{ ...sale, status: 'cancelled' }], 'store')).toThrow();
  });
});
