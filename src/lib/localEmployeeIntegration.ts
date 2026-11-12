import { EMPTY_STORE_FINANCES, type StoreFinances } from '@/lib/storeFinances';
import type { EmployeeProfile, EmployeeRosterEntry } from '@/lib/employeeSettlement';
import type { Professional, StorePermission } from '@/types';

interface LocalUser {
  id: string;
  displayName: string;
  establishmentIds: string[];
  establishmentPermissions?: Record<string, StorePermission[]>;
}

function readLocal<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : JSON.parse(raw) as T;
}

function writeLocal(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  window.localStorage.setItem(key, serialized);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: serialized }));
}

function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase('pt-BR');
}

export function writeLocalProfessionalProjection(establishmentId: string, employees: EmployeeProfile[]) {
  const professionals = employees.filter((employee) => employee.active).map((employee) => ({
    id: employee.id, name: employee.name, role: employee.role || 'Profissional',
  }));
  writeLocal(`professionals:${establishmentId}`, professionals);
}

export function reconcileLocalEmployees(establishmentId: string, initialProfessionals: Professional[]) {
  const financeKey = `store-finances:${establishmentId}`;
  const rosterKey = `employee-roster:${establishmentId}`;
  const professionalKey = `professionals:${establishmentId}`;
  const finances = readLocal<StoreFinances>(financeKey, EMPTY_STORE_FINANCES);
  const records = finances.employees ?? { employees: [], consumptions: [], settlements: [] };
  const employees = [...records.employees];
  const roster = [...readLocal<EmployeeRosterEntry[]>(rosterKey, [])];
  const professionals = readLocal<Professional[]>(professionalKey, initialProfessionals);
  const users = readLocal<LocalUser[]>('demo-auth-users', []).filter((entry) =>
    entry.establishmentIds.includes(establishmentId)
    && entry.establishmentPermissions?.[establishmentId]
    && !entry.establishmentPermissions[establishmentId].includes('*'),
  );
  const create = (name: string, role: string, userId?: string) => {
    const employee: EmployeeProfile = {
      id: crypto.randomUUID(), name: name.trim(), role: role || 'Profissional', userId,
      salaryCents: 0, commissionPercent: 0, consumptionDiscountPercent: 0, active: true,
    };
    employees.push(employee);
    roster.push({ id: employee.id, name: employee.name, active: true, commissionPercent: 0 });
  };
  for (const entry of roster) {
    if (!employees.some((employee) => employee.id === entry.id)) {
      employees.push({
        id: entry.id, name: entry.name, salaryCents: 0, commissionPercent: entry.commissionPercent,
        consumptionDiscountPercent: 0, active: entry.active,
      });
    }
  }
  for (const professional of professionals) {
    if (employees.some((entry) => entry.id === professional.id)) continue;
    const name = normalizedName(professional.name);
    const candidates = employees.filter((entry) => normalizedName(entry.name) === name);
    const sources = professionals.filter((entry) => normalizedName(entry.name) === name);
    if (sources.length === 1 && candidates.length === 1) {
      const index = employees.indexOf(candidates[0]);
      employees[index] = { ...candidates[0], role: candidates[0].role || professional.role };
    } else {
      create(professional.name, professional.role);
    }
  }
  for (const user of users) {
    if (employees.some((entry) => entry.userId === user.id)) continue;
    const name = normalizedName(user.displayName);
    const matchingUsers = users.filter((entry) => normalizedName(entry.displayName) === name);
    const candidates = employees.filter((entry) => normalizedName(entry.name) === name);
    if (matchingUsers.length === 1 && candidates.length === 1 && !candidates[0].userId) {
      const index = employees.indexOf(candidates[0]);
      employees[index] = { ...candidates[0], userId: user.id };
    } else {
      create(user.displayName, 'Profissional', user.id);
    }
  }
  writeLocal(financeKey, { ...finances, employees: { ...records, employees } });
  writeLocal(rosterKey, roster);
  writeLocalProfessionalProjection(establishmentId, employees);
}
