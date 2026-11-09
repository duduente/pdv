import { supabase } from '@/lib/supabase';
import {
  EMPTY_STORE_FINANCES,
  ensureCurrentRecurringBill,
  type StoreFinances,
} from '@/lib/storeFinances';

const storageKey = (establishmentId: string) => `admin-billing:${establishmentId}`;
const localKey = (establishmentId: string) => `kito-admin-billing:${establishmentId}`;

function readLocal(establishmentId: string): StoreFinances {
  try {
    const stored = window.localStorage.getItem(localKey(establishmentId));
    return stored ? JSON.parse(stored) as StoreFinances : EMPTY_STORE_FINANCES;
  } catch (error) {
    throw new Error(`Não foi possível ler as cobranças da mensalidade Kito: ${error instanceof Error ? error.message : 'dados locais inválidos'}`);
  }
}

export async function loadAdminBilling(establishmentId: string, isDemo: boolean): Promise<StoreFinances> {
  if (isDemo || !supabase) return readLocal(establishmentId);
  const { data, error } = await supabase
    .from('tenant_records')
    .select('value')
    .eq('storage_key', storageKey(establishmentId))
    .is('tenant_id', null)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar as cobranças da mensalidade Kito: ${error.message}`);
  return (data?.value as StoreFinances | undefined) ?? EMPTY_STORE_FINANCES;
}

export async function saveAdminBilling(establishmentId: string, value: StoreFinances, isDemo: boolean) {
  if (isDemo || !supabase) {
    window.localStorage.setItem(localKey(establishmentId), JSON.stringify(value));
    return;
  }
  const { error } = await supabase.from('tenant_records').upsert({
    storage_key: storageKey(establishmentId),
    tenant_id: null,
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'storage_key' });
  if (error) throw new Error(`Não foi possível salvar as cobranças da mensalidade Kito: ${error.message}`);
}

export function ensureAdminMonthlyBill(
  billing: StoreFinances,
  monthlyAmount: number,
  referenceDate: Date,
  createId: () => string,
) {
  return ensureCurrentRecurringBill({
    ...billing,
    recurring: { ...billing.recurring, enabled: true, amount: monthlyAmount },
  }, referenceDate, createId);
}
