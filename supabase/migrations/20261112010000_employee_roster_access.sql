drop policy if exists "employee_roster_read" on public.tenant_records;
create policy "employee_roster_read" on public.tenant_records
  for select to authenticated
  using (
    tenant_id is not null
    and storage_key = 'employee-roster:' || tenant_id
    and (
      public.has_store_permission(tenant_id, 'finance')
      or public.has_store_permission(tenant_id, 'pdv-sales')
      or public.has_store_permission(tenant_id, 'delivery')
    )
  );

drop policy if exists "employee_roster_insert" on public.tenant_records;
create policy "employee_roster_insert" on public.tenant_records
  for insert to authenticated
  with check (
    tenant_id is not null
    and storage_key = 'employee-roster:' || tenant_id
    and public.has_store_permission(tenant_id, 'finance')
  );

drop policy if exists "employee_roster_update" on public.tenant_records;
create policy "employee_roster_update" on public.tenant_records
  for update to authenticated
  using (
    tenant_id is not null
    and storage_key = 'employee-roster:' || tenant_id
    and public.has_store_permission(tenant_id, 'finance')
  )
  with check (
    tenant_id is not null
    and storage_key = 'employee-roster:' || tenant_id
    and public.has_store_permission(tenant_id, 'finance')
  );

drop policy if exists "inventory_movements_read" on public.tenant_records;
create policy "inventory_movements_read" on public.tenant_records
  for select to authenticated
  using (
    tenant_id is not null
    and storage_key = 'inventory-movements:' || tenant_id
    and public.has_store_permission(tenant_id, 'estoque')
  );

drop policy if exists "inventory_movements_insert" on public.tenant_records;
create policy "inventory_movements_insert" on public.tenant_records
  for insert to authenticated
  with check (
    tenant_id is not null
    and storage_key = 'inventory-movements:' || tenant_id
    and public.has_store_permission(tenant_id, 'estoque')
  );

drop policy if exists "inventory_movements_update" on public.tenant_records;
create policy "inventory_movements_update" on public.tenant_records
  for update to authenticated
  using (
    tenant_id is not null
    and storage_key = 'inventory-movements:' || tenant_id
    and public.has_store_permission(tenant_id, 'estoque')
  )
  with check (
    tenant_id is not null
    and storage_key = 'inventory-movements:' || tenant_id
    and public.has_store_permission(tenant_id, 'estoque')
  );
