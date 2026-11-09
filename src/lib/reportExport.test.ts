import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createFinancialReportBackup, createFinancialReportWorkbook } from './reportExport';

describe('exportação de relatórios Excel', () => {
  const report = {
    establishmentName: 'Loja Teste',
    periodLabel: 'Diário',
    periodDescription: '09/11/2026',
    sales: [],
    expenses: [],
    movements: [],
    auditEvents: [],
    deliveryRows: [],
    profit: {
      revenue: 0,
      knownProductCost: 0,
      expenseTotal: 0,
      estimatedProfit: 0,
      marginPercent: 0,
      itemsWithoutCost: 0,
    },
  };

  it('gera um backup JSON versionado que pode ser reaberto', () => {
    const backup = JSON.parse(createFinancialReportBackup(report)) as Record<string, unknown>;

    expect(backup.format).toBe('pdv-financial-report');
    expect(backup.version).toBe(1);
    expect(backup.establishmentName).toBe(report.establishmentName);
    expect(backup.sales).toEqual([]);
  });

  it('gera planilhas de resumo, vendas, despesas e entregadores', async () => {
    const bytes = await createFinancialReportWorkbook({
      establishmentName: 'Loja Teste',
      periodLabel: 'Diário',
      periodDescription: '09/11/2026',
      sales: [{
        id: 'sale-1',
        establishmentId: 'store-1',
        sessionId: 'session-1',
        createdAt: '2026-11-09T12:00:00.000Z',
        items: [{ productId: 'product-1', name: 'Produto', price: 20, unitCost: 8, quantity: 2 }],
        total: 40,
        origin: 'produto_estoque',
        paymentMethod: 'pix',
        amountReceived: 40,
        change: 0,
      }],
      expenses: [{
        id: 'expense-1',
        establishmentId: 'store-1',
        createdAt: '2026-11-09T10:00:00.000Z',
        description: 'Energia',
        category: 'Contas',
        amount: 5,
        paymentMethod: 'pix',
        recordedBy: 'Operador',
      }],
      movements: [{
        id: 'movement-1',
        establishmentId: 'store-1',
        sessionId: 'session-1',
        createdAt: '2026-11-09T10:00:00.000Z',
        type: 'withdrawal',
        amount: 5,
        note: 'Compra emergencial',
      }],
      auditEvents: [{
        id: 'event-1',
        entityType: 'sale',
        entityId: 'sale-1',
        action: 'created',
        actorId: 'user-1',
        actorName: 'Operador',
        occurredAt: '2026-11-09T12:00:00.000Z',
        summary: 'Venda registrada.',
      }],
      deliveryRows: [{ name: 'Entregador', deliveries: 1, total: 40 }],
      profit: {
        revenue: 40,
        knownProductCost: 16,
        expenseTotal: 5,
        estimatedProfit: 19,
        marginPercent: 47.5,
        itemsWithoutCost: 0,
      },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Vendas',
      'Despesas',
      'Movimentações',
      'Entregadores',
      'Histórico',
    ]);
    expect(workbook.getWorksheet('Resumo')?.getCell('B8').value).toBe(19);
    expect(workbook.getWorksheet('Vendas')?.getCell('G2').value).toBe(16);
    expect(workbook.getWorksheet('Despesas')?.getCell('D2').value).toBe(5);
  });
});
