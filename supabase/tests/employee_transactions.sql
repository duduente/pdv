-- Run in the Supabase SQL Editor after 20261112030000.
-- Uses an existing full-access membership; all test changes are rolled back.
begin;

create temporary table employee_test_context as
select m.user_id, m.establishment_id
from public.establishment_memberships m
where m.permissions @> array['*']::text[]
order by m.created_at
limit 1;
grant select on employee_test_context to authenticated;

set local role authenticated;
do $$
declare
  ctx record;
  finances jsonb;
  roster jsonb;
  inventory jsonb;
  movements jsonb;
  register_value jsonb;
  finances_exists boolean;
  roster_exists boolean;
  inventory_exists boolean;
  movements_exists boolean;
  register_exists boolean;
  updated_finances jsonb;
  updated_roster jsonb;
  updated_inventory jsonb;
  updated_movements jsonb;
  updated_register jsonb;
  marker text := 'employee-test-' || gen_random_uuid()::text;
  did_check boolean := false;
begin
  select * into ctx from employee_test_context;
  if ctx.user_id is null then raise exception 'É necessária uma loja com usuário de acesso total.'; end if;
  perform set_config('request.jwt.claim.sub', ctx.user_id::text, true);

  select value into finances from public.tenant_records where storage_key = 'store-finances:' || ctx.establishment_id;
  finances_exists := found;
  select value into roster from public.tenant_records where storage_key = 'employee-roster:' || ctx.establishment_id;
  roster_exists := found;
  select value into inventory from public.tenant_records where storage_key = 'inventory:' || ctx.establishment_id;
  inventory_exists := found;
  select value into movements from public.tenant_records where storage_key = 'inventory-movements:' || ctx.establishment_id;
  movements_exists := found;
  select value into register_value from public.tenant_records where storage_key = 'cash-register:' || ctx.establishment_id;
  register_exists := found;

  if (finances_exists and (jsonb_typeof(finances) <> 'object' or jsonb_typeof(finances -> 'bills') is distinct from 'array'))
    or (finances ? 'employees' and (
      jsonb_typeof(finances #> '{employees,employees}') is distinct from 'array'
      or jsonb_typeof(finances #> '{employees,consumptions}') is distinct from 'array'
      or jsonb_typeof(finances #> '{employees,settlements}') is distinct from 'array'))
    or (roster_exists and jsonb_typeof(roster) <> 'array')
    or (inventory_exists and jsonb_typeof(inventory) <> 'array')
    or (movements_exists and jsonb_typeof(movements) <> 'array')
    or (register_exists and (jsonb_typeof(register_value) <> 'object'
      or jsonb_typeof(register_value -> 'sales') is distinct from 'array')) then
    raise exception 'Formato inesperado nos dados da loja de teste.';
  end if;

  updated_finances := coalesce(finances, '{"recurring":{"enabled":false,"dueDay":10,"amount":0},"bills":[]}'::jsonb);
  if not (updated_finances ? 'employees') then
    updated_finances := jsonb_set(updated_finances, '{employees}', '{"employees":[],"consumptions":[],"settlements":[]}'::jsonb);
  end if;
  updated_finances := jsonb_set(updated_finances, '{employees,employees}',
    (updated_finances #> '{employees,employees}') || jsonb_build_array(jsonb_build_object(
      'id', marker, 'name', marker, 'active', true, 'salaryCents', 10000,
      'commissionPercent', 10, 'consumptionDiscountPercent', 0)));
  updated_finances := jsonb_set(updated_finances, '{employees,consumptions}',
    (updated_finances #> '{employees,consumptions}') || jsonb_build_array(jsonb_build_object(
      'consumptionId', marker, 'employeeId', marker, 'month', '2020-01', 'amountCents', 500, 'discountPercent', 0)));
  updated_finances := jsonb_set(updated_finances, '{employees,settlements}',
    (updated_finances #> '{employees,settlements}') || jsonb_build_array(jsonb_build_object(
      'employeeId', marker, 'month', '2020-01', 'payableCents', 10500,
      'sales', '[]'::jsonb, 'consumptionIds', jsonb_build_array(marker), 'reversedSaleIds', '[]'::jsonb)));
  updated_finances := jsonb_set(updated_finances, '{bills}', (updated_finances -> 'bills') ||
    jsonb_build_array(jsonb_build_object('id', marker, 'description', marker, 'amount', 105,
      'dueDate', '2020-02-01', 'boletoCode', '', 'validUntil', '', 'source', 'employee-settlement')));
  updated_roster := coalesce(roster, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('id', marker, 'name', marker, 'active', true, 'commissionPercent', 10));
  updated_inventory := coalesce(inventory, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('id', marker, 'name', marker, 'stock', 4, 'price', 5, 'unit', 'un'));
  updated_movements := coalesce(movements, '[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object('id', marker, 'productId', marker, 'quantity', 1, 'type', 'adjustment'));
  updated_register := coalesce(register_value, '{"activeSessionId":null,"sessions":[],"sales":[],"movements":[]}'::jsonb);
  updated_register := jsonb_set(updated_register, '{sales}', (updated_register -> 'sales') ||
    jsonb_build_array(jsonb_build_object('id', marker, 'origin', 'pdv', 'total', 100, 'employeeId', marker,
      'employeeCommissionPercent', 10, 'establishmentId', ctx.establishment_id, 'createdAt', '2020-01-15T12:00:00Z')));

  begin
    perform public.commit_employee_records(ctx.establishment_id, jsonb_build_array(
      jsonb_build_object('key', 'store-finances:' || ctx.establishment_id, 'exists', finances_exists, 'expected', finances, 'write', true, 'value', updated_finances),
      jsonb_build_object('key', 'employee-roster:' || ctx.establishment_id, 'exists', roster_exists, 'expected', roster, 'write', true, 'value', updated_roster),
      jsonb_build_object('key', 'inventory:' || ctx.establishment_id, 'exists', inventory_exists, 'expected', inventory, 'write', true, 'value', updated_inventory),
      jsonb_build_object('key', 'inventory-movements:' || ctx.establishment_id, 'exists', movements_exists, 'expected', movements, 'write', true, 'value', updated_movements),
      jsonb_build_object('key', 'cash-register:' || ctx.establishment_id, 'exists', register_exists, 'expected', register_value, 'write', true, 'value', updated_register)
    ));
    if (select value from public.tenant_records where storage_key = 'store-finances:' || ctx.establishment_id) is distinct from updated_finances
      or (select value from public.tenant_records where storage_key = 'employee-roster:' || ctx.establishment_id) is distinct from updated_roster
      or (select value from public.tenant_records where storage_key = 'inventory:' || ctx.establishment_id) is distinct from updated_inventory
      or (select value from public.tenant_records where storage_key = 'inventory-movements:' || ctx.establishment_id) is distinct from updated_movements
      or (select value from public.tenant_records where storage_key = 'cash-register:' || ctx.establishment_id) is distinct from updated_register then
      raise exception 'Os registros não foram gravados conforme esperado.';
    end if;
    begin
      perform public.commit_employee_records(ctx.establishment_id, jsonb_build_array(
        jsonb_build_object('key', 'store-finances:' || ctx.establishment_id, 'exists', finances_exists, 'expected', finances, 'write', true, 'value', updated_finances)
      ));
      raise exception 'Uma versão desatualizada foi aceita.';
    exception when serialization_failure then null;
    end;
    did_check := true;
    raise exception 'rollback do teste' using errcode = 'P0002';
  exception when no_data_found then null;
  end;
  if not did_check then raise exception 'Teste interrompido antes da validação.'; end if;
  if (select value from public.tenant_records where storage_key = 'store-finances:' || ctx.establishment_id) is distinct from finances
    or (select value from public.tenant_records where storage_key = 'employee-roster:' || ctx.establishment_id) is distinct from roster
    or (select value from public.tenant_records where storage_key = 'inventory:' || ctx.establishment_id) is distinct from inventory
    or (select value from public.tenant_records where storage_key = 'inventory-movements:' || ctx.establishment_id) is distinct from movements
    or (select value from public.tenant_records where storage_key = 'cash-register:' || ctx.establishment_id) is distinct from register_value then
    raise exception 'O rollback não restaurou todos os registros.';
  end if;
end $$;
rollback;
select 'Teste de funcionários concluído: transação, conflito e rollback confirmados.' as resultado;
