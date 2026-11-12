-- Run after 20261112030000 in the Supabase SQL Editor. All changes are rolled back.
-- Requires an existing store with an appointment-enabled member.
begin;

create temporary table staff_test_context as
select m.user_id, m.establishment_id, 'Teste integração ' || gen_random_uuid()::text as staff_name
from public.establishment_memberships m
join public.establishments e on e.id = m.establishment_id
where m.permissions && array['*', 'agendamento']::text[]
  and e.modules ->> 'agendamento' = 'true'
limit 1;
grant select on staff_test_context to authenticated;

do $$
begin
  if not exists (select 1 from staff_test_context) then
    raise exception 'É necessária uma loja com agendamento e usuário autorizado.';
  end if;
end $$;

set local role authenticated;
do $$
declare ctx record; projected jsonb;
begin
  select * into ctx from staff_test_context;
  perform set_config('request.jwt.claim.sub', ctx.user_id::text, true);
  if not public.has_store_permission(ctx.establishment_id, 'finance')
    and exists (select 1 from public.tenant_records where storage_key = 'store-finances:' || ctx.establishment_id) then
    raise exception 'Agendamento não pode ler os dados financeiros.';
  end if;
  projected := public.create_appointment_professional(ctx.establishment_id, ctx.staff_name, 'Teste');
  if not exists (select 1 from jsonb_array_elements(projected) p where p ->> 'name' = ctx.staff_name)
    or exists (select 1 from jsonb_array_elements(projected) p
      where p ? 'salaryCents' or p ? 'commissionPercent' or p ? 'consumptionDiscountPercent') then
    raise exception 'Lista de profissionais inválida ou contém dados financeiros.';
  end if;
  begin
    update public.tenant_records set value = '[]'::jsonb
      where storage_key = 'professionals:' || ctx.establishment_id;
    raise exception 'Alteração direta de profissionais deveria ser recusada.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare ctx record;
begin
  select * into ctx from staff_test_context;
  if not exists (
    select 1 from public.tenant_records t, jsonb_array_elements(t.value #> '{employees,employees}') e
    where t.storage_key = 'store-finances:' || ctx.establishment_id
      and e ->> 'name' = ctx.staff_name and (e ->> 'salaryCents')::integer = 0
      and (e ->> 'commissionPercent')::numeric = 0 and (e ->> 'consumptionDiscountPercent')::numeric = 0
  ) then
    raise exception 'Profissional não foi criado como funcionário.';
  end if;
end $$;

rollback;
