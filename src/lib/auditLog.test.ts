import { describe, expect, it } from 'vitest';
import type { AppUser } from '@/auth/AuthContext';
import type { AuditEvent, CashRegisterData, MenuOrder } from '@/types';
import { appendAuditEvent, createAuditEvent, describeOrderChanges } from './auditLog';

const user: AppUser = {
  id: 'user-1',
  username: 'operator',
  displayName: 'Operador',
  role: 'merchant',
  establishmentIds: ['store-1'],
};

const order: MenuOrder = {
  id: 'order-1',
  establishmentId: 'store-1',
  createdAt: '2026-11-09T10:00:00.000Z',
  items: [{ productId: 'item-1', name: 'Hambúrguer', price: 20, quantity: 1 }],
  total: 20,
  status: 'pending',
  orderType: 'delivery',
  customerName: 'Cliente',
  address: 'Rua 1',
  phone: '1111',
  document: '123',
};

const register: CashRegisterData = {
  activeSessionId: null,
  sessions: [],
  sales: [],
  movements: [],
};

describe('audit log', () => {
  it('records actor and timestamp on an audit event', () => {
    const event = createAuditEvent(user, {
      entityType: 'order',
      entityId: order.id,
      action: 'edited',
      occurredAt: '2026-11-09T11:00:00.000Z',
      summary: 'Pedido editado: endereço.',
    });

    expect(event.actorId).toBe(user.id);
    expect(event.actorName).toBe(user.displayName);
    expect(event.occurredAt).toBe('2026-11-09T11:00:00.000Z');
  });

  it('stores audit records separately from sales so deleted sales remain traceable', () => {
    const event: AuditEvent = {
      id: 'event-1',
      entityType: 'sale',
      entityId: 'sale-1',
      action: 'deleted',
      actorId: user.id,
      actorName: user.displayName,
      occurredAt: '2026-11-09T11:00:00.000Z',
      summary: 'Registro de venda excluído.',
    };

    const updated = appendAuditEvent(register, event);

    expect(updated.sales).toEqual([]);
    expect(updated.auditEvents).toEqual([event]);
    expect(register.auditEvents).toBeUndefined();
  });

  it('appends audit events without replacing earlier history', () => {
    const events = Array.from({ length: 500 }, (_, index): AuditEvent => ({
      id: `event-${index}`,
      entityType: 'sale',
      entityId: `sale-${index}`,
      action: 'cancelled',
      actorId: user.id,
      actorName: user.displayName,
      occurredAt: new Date(index).toISOString(),
      summary: 'Venda estornada.',
    }));

    const updated = appendAuditEvent({ ...register, auditEvents: events }, {
      ...events[0],
      id: 'event-new',
    });

    expect(updated.auditEvents).toHaveLength(501);
    expect(updated.auditEvents?.[0].id).toBe('event-0');
    expect(updated.auditEvents?.at(-1)?.id).toBe('event-new');
  });

  it('describes changed order fields without copying sensitive values into the audit log', () => {
    const updatedOrder: MenuOrder = {
      ...order,
      address: 'Rua 2',
      phone: '2222',
      items: [{ productId: 'item-1', name: 'Hambúrguer', price: 20, quantity: 2 }],
      total: 40,
    };

    expect(describeOrderChanges(order, updatedOrder)).toEqual([
      'endereço',
      'telefone',
      'itens',
      'total',
    ]);
  });
});
