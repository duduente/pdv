import type { AppUser } from '@/auth/AuthContext';
import type { AuditEvent, CashRegisterData, MenuOrder } from '@/types';

type AuditEventInput = Omit<AuditEvent, 'id' | 'actorId' | 'actorName'>;

export function createAuditEvent(user: AppUser | null, input: AuditEventInput): AuditEvent {
  return {
    ...input,
    id: globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    actorId: user?.id ?? null,
    actorName: user?.displayName.trim() || user?.username.trim() || 'Usuário desconhecido',
  };
}

export function appendAuditEvent(register: CashRegisterData, event: AuditEvent): CashRegisterData {
  return {
    ...register,
    auditEvents: [...(register.auditEvents ?? []), event],
  };
}

export function describeOrderChanges(previous: MenuOrder, next: MenuOrder): string[] {
  const fields: string[] = [];
  if (previous.customerName !== next.customerName) fields.push('cliente');
  if (previous.orderType !== next.orderType) fields.push('modalidade');
  if (previous.address !== next.address || previous.postalCode !== next.postalCode) fields.push('endereço');
  if (previous.phone !== next.phone) fields.push('telefone');
  if (previous.document !== next.document) fields.push('CPF/CNPJ');
  if (JSON.stringify(previous.items) !== JSON.stringify(next.items)) fields.push('itens');
  if (previous.total !== next.total) fields.push('total');
  if (previous.deliveryFee !== next.deliveryFee) fields.push('taxa de entrega');
  if (previous.driverId !== next.driverId) fields.push('entregador');
  if (previous.deliveryStatus !== next.deliveryStatus) fields.push('status');
  return fields;
}
