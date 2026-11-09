drop policy if exists "tenant_records_read_authorized" on public.tenant_records;
create policy "tenant_records_read_authorized" on public.tenant_records
  for select to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (
      tenant_id is null
      and storage_key like 'admin-billing:%'
      and public.has_store_permission(split_part(storage_key, ':', 2), 'finance')
    )
    or (
      tenant_id is not null
      and (
        public.can_access_tenant_record(tenant_id, storage_key)
        or (
          storage_key = 'store-finances:' || tenant_id
          and public.has_store_permission(tenant_id, 'finance')
        )
      )
    )
  );
