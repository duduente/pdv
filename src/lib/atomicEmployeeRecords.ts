import { supabase } from '@/lib/supabase';

export interface AtomicRecordSnapshot<T = unknown> {
  key: string;
  exists: boolean;
  value: T;
}

export interface AtomicRecordOperation {
  snapshot: AtomicRecordSnapshot;
  value?: unknown;
  write: boolean;
}

export class AtomicRecordError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export function isAtomicEmployeeRecord(key: string) {
  return /^(store-finances|employee-roster|cash-register|menu-orders|commands|appointments|inventory|inventory-movements):/.test(key);
}

export async function commitEmployeeRecords(tenantId: string, operations: AtomicRecordOperation[]) {
  if (!supabase) throw new Error('O banco de dados não está configurado.');
  const { error } = await supabase.rpc('commit_employee_records', {
    target_tenant: tenantId,
    operations: operations.map(({ snapshot, value, write }) => ({
      key: snapshot.key,
      exists: snapshot.exists,
      expected: snapshot.exists ? snapshot.value : null,
      write,
      ...(write ? { value } : {}),
    })),
  });
  if (error) throw new AtomicRecordError(error.message, error.code);
}
