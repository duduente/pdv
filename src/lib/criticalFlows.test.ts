import { describe, expect, it } from 'vitest';
import type { CashMovement, CashSale, CashSession, MenuOrder, Product } from '@/types';
import {
  applyDeliveryOrderEdits,
  calculateProfitSummary,
  closeCashSession,
  getPeriodRange,
  isDateInReportPeriod,
  reverseInventorySale,
} from './criticalFlows';

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const session: CashSession = {
  id: 'session-1',
  establishmentId: 'store-1',
  openedAt: '2026-03-10T08:00:00.000Z',
  openingAmount: 100,
};

function sale(overrides: Partial<CashSale> = {}): CashSale {
  return {
    id: 'sale-1',
    establishmentId: 'store-1',
    sessionId: session.id,
    createdAt: '2026-03-10T10:00:00.000Z',
    items: [],
    total: 20,
    origin: 'avulso',
    paymentMethod: 'dinheiro',
    amountReceived: 20,
    change: 0,
    ...overrides,
  };
}

describe('fechamento do caixa', () => {
  it('inclui abertura, vendas em dinheiro, suprimentos e sangrias e ignora vendas canceladas', () => {
    const sales = [
      sale({ total: 12.35 }),
      sale({
        id: 'sale-split',
        total: 30,
        paymentMethod: 'pix',
        paymentSplits: [
          { method: 'dinheiro', amount: 10.1 },
          { method: 'pix', amount: 19.9 },
        ],
      }),
      sale({ id: 'sale-cancelled', total: 90, status: 'cancelled' }),
      sale({ id: 'sale-other-session', sessionId: 'session-2', total: 80 }),
    ];
    const movements: CashMovement[] = [
      { id: 'supply', establishmentId: 'store-1', sessionId: session.id, createdAt: '', type: 'supply', amount: 20, note: '' },
      { id: 'withdrawal', establishmentId: 'store-1', sessionId: session.id, createdAt: '', type: 'withdrawal', amount: 7.45, note: '' },
      { id: 'void-withdrawal', establishmentId: 'store-1', sessionId: session.id, createdAt: '', type: 'withdrawal', amount: 30, note: '', cancelledAt: '2026-03-10T12:00:00.000Z' },
      { id: 'other-session', establishmentId: 'store-1', sessionId: 'session-2', createdAt: '', type: 'supply', amount: 50, note: '' },
    ];

    const closed = closeCashSession(session, sales, movements, 135, '2026-03-10T18:00:00.000Z');

    expect(closed.expectedCash).toBe(135);
    expect(closed.countedCash).toBe(135);
    expect(closed.difference).toBe(0);
    expect(closed.closedAt).toBe('2026-03-10T18:00:00.000Z');
    expect(session.closedAt).toBeUndefined();
  });

  describe('relatório de lucro estimado', () => {
    it('subtrai custos conhecidos e despesas e informa linhas sem custo', () => {
      const sales = [
        sale({
          total: 100,
          items: [
            { productId: 'item-1', name: 'Produto', price: 60, unitCost: 25, quantity: 2 },
            { productId: 'item-2', name: 'Sem custo', price: 40, quantity: 1 },
          ],
        }),
        sale({ id: 'cancelled', total: 500, status: 'cancelled', items: [{ productId: 'x', name: 'X', price: 500, quantity: 1 }] }),
      ];
      const expenses = [
        {
          id: 'expense-1',
          establishmentId: 'store-1',
          createdAt: '2026-03-10T12:00:00.000Z',
          description: 'Energia',
          category: 'Contas',
          amount: 10,
          paymentMethod: 'pix' as const,
          recordedBy: 'Operador',
        },
        {
          id: 'expense-void',
          establishmentId: 'store-1',
          createdAt: '2026-03-10T12:00:00.000Z',
          description: 'Cancelada',
          category: 'Contas',
          amount: 50,
          paymentMethod: 'pix' as const,
          recordedBy: 'Operador',
          cancelledAt: '2026-03-10T12:01:00.000Z',
        },
      ];

      expect(calculateProfitSummary(sales, expenses)).toEqual({
        revenue: 100,
        knownProductCost: 50,
        expenseTotal: 10,
        estimatedProfit: 40,
        marginPercent: 40,
        itemsWithoutCost: 1,
      });
    });
  });

  it('rejeita contagens negativas ou não numéricas', () => {
    expect(() => closeCashSession(session, [], [], -1, '2026-03-10T18:00:00.000Z')).toThrow(RangeError);
    expect(() => closeCashSession(session, [], [], Number.NaN, '2026-03-10T18:00:00.000Z')).toThrow(RangeError);
  });
});

