create or replace function public.guard_cash_expense_permission_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.storage_key like 'cash-register:%'
    and (
      (tg_op = 'INSERT' and case
        when jsonb_typeof(new.value -> 'expenses') = 'array'
          then jsonb_array_length(new.value -> 'expenses') > 0
        else false
      end)
      or (tg_op = 'UPDATE' and new.value -> 'expenses' is distinct from old.value -> 'expenses')
    )
    and not public.is_super_admin()
    and not public.has_store_permission(new.tenant_id, 'pdv-movements')
  then
    raise exception 'You do not have permission to change cash expenses.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_cash_expense_permission_changes on public.tenant_records;
create trigger guard_cash_expense_permission_changes
  before insert or update on public.tenant_records
  for each row execute procedure public.guard_cash_expense_permission_changes();
