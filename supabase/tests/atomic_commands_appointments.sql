-- Execute after 20261112020000_atomic_employee_records.sql in the Supabase SQL Editor.
-- All test changes are rolled back; choose an existing store with a sales user.
begin;

create temporary table atomic_test_context as
select m.user_id, m.establishment_id
from public.establishment_memberships m
where m.permissions && array['*', 'pdv-sales']::text[]
limit 1;
grant select on atomic_test_context to authenticated;

set local role authenticated;
do $$
declare
  target_user uuid;
  target_store text;
  cash_value jsonb;
  command_value jsonb;
  appointment_value jsonb;
  cash_exists boolean;
  command_exists boolean;
  appointment_exists boolean;
  updated_cash jsonb;
  updated_commands jsonb;
  updated_appointments jsonb;
  write_checked boolean := false;
  marker text := 'atomic-test-' || gen_random_uuid()::text;
begin
  select user_id, establishment_id into target_user, target_store from atomic_test_context;
  if target_user is null then
    raise exception 'Nenhuma loja com usuário autorizado para vendas foi encontrada.';
  end if;
  perform set_config('request.jwt.claim.sub', target_user::text, true);

  select value into cash_value from public.tenant_records where storage_key = 'cash-register:' || target_store;
  cash_exists := found;
  select value into command_value from public.tenant_records where storage_key = 'commands:' || target_store;
  command_exists := found;
  select value into appointment_value from public.tenant_records where storage_key = 'appointments:' || target_store;
  appointment_exists := found;

  if (cash_exists and (jsonb_typeof(cash_value) <> 'object' or jsonb_typeof(cash_value -> 'sales') is distinct from 'array'))
    or (command_exists and jsonb_typeof(command_value) <> 'array')
    or (appointment_exists and jsonb_typeof(appointment_value) <> 'array') then
    raise exception 'Formato inesperado nos dados da loja de teste.';
  end if;

  updated_cash := jsonb_set(
    coalesce(cash_value, '{"sales":[],"sessions":[],"movements":[]}'::jsonb),
    '{sales}',
    coalesce(cash_value -> 'sales', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', marker, 'origin', 'comanda', 'status', 'completed', 'total', 1, 'items', '[]'::jsonb
    ))
  );
  updated_commands := coalesce(command_value, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', marker, 'status', 'paid'));
  updated_appointments := coalesce(appointment_value, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', marker, 'status', 'completed', 'paymentStatus', 'paid'));

  begin
    perform public.commit_employee_records(target_store, jsonb_build_array(
      jsonb_build_object('key', 'cash-register:' || target_store, 'exists', cash_exists, 'expected', cash_value, 'write', true, 'value', updated_cash),
      jsonb_build_object('key', 'commands:' || target_store, 'exists', command_exists, 'expected', command_value, 'write', true, 'value', updated_commands),
      jsonb_build_object('key', 'appointments:' || target_store, 'exists', appointment_exists, 'expected', appointment_value, 'write', true, 'value', updated_appointments)
    ));
    if (select value from public.tenant_records where storage_key = 'cash-register:' || target_store) is distinct from updated_cash
      or (select value from public.tenant_records where storage_key = 'commands:' || target_store) is distinct from updated_commands
      or (select value from public.tenant_records where storage_key = 'appointments:' || target_store) is distinct from updated_appointments then
      raise exception 'Os registros não foram gravados conforme esperado.';
    end if;
    write_checked := true;
    raise exception 'rollback de teste' using errcode = 'P0002';
  exception when no_data_found then
    null;
  end;

  if not write_checked then
    raise exception 'A gravação de teste foi interrompida antes da verificação.';
  end if;
  if (select value from public.tenant_records where storage_key = 'cash-register:' || target_store) is distinct from cash_value
    or (select value from public.tenant_records where storage_key = 'commands:' || target_store) is distinct from command_value
    or (select value from public.tenant_records where storage_key = 'appointments:' || target_store) is distinct from appointment_value then
    raise exception 'O rollback de teste não restaurou os registros.';
  end if;

  begin
    perform public.commit_employee_records(target_store, jsonb_build_array(
      jsonb_build_object('key', 'commands:' || target_store, 'exists', not command_exists, 'expected', command_value, 'write', true, 'value', updated_commands)
    ));
    raise exception 'Uma versão desatualizada foi aceita.';
  exception when serialization_failure then
    null;
  end;

  raise notice 'Teste concluído: gravação conjunta, rollback e conflito confirmados.';
end $$;

rollback;
select 'Teste concluído: gravação conjunta, rollback e conflito confirmados.' as resultado;
