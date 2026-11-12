// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { reconcileLocalEmployees, writeLocalProfessionalProjection } from './localEmployeeIntegration';

beforeEach(() => window.localStorage.clear());

it('merges unique names, preserves financial data, excludes owners and is repeatable', () => {
  window.localStorage.setItem('store-finances:s', JSON.stringify({
    recurring: { enabled: false, dueDay: 10, amount: 0 }, bills: [{ id: 'bill' }],
    employees: { employees: [{ id: 'e1', name: 'Carlos', salaryCents: 5000, commissionPercent: 10, consumptionDiscountPercent: 0, active: true }], consumptions: [], settlements: [] },
  }));
  window.localStorage.setItem('employee-roster:s', JSON.stringify([{ id: 'e1', name: 'Carlos', commissionPercent: 10, active: true }]));
  window.localStorage.setItem('demo-auth-users', JSON.stringify([
    { id: 'owner', displayName: 'Owner', establishmentIds: ['s'] },
    { id: 'user', displayName: 'Carlos', establishmentIds: ['s'], establishmentPermissions: { s: ['agendamento'] } },
    { id: 'other', displayName: 'Other', establishmentIds: ['s'], establishmentPermissions: { s: ['dashboard'] } },
  ]));
  reconcileLocalEmployees('s', [{ id: 'old', name: 'Carlos', role: 'Barbeiro' }]);
  reconcileLocalEmployees('s', []);
  const finances = JSON.parse(window.localStorage.getItem('store-finances:s') || '{}');
  expect(finances.bills).toEqual([{ id: 'bill' }]);
  expect(finances.employees.employees).toHaveLength(2);
  expect(finances.employees.employees[0]).toMatchObject({ id: 'e1', userId: 'user', salaryCents: 5000, role: 'Barbeiro' });
  expect(finances.employees.employees[1]).toMatchObject({ name: 'Other', userId: 'other', salaryCents: 0 });
  const projection = JSON.parse(window.localStorage.getItem('professionals:s') || '[]');
  expect(projection).toHaveLength(2);
  expect(projection[0]).not.toHaveProperty('salaryCents');
});

it('keeps duplicate names separate and omits inactive staff from booking', () => {
  window.localStorage.setItem('demo-auth-users', JSON.stringify([
    { id: 'u1', displayName: 'João', establishmentIds: ['s'], establishmentPermissions: { s: ['agendamento'] } },
    { id: 'u2', displayName: 'João', establishmentIds: ['s'], establishmentPermissions: { s: ['agendamento'] } },
  ]));
  reconcileLocalEmployees('s', [{ id: 'p1', name: 'João', role: 'Barbeiro' }]);
  const finances = JSON.parse(window.localStorage.getItem('store-finances:s') || '{}');
  expect(finances.employees.employees).toHaveLength(3);
  expect(finances.employees.employees.map((entry: { userId?: string }) => entry.userId).filter(Boolean).sort()).toEqual(['u1', 'u2']);
  const staff = finances.employees.employees;
  writeLocalProfessionalProjection('s', [{ ...staff[0], active: false }, ...staff.slice(1)]);
  expect(JSON.parse(window.localStorage.getItem('professionals:s') || '[]')).toHaveLength(2);
});
