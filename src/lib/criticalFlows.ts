import type {
  CashExpense, CashMovement, CashSale, CashSession, DeliveryStatus, InventoryMovement, MenuOrder, Product,
} from '@/types';

export type ReportPeriod = 'day' | 'week' | 'month' | 'year';

export function getPeriodRange(period: ReportPeriod, referenceDate: string) {
  const date = new Date(`${referenceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new RangeError('Data de referência inválida');

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  if (period === 'year') start.setMonth(0, 1);

  const end = new Date(start);
  if (period === 'day') end.setDate(end.getDate() + 1);
  if (period === 'week') end.setDate(end.getDate() + 7);
  if (period === 'month') end.setMonth(end.getMonth() + 1);
  if (period === 'year') end.setFullYear(end.getFullYear() + 1);
  return { start, end };
}

export function isDateInReportPeriod(date: string, period: ReportPeriod, referenceDate: string) {
  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) return false;
  const { start, end } = getPeriodRange(period, referenceDate);
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function paymentAmount(sale: CashSale, method: 'dinheiro') {
  return sale.paymentSplits?.length
    ? sale.paymentSplits.filter((split) => split.method === method).reduce((sum, split) => sum + split.amount, 0)
    : sale.paymentMethod === method ? sale.total : 0;
}

export function calculateExpectedCash(session: CashSession, sales: CashSale[], movements: CashMovement[]) {
  const cashSales = sales
    .filter((sale) => sale.status !== 'cancelled' && sale.sessionId === session.id)
    .reduce((sum, sale) => sum + paymentAmount(sale, 'dinheiro'), 0);
  const sessionMovements = movements.filter((movement) => movement.sessionId === session.id && !movement.cancelledAt);
  const supplies = sessionMovements
    .filter((movement) => movement.type === 'supply')
    .reduce((sum, movement) => sum + movement.amount, 0);
  const withdrawals = sessionMovements
    .filter((movement) => movement.type === 'withdrawal')
    .reduce((sum, movement) => sum + movement.amount, 0);
  return Math.round((session.openingAmount + cashSales + supplies - withdrawals) * 100) / 100;
}

export function calculateProfitSummary(sales: CashSale[], expenses: CashExpense[]) {
  const completedSales = sales.filter((sale) => sale.status !== 'cancelled');
  const revenue = completedSales.reduce((sum, sale) => sum + sale.total, 0);
  const knownProductCost = completedSales.reduce((sum, sale) => sum + sale.items.reduce(
    (itemTotal, item) => itemTotal + (item.unitCost ?? 0) * item.quantity,
    0,
  ), 0);
  const itemsWithoutCost = completedSales.reduce((count, sale) => (
    count + sale.items.filter((item) => item.unitCost === undefined).length
  ), 0);
  const activeExpenses = expenses.filter((expense) => !expense.cancelledAt);
  const expenseTotal = activeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedProfit = revenue - knownProductCost - expenseTotal;

  return {
    revenue: Math.round(revenue * 100) / 100,
    knownProductCost: Math.round(knownProductCost * 100) / 100,
    expenseTotal: Math.round(expenseTotal * 100) / 100,
    estimatedProfit: Math.round(estimatedProfit * 100) / 100,
    marginPercent: revenue > 0 ? Math.round((estimatedProfit / revenue) * 10000) / 100 : 0,
    itemsWithoutCost,
  };
}

export function closeCashSession(
  session: CashSession,
  sales: CashSale[],
  movements: CashMovement[],
  countedCash: number,
  closedAt: string,
): CashSession {
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new RangeError('Valor contado inválido');
  const expectedCash = calculateExpectedCash(session, sales, movements);
  const counted = Math.round(countedCash * 100) / 100;
  return {
    ...session,
    closedAt,
    expectedCash,
    countedCash: counted,
    difference: Math.round((counted - expectedCash) * 100) / 100,
  };
}

export function reverseInventorySale(
  sale: CashSale,
  products: Product[],
  createdAt: string,
  createId: () => string,
): { products: Product[]; movements: InventoryMovement[] } | null {
  if (sale.origin !== 'produto_estoque' || sale.status === 'cancelled') return null;

  const quantities = new Map<string, number>();
  for (const item of sale.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const returnedProducts = [...quantities.entries()].flatMap(([productId, quantity]) => {
    const product = productById.get(productId);
    return product ? [{ product, quantity }] : [];
  });
  const returned = new Map(returnedProducts.map(({ product, quantity }) => [product.id, quantity]));

  return {
    products: products.map((product) => {
      const quantity = returned.get(product.id);
      return quantity ? { ...product, stock: product.stock + quantity } : product;
    }),
    movements: returnedProducts.map(({ product, quantity }) => ({
      id: createId(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      type: 'return',
      quantity,
      createdAt,
    })),
  };
}

export interface DeliveryOrderEdits {
  orderType: 'delivery' | 'pickup';
  customerName: string;
  address: string;
  postalCode: string;
  phone: string;
  document: string;
  items: MenuOrder['items'];
  total: number;
  deliveryFee: number;
  driverId?: string;
  deliveryStatus?: DeliveryStatus;
}

export function applyDeliveryOrderEdits(order: MenuOrder, edits: DeliveryOrderEdits): MenuOrder {
  const isPaid = order.status === 'paid' || Boolean(order.cashSaleId);
  const updatedOrder: MenuOrder = {
    ...order,
    customerName: edits.customerName,
    address: edits.address,
    postalCode: edits.postalCode,
    phone: edits.phone,
    document: edits.document,
  };
  if (isPaid) return updatedOrder;

  return {
    ...updatedOrder,
    orderType: edits.orderType,
    items: edits.items,
    total: edits.total,
    deliveryFee: edits.deliveryFee,
    driverId: edits.orderType === 'delivery' ? edits.driverId : undefined,
    deliveryStatus: edits.deliveryStatus ?? order.deliveryStatus,
  };
}
