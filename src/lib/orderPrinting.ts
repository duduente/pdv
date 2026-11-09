import type { MenuOrder } from '@/types';

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function buildDeliveryOrderPrintHtml(order: MenuOrder, establishmentName: string, driverName?: string) {
  const isPickup = order.orderType === 'pickup';
  const payment = order.paymentSplits?.length
    ? order.paymentSplits.map((split) => `${split.method}: ${formatCurrency(split.amount)}`).join(' · ')
    : order.paymentMethod ?? 'Não informado';
  const items = order.items.map((item) => `
    <tr>
      <td>${escapeHtml(String(item.quantity))}×</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="amount">${formatCurrency(item.price * item.quantity)}</td>
    </tr>
  `).join('');
  const deliveryFee = isPickup ? 0 : order.deliveryFee ?? 0;
  const total = order.total + deliveryFee;
  const date = new Date(order.createdAt);
  const createdAt = Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pedido ${escapeHtml(order.id.slice(0, 8))}</title>
  <style>
    @page { margin: 8mm; }
    body { font: 14px/1.4 Arial, sans-serif; color: #111; margin: 0 auto; max-width: 380px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 14px 0 6px; }
    p { margin: 3px 0; }
    .muted { color: #555; font-size: 12px; }
    .type { border: 2px solid #111; display: inline-block; font-weight: bold; margin: 10px 0; padding: 5px 10px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #bbb; padding: 6px 2px; text-align: left; vertical-align: top; }
    th { font-size: 12px; }
    .amount { text-align: right; white-space: nowrap; }
    .total { border-top: 2px solid #111; font-size: 17px; font-weight: bold; margin-top: 8px; padding-top: 8px; text-align: right; }
    @media print { body { max-width: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(establishmentName)}</h1>
    <p class="muted">Pedido ${escapeHtml(order.id.slice(0, 8))} · ${escapeHtml(createdAt)}</p>
    <div class="type">${isPickup ? 'RETIRADA' : 'ENTREGA'}</div>
  </header>
  <section>
    <h2>Cliente</h2>
    <p>${escapeHtml(order.customerName || 'Não informado')}</p>
    <p>Telefone: ${escapeHtml(order.phone || 'Não informado')}</p>
    ${!isPickup ? `<p>Endereço: ${escapeHtml(order.address || 'Não informado')}</p>${order.postalCode ? `<p>CEP: ${escapeHtml(order.postalCode)}</p>` : ''}` : '<p>Cliente irá retirar no estabelecimento.</p>'}
    ${driverName && !isPickup ? `<p>Entregador: ${escapeHtml(driverName)}</p>` : ''}
  </section>
  <section>
    <h2>Itens</h2>
    <table>
      <thead><tr><th>Qtd.</th><th>Produto</th><th class="amount">Valor</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    ${!isPickup ? `<p class="amount">Taxa de entrega: ${formatCurrency(deliveryFee)}</p>` : ''}
    <p class="muted">Pagamento: ${escapeHtml(payment)}</p>
    <p class="total">Total: ${formatCurrency(total)}</p>
  </section>
</body>
</html>`;
}

export function printDeliveryOrder(order: MenuOrder, establishmentName: string, driverName?: string) {
  const printWindow = window.open('', '_blank', 'width=420,height=700');
  if (!printWindow) throw new Error('A janela de impressão foi bloqueada pelo navegador.');

  printWindow.document.open();
  printWindow.document.write(buildDeliveryOrderPrintHtml(order, establishmentName, driverName));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
