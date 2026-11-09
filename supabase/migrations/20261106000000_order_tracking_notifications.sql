create index if not exists tenant_records_value_gin_idx
  on public.tenant_records using gin (value jsonb_path_ops);

create or replace function public.get_public_order_tracking(tracking_code uuid)
returns table (
  store_name text,
  order_type text,
  delivery_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    establishments.name,
    orders.order_data ->> 'orderType',
    orders.order_data ->> 'deliveryStatus',
    (orders.order_data ->> 'createdAt')::timestamptz
  from public.tenant_records as records
  join public.establishments as establishments
    on establishments.id = records.tenant_id
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(records.value) = 'array' then records.value
      else '[]'::jsonb
    end
  ) as orders(order_data)
  where records.storage_key like 'menu-orders:%'
    and records.value @> jsonb_build_array(
      jsonb_build_object('trackingToken', tracking_code::text)
    )
    and orders.order_data ->> 'trackingToken' = tracking_code::text
  limit 1;
$$;

revoke all on function public.get_public_order_tracking(uuid) from public;
grant execute on function public.get_public_order_tracking(uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'tenant_records'
    )
  then
    alter publication supabase_realtime add table public.tenant_records;
  end if;
end;
$$;
