alter table public.establishment_memberships
  add column if not exists permissions text[] not null default array['*']::text[];

create or replace function public.has_store_permission(target_establishment_id text, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.establishment_memberships
    where user_id = (select auth.uid())
      and establishment_id = target_establishment_id
      and (permissions @> array['*']::text[] or permissions @> array[target_permission]::text[])
  );
$$;

create or replace function public.can_access_tenant_record(target_establishment_id text, target_storage_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or case
    when target_storage_key like 'cash-register:%' then
      public.has_store_permission(target_establishment_id, 'pdv-sales')
      or public.has_store_permission(target_establishment_id, 'pdv-movements')
      or public.has_store_permission(target_establishment_id, 'pdv-reports')
      or public.has_store_permission(target_establishment_id, 'pdv-sessions')
      or public.has_store_permission(target_establishment_id, 'delivery')
    when target_storage_key like 'delivery-drivers:%' then
      public.has_store_permission(target_establishment_id, 'delivery')
    when target_storage_key like 'delivery-settings:%' then
      public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'store-settings')
      or public.has_store_permission(target_establishment_id, 'cardapio')
    when target_storage_key like 'menu-orders:%' then
      public.has_store_permission(target_establishment_id, 'cardapio')
      or public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'menu-items:%' or target_storage_key like 'menu-categories:%' then
      public.has_store_permission(target_establishment_id, 'cardapio')
      or public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'commands:%' then
      public.has_store_permission(target_establishment_id, 'comandas')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'inventory:%' then
      public.has_store_permission(target_establishment_id, 'estoque')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'appointments:%'
      or target_storage_key like 'services:%'
      or target_storage_key like 'professionals:%'
      or target_storage_key like 'working-hours:%'
      or target_storage_key like 'appointment-duration:%' then
      public.has_store_permission(target_establishment_id, 'agendamento')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    else false
  end;
$$;

create or replace function public.can_write_tenant_record(target_establishment_id text, target_storage_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or case
    when target_storage_key like 'cash-register:%' then
      public.has_store_permission(target_establishment_id, 'pdv-sales')
      or public.has_store_permission(target_establishment_id, 'pdv-movements')
      or public.has_store_permission(target_establishment_id, 'pdv-sessions')
      or public.has_store_permission(target_establishment_id, 'delivery')
    when target_storage_key like 'delivery-drivers:%' then
      public.has_store_permission(target_establishment_id, 'delivery')
    when target_storage_key like 'delivery-settings:%' then
      public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'store-settings')
    when target_storage_key like 'menu-orders:%' then
      public.has_store_permission(target_establishment_id, 'cardapio')
      or public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'menu-items:%' or target_storage_key like 'menu-categories:%' then
      public.has_store_permission(target_establishment_id, 'cardapio')
      or public.has_store_permission(target_establishment_id, 'delivery')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'commands:%' then
      public.has_store_permission(target_establishment_id, 'comandas')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'inventory:%' then
      public.has_store_permission(target_establishment_id, 'estoque')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    when target_storage_key like 'appointments:%'
      or target_storage_key like 'services:%'
      or target_storage_key like 'professionals:%'
      or target_storage_key like 'working-hours:%'
      or target_storage_key like 'appointment-duration:%' then
      public.has_store_permission(target_establishment_id, 'agendamento')
      or public.has_store_permission(target_establishment_id, 'pdv-sales')
    else false
  end;
$$;

create or replace function public.guard_cash_register_permission_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_non_delivery_sales jsonb;
  new_non_delivery_sales jsonb;
