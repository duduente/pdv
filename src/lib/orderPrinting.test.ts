import { describe, expect, it } from 'vitest';
import type { MenuOrder } from '@/types';
import { buildDeliveryOrderPrintHtml } from './orderPrinting';

const order: MenuOrder = {
  id: 'pedido-12345678',
  establishmentId: 'loja-1',
  createdAt: '2026-11-09T12:00:00.000Z',
  items: [{ productId: 'item-1', name: '<script>alert("x")</script>', price: 10, quantity: 2 }],
  total: 20,
  status: 'pending',
  orderType: 'delivery',
  customerName: 'Cliente & Companhia',
  address: 'Rua A, 10',
  phone: '11999999999',
  paymentMethod: 'pix',
  deliveryFee: 5,
};

describe('delivery order printing', () => {
  it('prints order details and escapes user-provided HTML', () => {
    const html = buildDeliveryOrderPrintHtml(order, 'Loja <Teste>');

    expect(html).toContain('ENTREGA');
    expect(html).toContain('Cliente &amp; Companhia');
    expect(html).toContain('Loja &lt;Teste&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Taxa de entrega');
    expect(html).toContain('R$');
    expect(html).not.toContain('<script>alert');
  });

  it('prints pickup without address or delivery fee', () => {
    const html = buildDeliveryOrderPrintHtml({ ...order, orderType: 'pickup' }, 'Loja');

    expect(html).toContain('RETIRADA');
    expect(html).toContain('Cliente irá retirar no estabelecimento.');
    expect(html).not.toContain('Endereço:');
    expect(html).not.toContain('Taxa de entrega');
  });
});
