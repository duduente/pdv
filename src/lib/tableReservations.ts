import type { TableReservation } from '@/types';

export interface NewTableReservation {
  scheduledAt: string;
  customerName: string;
  phone: string;
  partySize: number;
  tableLabel?: string;
  notes?: string;
}

export function createTableReservation(
  input: NewTableReservation,
  establishmentId: string,
  id: string,
  createdAt: string,
  now = new Date(),
): TableReservation {
  const scheduledAt = new Date(input.scheduledAt);
  if (!input.customerName.trim()) throw new Error('Informe o nome do cliente.');
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now) {
    throw new Error('Escolha uma data e horário futuros para a reserva.');
  }
  if (!Number.isInteger(input.partySize) || input.partySize < 1) {
    throw new Error('Informe uma quantidade válida de pessoas.');
  }

  return {
    id,
    establishmentId,
    createdAt,
    scheduledAt: scheduledAt.toISOString(),
    customerName: input.customerName.trim(),
    phone: input.phone.trim(),
    partySize: input.partySize,
    ...(input.tableLabel?.trim() ? { tableLabel: input.tableLabel.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    status: 'confirmed',
  };
}

export function sortTableReservations(reservations: TableReservation[]) {
  return [...reservations].sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt));
}
