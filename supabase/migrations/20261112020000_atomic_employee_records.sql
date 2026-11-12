create or replace function public.is_atomic_employee_record(record_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select record_key like 'store-finances:%'
    or record_key like 'employee-roster:%'
    or record_key like 'cash-register:%'
    or record_key like 'menu-orders:%'
    or record_key like 'commands:%'
    or record_key like 'appointments:%'
    or record_key like 'inventory:%'
    or record_key like 'inventory-movements:%';
$$;

create or replace function public.guard_atomic_employee_records()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (case when tg_op = 'DELETE' then public.is_atomic_employee_record(old.storage_key)
      when tg_op = 'UPDATE' then public.is_atomic_employee_record(old.storage_key) or public.is_atomic_employee_record(new.storage_key)
      else public.is_atomic_employee_record(new.storage_key) end)
    and current_setting('app.atomic_employee_write', true) is distinct from '1' then
    raise exception 'Atualize o aplicativo antes de alterar estes dados.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists guard_atomic_employee_records on public.tenant_records;
create trigger guard_atomic_employee_records
  before insert or update or delete on public.tenant_records
  for each row execute function public.guard_atomic_employee_records();

create or replace function public.commit_employee_records(target_tenant text, operations jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  operation jsonb;
  actual jsonb;
  found_record boolean;
  operation_key text;
  expected_exists boolean;
begin
  if target_tenant is null or target_tenant = ''
    or jsonb_typeof(operations) is distinct from 'array'
    or jsonb_array_length(operations) < 1
    or jsonb_array_length(operations) > 8 then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(operations) item
    where jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'key') is distinct from 'string'
      or item ->> 'key' not in (
        'store-finances:' || target_tenant, 'employee-roster:' || target_tenant,
        'cash-register:' || target_tenant, 'menu-orders:' || target_tenant,
        'commands:' || target_tenant, 'appointments:' || target_tenant, 'inventory:' || target_tenant,
        'inventory-movements:' || target_tenant
      )
      or jsonb_typeof(item -> 'exists') is distinct from 'boolean'
      or jsonb_typeof(item -> 'write') is distinct from 'boolean'
      or not (item ? 'expected')
      or ((item ->> 'write')::boolean and (not (item ? 'value') or item -> 'value' = 'null'::jsonb))
  ) or (select count(distinct item ->> 'key') from jsonb_array_elements(operations) item) <> jsonb_array_length(operations) then
    raise exception 'Registros inválidos.' using errcode = '22023';
  end if;

  for operation_key in
    select item ->> 'key' from jsonb_array_elements(operations) item order by item ->> 'key'
  loop
    perform pg_advisory_xact_lock(hashtextextended(operation_key, 0));
  end loop;

  for operation in select item from jsonb_array_elements(operations) item
  loop
    operation_key := operation ->> 'key';
    expected_exists := (operation ->> 'exists')::boolean;
    select value into actual from public.tenant_records
      where storage_key = operation_key and tenant_id = target_tenant;
    found_record := found;
    if found_record is distinct from expected_exists
      or (found_record and actual is distinct from operation -> 'expected') then
      raise exception 'Os dados foram alterados em outro dispositivo. Recarregue e tente novamente.' using errcode = '40001';
    end if;
  end loop;

  perform set_config('app.atomic_employee_write', '1', true);
  for operation in select item from jsonb_array_elements(operations) item where (item ->> 'write')::boolean
  loop
    if (operation ->> 'exists')::boolean then
      update public.tenant_records set value = operation -> 'value', updated_at = now()
        where storage_key = operation ->> 'key' and tenant_id = target_tenant;
      if not found then
        raise exception 'Você não tem permissão para alterar este registro.' using errcode = '42501';
      end if;
    else
      insert into public.tenant_records (storage_key, tenant_id, value, updated_at)
      values (operation ->> 'key', target_tenant, operation -> 'value', now());
    end if;
  end loop;
  perform set_config('app.atomic_employee_write', '0', true);
end;
$$;

revoke all on function public.commit_employee_records(text, jsonb) from public, anon;
grant execute on function public.commit_employee_records(text, jsonb) to authenticated;

drop policy if exists "inventory_movements_read" on public.tenant_records;
create policy "inventory_movements_read" on public.tenant_records
  for select to authenticated using (
    tenant_id is not null and storage_key = 'inventory-movements:' || tenant_id
    and (public.has_store_permission(tenant_id, 'estoque') or public.has_store_permission(tenant_id, 'pdv-sales'))
  );
drop policy if exists "inventory_movements_insert" on public.tenant_records;
create policy "inventory_movements_insert" on public.tenant_records
  for insert to authenticated with check (
    tenant_id is not null and storage_key = 'inventory-movements:' || tenant_id
    and (public.has_store_permission(tenant_id, 'estoque') or public.has_store_permission(tenant_id, 'pdv-sales'))
  );
drop policy if exists "inventory_movements_update" on public.tenant_records;
create policy "inventory_movements_update" on public.tenant_records
  for update to authenticated using (
    tenant_id is not null and storage_key = 'inventory-movements:' || tenant_id
    and (public.has_store_permission(tenant_id, 'estoque') or public.has_store_permission(tenant_id, 'pdv-sales'))
  ) with check (
    tenant_id is not null and storage_key = 'inventory-movements:' || tenant_id
    and (public.has_store_permission(tenant_id, 'estoque') or public.has_store_permission(tenant_id, 'pdv-sales'))
  );