begin
  if new.storage_key like 'cash-register:%' and not public.is_super_admin() then
    if new.value -> 'sales' is distinct from old.value -> 'sales' then
      if not public.has_store_permission(new.tenant_id, 'pdv-sales') then
        if not public.has_store_permission(new.tenant_id, 'delivery') then
          raise exception 'You do not have permission to change cash sales.' using errcode = '42501';
        end if;
        select coalesce(jsonb_agg(sale order by sale ->> 'id'), '[]'::jsonb)
          into old_non_delivery_sales
          from jsonb_array_elements(coalesce(old.value -> 'sales', '[]'::jsonb)) as entries(sale)
          where coalesce(sale ->> 'origin', '') <> 'delivery';
        select coalesce(jsonb_agg(sale order by sale ->> 'id'), '[]'::jsonb)
          into new_non_delivery_sales
          from jsonb_array_elements(coalesce(new.value -> 'sales', '[]'::jsonb)) as entries(sale)
          where coalesce(sale ->> 'origin', '') <> 'delivery';
        if old_non_delivery_sales is distinct from new_non_delivery_sales then
          raise exception 'Delivery users can only change delivery sales.' using errcode = '42501';
        end if;
      end if;
    end if;
    if new.value -> 'movements' is distinct from old.value -> 'movements'
      and not public.has_store_permission(new.tenant_id, 'pdv-movements') then
      raise exception 'You do not have permission to change cash movements.' using errcode = '42501';
    end if;
    if (new.value -> 'sessions' is distinct from old.value -> 'sessions'
      or new.value -> 'activeSessionId' is distinct from old.value -> 'activeSessionId')
      and not public.has_store_permission(new.tenant_id, 'pdv-sessions') then
      raise exception 'You do not have permission to change cash sessions.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_cash_register_permission_changes on public.tenant_records;
create trigger guard_cash_register_permission_changes
  before update on public.tenant_records
  for each row execute procedure public.guard_cash_register_permission_changes();

create or replace function public.guard_store_settings_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin()
    and (new.name is distinct from old.name
      or new.owner is distinct from old.owner
      or new.email is distinct from old.email
      or new.whatsapp is distinct from old.whatsapp
      or new.theme is distinct from old.theme)
    and not public.has_store_permission(old.id, 'store-settings') then
    raise exception 'You do not have permission to change store settings.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_store_settings_permission on public.establishments;
create trigger guard_store_settings_permission
  before update on public.establishments
  for each row execute procedure public.guard_store_settings_permission();

drop policy if exists "members can upload establishment logos" on storage.objects;
create policy "members can upload establishment logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'establishment-logos'
    and public.has_store_permission((storage.foldername(name))[1], 'store-settings')
  );

drop policy if exists "members can update establishment logos" on storage.objects;
create policy "members can update establishment logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'establishment-logos'
    and public.has_store_permission((storage.foldername(name))[1], 'store-settings')
  )
  with check (
    bucket_id = 'establishment-logos'
    and public.has_store_permission((storage.foldername(name))[1], 'store-settings')
  );

drop policy if exists "members can delete establishment logos" on storage.objects;
create policy "members can delete establishment logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'establishment-logos'
    and public.has_store_permission((storage.foldername(name))[1], 'store-settings')
  );

drop policy if exists "tenant_records_read_authorized" on public.tenant_records;
create policy "tenant_records_read_authorized" on public.tenant_records
  for select to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_tenant_record(tenant_id, storage_key))
  );

drop policy if exists "tenant_records_insert_authorized" on public.tenant_records;
create policy "tenant_records_insert_authorized" on public.tenant_records
  for insert to authenticated
  with check (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_write_tenant_record(tenant_id, storage_key))
  );

drop policy if exists "tenant_records_update_authorized" on public.tenant_records;
create policy "tenant_records_update_authorized" on public.tenant_records
  for update to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_write_tenant_record(tenant_id, storage_key))
  )
  with check (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_write_tenant_record(tenant_id, storage_key))
  );

drop policy if exists "tenant_records_delete_authorized" on public.tenant_records;
create policy "tenant_records_delete_authorized" on public.tenant_records
  for delete to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_write_tenant_record(tenant_id, storage_key))
  );