describe('cancelamento e estorno de estoque', () => {
  const products: Product[] = [
    { id: 'product-1', name: 'Café', price: 10, stock: 3, category: 'Mercearia', unit: 'pct' },
    { id: 'product-2', name: 'Arroz', price: 20, stock: 8, category: 'Mercearia', unit: 'kg' },
  ];

  it('devolve quantidades agrupadas e registra movimentação de estorno', () => {
    const inventorySale = sale({
      origin: 'produto_estoque',
      status: 'paid',
      items: [
        { productId: 'product-1', name: 'Café', price: 10, quantity: 2 },
        { productId: 'product-1', name: 'Café', price: 10, quantity: 1 },
        { productId: 'product-2', name: 'Arroz', price: 20, quantity: 3 },
      ],
    });

    const reversed = reverseInventorySale(inventorySale, products, '2026-03-10T11:00:00.000Z', () => 'movement-id');

    expect(reversed?.products.map((product) => product.stock)).toEqual([6, 11]);
    expect(reversed?.movements).toEqual([
      {
        id: 'movement-id',
        productId: 'product-1',
        productName: 'Café',
        unit: 'pct',
        type: 'return',
        quantity: 3,
        createdAt: '2026-03-10T11:00:00.000Z',
      },
      {
        id: 'movement-id',
        productId: 'product-2',
        productName: 'Arroz',
        unit: 'kg',
        type: 'return',
        quantity: 3,
        createdAt: '2026-03-10T11:00:00.000Z',
      },
    ]);
    expect(products.map((product) => product.stock)).toEqual([3, 8]);
  });

  it('não estorna venda cancelada novamente nem venda que não é de estoque', () => {
    expect(reverseInventorySale(sale({ origin: 'produto_estoque', status: 'cancelled' }), products, '', () => 'id')).toBeNull();
    expect(reverseInventorySale(sale({ origin: 'avulso' }), products, '', () => 'id')).toBeNull();
  });
});

describe('edição de pedido delivery pago', () => {
  const order: MenuOrder = {
    id: 'order-1',
    establishmentId: 'store-1',
    createdAt: '2026-03-10T10:00:00.000Z',
    items: [{ productId: 'burger', name: 'Hambúrguer', price: 30, quantity: 1 }],
    total: 30,
    status: 'paid',
    channel: 'delivery',
    orderType: 'delivery',
    customerName: 'Cliente',
    address: 'Rua A, 10',
    phone: '1111',
    document: '123',
    deliveryFee: 5,
    paymentMethod: 'pix',
    paymentSplits: [{ method: 'pix', amount: 35 }],
    deliveryStatus: 'finalized',
    driverId: 'driver-1',
    cashSaleId: 'cash-sale-1',
  };
  const edits = {
    orderType: 'pickup' as const,
    customerName: 'Cliente corrigido',
    address: '',
    postalCode: '',
    phone: '2222',
    document: '456',
    items: [{ productId: 'burger', name: 'Hambúrguer alterado', price: 40, quantity: 2 }],
    total: 80,
    deliveryFee: 0,
    driverId: undefined,
    deliveryStatus: 'production' as const,
  };

  it('permite corrigir dados do cliente, preservando modalidade e histórico financeiro pagos', () => {
    const updated = applyDeliveryOrderEdits(order, edits);

    expect(updated.customerName).toBe('Cliente corrigido');
    expect(updated.phone).toBe('2222');
    expect(updated.document).toBe('456');
    expect(updated.address).toBe('');
    expect(updated.orderType).toBe('delivery');
    expect(updated.items).toEqual(order.items);
    expect(updated.total).toBe(order.total);
    expect(updated.deliveryFee).toBe(order.deliveryFee);
    expect(updated.paymentSplits).toEqual(order.paymentSplits);
    expect(updated.cashSaleId).toBe(order.cashSaleId);
  });

  it('aplica alterações operacionais e financeiras quando o pedido ainda não foi pago', () => {
    const unpaidOrder = { ...order, status: 'pending' as const, cashSaleId: undefined };
    const updated = applyDeliveryOrderEdits(unpaidOrder, edits);

    expect(updated.orderType).toBe('pickup');
    expect(updated.items).toEqual(edits.items);
    expect(updated.total).toBe(80);
    expect(updated.deliveryFee).toBe(0);
    expect(updated.driverId).toBeUndefined();
  });
});

describe('relatórios por período', () => {
  it('filtra o dia selecionado incluindo seu início e excluindo o início do dia seguinte', () => {
    expect(isDateInReportPeriod('2026-03-10T00:00:00.000', 'day', '2026-03-10')).toBe(true);
    expect(isDateInReportPeriod('2026-03-10T23:59:59.999', 'day', '2026-03-10')).toBe(true);
    expect(isDateInReportPeriod('2026-03-11T00:00:00.000', 'day', '2026-03-10')).toBe(false);
  });

  it('usa semanas de segunda a domingo, inclusive somente até o limite seguinte', () => {
    const range = getPeriodRange('week', '2026-03-11');

    expect(dateKey(range.start)).toBe('2026-03-09');
    expect(dateKey(range.end)).toBe('2026-03-16');
    expect(isDateInReportPeriod('2026-03-15T23:59:59.999', 'week', '2026-03-11')).toBe(true);
    expect(isDateInReportPeriod('2026-03-16T00:00:00.000', 'week', '2026-03-11')).toBe(false);
  });

  it('respeita os limites de mês e ano, incluindo anos bissextos', () => {
    expect(dateKey(getPeriodRange('month', '2024-02-20').end)).toBe('2024-03-01');
    expect(isDateInReportPeriod('2024-02-29T12:00:00.000', 'month', '2024-02-01')).toBe(true);
    expect(isDateInReportPeriod('2025-01-01T00:00:00.000', 'year', '2024-06-15')).toBe(false);
    expect(dateKey(getPeriodRange('year', '2024-06-15').end)).toBe('2025-01-01');
  });
});
