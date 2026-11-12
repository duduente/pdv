import ExcelJS from 'exceljs';
import type { AuditEvent, CashExpense, CashMovement, CashSale } from '@/types';
import { calculateEmployeeSettlement, type EmployeeConsumption, type EmployeeProfile } from '@/lib/employeeSettlement';

export interface FinancialReportExportData {
  establishmentName: string;
  periodLabel: string;
  periodDescription: string;
  sales: CashSale[];
  expenses: CashExpense[];
  movements: CashMovement[];
  auditEvents: AuditEvent[];
  deliveryRows: { name: string; deliveries: number; total: number }[];
  profit: {
    revenue: number;
    knownProductCost: number;
    expenseTotal: number;
    estimatedProfit: number;
    marginPercent: number;
    itemsWithoutCost: number;
  };
}

function downloadBlob(blob: Blob, establishmentName: string, periodDescription: string, extension: string, prefix = 'relatorio') {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = establishmentName.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'estabelecimento';
  anchor.href = url;
  anchor.download = `${prefix}-${safeName}-${periodDescription.replace(/[^0-9a-z-]+/gi, '-')}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function createFinancialReportBackup(data: FinancialReportExportData) {
  return JSON.stringify({
    format: 'pdv-financial-report',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  }, null, 2);
}

export function downloadFinancialReportBackup(data: FinancialReportExportData) {
  const backup = createFinancialReportBackup(data);
  downloadBlob(new Blob([backup], { type: 'application/json;charset=utf-8' }), data.establishmentName, data.periodDescription, 'json');
}

function formatPayment(sale: CashSale) {
  return sale.paymentSplits?.length
    ? sale.paymentSplits.map((split) => `${split.method}: ${split.amount.toFixed(2)}`).join(' + ')
    : sale.paymentMethod;
}

function formatRows(sheet: ExcelJS.Worksheet, headers: string[], rows: (string | number | null)[][]) {
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}${rows.length + 1}` };
  sheet.columns.forEach((column, index) => {
    column.width = Math.min(42, Math.max(14, ...sheet.getColumn(index + 1).values.map((value) => String(value ?? '').length + 2)));
  });
}

