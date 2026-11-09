import { describe, expect, it } from 'vitest';
import { createTableReservation, sortTableReservations } from './tableReservations';

const now = new Date('2026-11-09T12:00:00.000Z');

describe('table reservations', () => {
  it('creates a normalized future reservation', () => {
    expect(createTableReservation({
      scheduledAt: '2026-11-10T19:30',
      customerName: '  Ana  ',
      phone: ' 11999999999 ',
      partySize: 4,
      tableLabel: ' Mesa 2 ',
      notes: ' Aniversário ',
    }, 'store-1', 'reservation-1', now.toISOString(), now)).toMatchObject({
      establishmentId: 'store-1',
      customerName: 'Ana',
      phone: '11999999999',
      partySize: 4,
      tableLabel: 'Mesa 2',
      notes: 'Aniversário',
      status: 'confirmed',
    });
  });

  it('rejects missing name, past time and invalid party size', () => {
    const base = { scheduledAt: '2026-11-10T19:30', customerName: 'Ana', phone: '', partySize: 2 };
    expect(() => createTableReservation({ ...base, customerName: ' ' }, 'store-1', 'id', now.toISOString(), now))
      .toThrow('Informe o nome do cliente.');
    expect(() => createTableReservation({ ...base, scheduledAt: '2026-11-09T11:00' }, 'store-1', 'id', now.toISOString(), now))
      .toThrow('Escolha uma data e horário futuros para a reserva.');
    expect(() => createTableReservation({ ...base, partySize: 0 }, 'store-1', 'id', now.toISOString(), now))
      .toThrow('Informe uma quantidade válida de pessoas.');
  });

  it('sorts reservations by scheduled time', () => {
    const later = createTableReservation({
      scheduledAt: '2026-11-12T19:30', customerName: 'Bia', phone: '', partySize: 2,
    }, 'store-1', 'later', now.toISOString(), now);
    const sooner = createTableReservation({
      scheduledAt: '2026-11-10T19:30', customerName: 'Ana', phone: '', partySize: 2,
    }, 'store-1', 'sooner', now.toISOString(), now);
    expect(sortTableReservations([later, sooner]).map((reservation) => reservation.id)).toEqual(['sooner', 'later']);
  });
});