export async function createFinancialReportWorkbook(data: FinancialReportExportData): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDV';
  workbook.created = new Date();
  workbook.subject = `${data.periodLabel} · ${data.periodDescription}`;
  workbook.title = `Relatório financeiro - ${data.establishmentName}`;

  const summary = workbook.addWorksheet('Resumo');
  formatRows(summary, ['Indicador', 'Valor'], [
    ['Estabelecimento', data.establishmentName],
    ['Período', data.periodLabel],
    ['Referência', data.periodDescription],
    ['Faturamento', data.profit.revenue],
    ['Custo conhecido dos produtos', data.profit.knownProductCost],
    ['Despesas', data.profit.expenseTotal],
    ['Lucro estimado', data.profit.estimatedProfit],
    ['Margem estimada (%)', data.profit.marginPercent],
    ['Linhas de venda sem custo', data.profit.itemsWithoutCost],
    ['Observação', 'Estimativa parcial quando faltam custos; não inclui impostos, tarifas ou folha.'],
  ]);
  [5, 6, 7, 8].forEach((row) => { summary.getCell(`B${row}`).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; });
  summary.getCell('B9').numFmt = '0.00"%"';

  const sales = workbook.addWorksheet('Vendas');
  formatRows(sales, ['Data', 'ID', 'Origem', 'Itens', 'Quantidade de itens', 'Faturamento', 'Custo conhecido', 'Lucro bruto estimado', 'Itens sem custo cadastrado', 'Pagamento', 'Status', 'Motivo do estorno'], data.sales.map((sale) => {
    const itemCost = sale.items.reduce((total, item) => total + (item.unitCost ?? 0) * item.quantity, 0);
    const itemsWithoutCost = sale.items
      .filter((item) => item.unitCost === undefined)
      .map((item) => `${item.quantity}x ${item.name}`)
      .join('; ');
    return [
      new Date(sale.createdAt).toLocaleString('pt-BR'),
      sale.id,
      sale.origin,
      sale.items.map((item) => `${item.quantity}x ${item.name}`).join('; '),
      sale.items.reduce((total, item) => total + item.quantity, 0),
      sale.total,
      itemCost,
      sale.total - itemCost,
      itemsWithoutCost,
      formatPayment(sale) ?? '',
      sale.status === 'cancelled' ? 'Cancelada' : 'Concluída',
      sale.cancellationReason ?? '',
    ];
  }));
  [6, 7, 8].forEach((column) => { sales.getColumn(column).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; });

  const expenses = workbook.addWorksheet('Despesas');
  formatRows(expenses, ['Data', 'Descrição', 'Categoria', 'Valor', 'Pagamento', 'Registrado por', 'Status', 'Motivo do cancelamento'], data.expenses.map((expense) => [
    new Date(expense.createdAt).toLocaleString('pt-BR'),
    expense.description,
    expense.category,
    expense.amount,
    expense.paymentMethod,
    expense.recordedBy,
    expense.cancelledAt ? 'Cancelada' : 'Ativa',
    expense.cancellationReason ?? '',
  ]));
  expenses.getColumn(4).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

  const movements = workbook.addWorksheet('Movimentações');
  formatRows(movements, ['Data', 'Tipo', 'Motivo', 'Valor', 'Status', 'Motivo do cancelamento'], data.movements.map((movement) => [
    new Date(movement.createdAt).toLocaleString('pt-BR'),
    movement.type === 'supply' ? 'Suprimento' : 'Sangria',
    movement.note,
    movement.amount,
    movement.cancelledAt ? 'Cancelada' : 'Ativa',
    movement.cancellationReason ?? '',
  ]));
  movements.getColumn(4).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

  const deliveries = workbook.addWorksheet('Entregadores');
  formatRows(deliveries, ['Entregador', 'Entregas', 'Faturamento'], data.deliveryRows.map((row) => [row.name, row.deliveries, row.total]));
  deliveries.getColumn(3).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

  const history = workbook.addWorksheet('Histórico');
  formatRows(history, ['Data', 'Tipo', 'ID', 'Ação', 'Responsável', 'Detalhes'], data.auditEvents.map((event) => [
    new Date(event.occurredAt).toLocaleString('pt-BR'),
    event.entityType,
    event.entityId,
    event.action,
    event.actorName,
    event.summary,
  ]));

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function downloadFinancialReport(data: FinancialReportExportData) {
  const workbook = await createFinancialReportWorkbook(data);
  const blob = new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, data.establishmentName, data.periodDescription, 'xlsx');
}

export async function createEmployeeConsumptionWorkbook(data: {
  establishmentName: string;
  employees: EmployeeProfile[];
  consumptions: EmployeeConsumption[];
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDV';
  workbook.created = new Date();
  workbook.title = `Consumos de funcionários - ${data.establishmentName}`;
  const employees = new Map(data.employees.map((employee) => [employee.id, employee.name]));
  const sheet = workbook.addWorksheet('Consumos');
  formatRows(sheet, ['Funcionário', 'Data', 'Mês', 'Descrição', 'Valor bruto (R$)', 'Desconto (%)', 'Valor líquido (R$)', 'Status', 'ID do consumo'], data.consumptions.map((consumption) => {
    const net = calculateEmployeeSettlement({
      salaryCents: 0, sales: [], consumptions: [consumption], cancelledCommissions: [], carriedDebtCents: 0,
    }).consumptionCents;
    return [
      employees.get(consumption.employeeId) ?? `Funcionário não encontrado (${consumption.employeeId})`,
      consumption.createdAt ?? '',
      consumption.month,
      consumption.description ?? '',
      consumption.amountCents / 100,
      consumption.discountPercent,
      net / 100,
      consumption.cancelled ? 'Cancelado' : 'Ativo',
      consumption.consumptionId,
    ];
  }));
  [5, 7].forEach((column) => { sheet.getColumn(column).numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function downloadEmployeeConsumptionReport(data: {
  establishmentName: string;
  employees: EmployeeProfile[];
  consumptions: EmployeeConsumption[];
}) {
  const bytes = await createEmployeeConsumptionWorkbook(data);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, data.establishmentName, new Date().toISOString().slice(0, 10), 'xlsx', 'consumos');
}
