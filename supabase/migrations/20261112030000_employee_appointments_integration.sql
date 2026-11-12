-- Coordinate this migration with the matching application release.
-- Professional names are a non-financial projection of employee records.
create or replace function public.guard_atomic_employee_records()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
    and not exists (select 1 from public.establishments where id = old.tenant_id) then
    return old;
  end if;
  if (case when tg_op = 'DELETE' then public.is_atomic_employee_record(old.storage_key)
      when tg_op = 'UPDATE' then public.is_atomic_employee_record(old.storage_key) or public.is_atomic_employee_record(new.storage_key)
      else public.is_atomic_employee_record(new.storage_key) end)
    and current_setting('app.atomic_employee_write', true) is distinct from '1' then
    raise exception 'Atualize o aplicativo antes de alterar estes dados.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_appointment_professionals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  projection jsonb;
begin
  if new.tenant_id is null or new.storage_key <> 'store-finances:' || new.tenant_id
    or not (new.value ? 'employees') then
    return new;
  end if;
  if jsonb_typeof(new.value #> '{employees,employees}') is distinct from 'array' then
    raise exception 'Cadastro de funcionários inválido.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', employee ->> 'id',
    'name', employee ->> 'name',
    'role', coalesce(nullif(employee ->> 'role', ''), 'Profissional')
  ) order by ordinality), '[]'::jsonb)
  into projection
  from jsonb_array_elements(new.value #> '{employees,employees}') with ordinality as e(employee, ordinality)
  where coalesce((employee ->> 'active')::boolean, false);

  perform set_config('app.staff_projection_write', '1', true);
  insert into public.tenant_records(storage_key, tenant_id, value, updated_at)
  values ('professionals:' || new.tenant_id, new.tenant_id, projection, now())
  on conflict (storage_key) do update set value = excluded.value, updated_at = now()
  where public.tenant_records.tenant_id = excluded.tenant_id;
  if not found then
    raise exception 'Registro de profissionais pertence a outra loja.' using errcode = '23505';
  end if;
  perform set_config('app.staff_projection_write', '0', true);
  return new;
end;
$$;

revoke all on function public.sync_appointment_professionals() from public, anon, authenticated;

create or replace function public.guard_appointment_professionals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1
    and not exists (select 1 from public.establishments where id = old.tenant_id) then
    return old;
  end if;
  if (case when tg_op = 'DELETE' then old.storage_key like 'professionals:%'
    when tg_op = 'UPDATE' then old.storage_key like 'professionals:%' or new.storage_key like 'professionals:%'
    else new.storage_key like 'professionals:%' end)
    and current_setting('app.staff_projection_write', true) is distinct from '1' then
    raise exception 'Atualize o aplicativo para gerenciar profissionais.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_appointment_professionals() from public, anon, authenticated;

drop trigger if exists guard_appointment_professionals on public.tenant_records;
create trigger guard_appointment_professionals
  before insert or update or delete on public.tenant_records
  for each row execute function public.guard_appointment_professionals();

drop trigger if exists sync_appointment_professionals on public.tenant_records;
create trigger sync_appointment_professionals
  after insert or update of value on public.tenant_records
  for each row execute function public.sync_appointment_professionals();

-- Only callers of the controlled RPC and membership trigger may use this helper.
create or replace function public.add_staff_member(
  target_tenant text, staff_name text, staff_role text, linked_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  finances jsonb;
  roster jsonb;
  employees jsonb;
  staff jsonb;
  matches integer;
  prior_setting text;
begin
  if target_tenant is null or btrim(coalesce(staff_name, '')) = '' then
    raise exception 'Nome do funcionário obrigatório.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('employee-roster:' || target_tenant, 0));
  perform pg_advisory_xact_lock(hashtextextended('store-finances:' || target_tenant, 0));
  select value into finances from public.tenant_records
    where storage_key = 'store-finances:' || target_tenant and tenant_id = target_tenant;
  finances := coalesce(finances, '{"recurring":{"enabled":false,"dueDay":10,"amount":0},"bills":[]}'::jsonb);
  if not (finances ? 'employees') then
    finances := jsonb_set(finances, '{employees}', '{"employees":[],"consumptions":[],"settlements":[]}'::jsonb);
  end if;
  employees := finances #> '{employees,employees}';
  if jsonb_typeof(employees) is distinct from 'array' then
    raise exception 'Cadastro de funcionários inválido.' using errcode = '22023';
  end if;
  select value into roster from public.tenant_records
    where storage_key = 'employee-roster:' || target_tenant and tenant_id = target_tenant;
  roster := coalesce(roster, '[]'::jsonb);
  if jsonb_typeof(roster) is distinct from 'array' then
    raise exception 'Lista de funcionários inválida.' using errcode = '22023';
  end if;

  if linked_user is not null then
    select employee into staff from jsonb_array_elements(employees) employee
      where employee ->> 'userId' = linked_user::text limit 1;
    if staff is not null then return staff; end if;
    select count(*) into matches
      from public.establishment_memberships m join public.profiles p on p.id = m.user_id
      where m.establishment_id = target_tenant and not m.permissions @> array['*']::text[]
        and p.role = 'merchant'
        and lower(btrim(coalesce(nullif(btrim(p.display_name), ''), p.username))) = lower(btrim(staff_name));
    if matches = 1 then
      select count(*) into matches from jsonb_array_elements(employees) employee
        where lower(btrim(employee ->> 'name')) = lower(btrim(staff_name));
    end if;
    if matches = 1 then
      select employee into staff from jsonb_array_elements(employees) employee
        where lower(btrim(employee ->> 'name')) = lower(btrim(staff_name))
          and coalesce(employee ->> 'userId', '') = '';
    end if;
  end if;
  if staff is null then
    staff := jsonb_build_object(
      'id', gen_random_uuid()::text, 'name', btrim(staff_name),
      'role', coalesce(nullif(btrim(staff_role), ''), 'Profissional'),
      'salaryCents', 0, 'commissionPercent', 0, 'consumptionDiscountPercent', 0, 'active', true
    );
    if linked_user is not null then staff := staff || jsonb_build_object('userId', linked_user::text); end if;
    employees := employees || jsonb_build_array(staff);
    roster := roster || jsonb_build_array(jsonb_build_object(
      'id', staff ->> 'id', 'name', staff ->> 'name', 'commissionPercent', 0, 'active', true
    ));
  else
    staff := staff || jsonb_build_object('userId', linked_user::text);
    select jsonb_agg(case when employee ->> 'id' = staff ->> 'id' then staff else employee end order by ordinality)
      into employees from jsonb_array_elements(employees) with ordinality e(employee, ordinality);
  end if;
  finances := jsonb_set(finances, '{employees,employees}', employees);
  prior_setting := current_setting('app.atomic_employee_write', true);
  perform set_config('app.atomic_employee_write', '1', true);
  insert into public.tenant_records(storage_key, tenant_id, value, updated_at)
    values ('store-finances:' || target_tenant, target_tenant, finances, now())
    on conflict (storage_key) do update set value = excluded.value, updated_at = now()
      where public.tenant_records.tenant_id = excluded.tenant_id;
  if not found then raise exception 'Registro financeiro pertence a outra loja.' using errcode = '23505'; end if;
  insert into public.tenant_records(storage_key, tenant_id, value, updated_at)
    values ('employee-roster:' || target_tenant, target_tenant, roster, now())
    on conflict (storage_key) do update set value = excluded.value, updated_at = now()
      where public.tenant_records.tenant_id = excluded.tenant_id;
  if not found then raise exception 'Lista de funcionários pertence a outra loja.' using errcode = '23505'; end if;
  perform set_config('app.atomic_employee_write', coalesce(prior_setting, '0'), true);
  return staff;
end;
$$;
revoke all on function public.add_staff_member(text, text, text, uuid) from public, anon, authenticated;

create or replace function public.create_appointment_professional(target_tenant text, staff_name text, staff_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_store_permission(target_tenant, 'agendamento')
    or not exists (select 1 from public.establishments where id = target_tenant and modules ->> 'agendamento' = 'true') then
    raise exception 'Você não tem permissão para cadastrar profissionais nesta loja.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(staff_name, ''))) not between 1 and 150
    or length(coalesce(staff_role, '')) > 150 then
    raise exception 'Nome ou cargo inválido.' using errcode = '22023';
  end if;
  perform public.add_staff_member(target_tenant, staff_name, staff_role, null);
  return (select value from public.tenant_records
    where storage_key = 'professionals:' || target_tenant and tenant_id = target_tenant);
end;
$$;
revoke all on function public.create_appointment_professional(text, text, text) from public, anon;
grant execute on function public.create_appointment_professional(text, text, text) to authenticated;

create or replace function public.create_employee_for_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_name text;
begin
  if new.permissions @> array['*']::text[] then return new; end if;
  select coalesce(nullif(btrim(display_name), ''), username) into member_name
    from public.profiles where id = new.user_id and role = 'merchant';
  if member_name is not null then
    perform public.add_staff_member(new.establishment_id, member_name, 'Profissional', new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.create_employee_for_membership() from public, anon, authenticated;
drop trigger if exists create_employee_for_membership on public.establishment_memberships;
create trigger create_employee_for_membership after insert on public.establishment_memberships
  for each row execute function public.create_employee_for_membership();

-- Backfill is deliberately conservative: only unique matching names are linked.
do $$
declare
  store_row record;
  pro record;
  member record;
  existing jsonb;
  staff jsonb;
  employees jsonb;
  finances jsonb;
  roster jsonb;
  matches integer;
begin
  for store_row in select id from public.establishments order by id loop
    perform pg_advisory_xact_lock(hashtextextended('employee-roster:' || store_row.id, 0));
    perform pg_advisory_xact_lock(hashtextextended('store-finances:' || store_row.id, 0));
    select value into existing from public.tenant_records
      where storage_key = 'professionals:' || store_row.id and tenant_id = store_row.id;
    existing := coalesce(existing, '[]'::jsonb);
    if jsonb_typeof(existing) is distinct from 'array' then
      raise exception 'Lista de profissionais inválida na loja %.', store_row.id;
    end if;
    select value into finances from public.tenant_records
      where storage_key = 'store-finances:' || store_row.id and tenant_id = store_row.id;
    finances := coalesce(finances, '{"recurring":{"enabled":false,"dueDay":10,"amount":0},"bills":[]}'::jsonb);
    if not (finances ? 'employees') then
      finances := jsonb_set(finances, '{employees}', '{"employees":[],"consumptions":[],"settlements":[]}'::jsonb);
    end if;
    employees := finances #> '{employees,employees}';
    if jsonb_typeof(employees) is distinct from 'array' then raise exception 'Funcionários inválidos na loja %.', store_row.id; end if;
    select value into roster from public.tenant_records
      where storage_key = 'employee-roster:' || store_row.id and tenant_id = store_row.id;
    roster := coalesce(roster, '[]'::jsonb);
    if jsonb_typeof(roster) is distinct from 'array' then raise exception 'Lista inválida na loja %.', store_row.id; end if;
    for pro in select value as item from jsonb_array_elements(roster) loop
      if coalesce(pro.item ->> 'id', '') = '' or btrim(coalesce(pro.item ->> 'name', '')) = '' then
        raise exception 'Funcionário sem identificação na loja %.', store_row.id;
      end if;
      if not exists (select 1 from jsonb_array_elements(employees) e where e ->> 'id' = pro.item ->> 'id') then
        employees := employees || jsonb_build_array(jsonb_build_object(
          'id', pro.item ->> 'id', 'name', pro.item ->> 'name',
          'salaryCents', 0, 'commissionPercent', coalesce(pro.item -> 'commissionPercent', '0'::jsonb),
          'consumptionDiscountPercent', 0, 'active', coalesce(pro.item -> 'active', 'true'::jsonb)
        ));
      end if;
    end loop;

    for pro in select value as item from jsonb_array_elements(existing) loop
      if btrim(coalesce(pro.item ->> 'name', '')) = '' then raise exception 'Profissional sem nome na loja %.', store_row.id; end if;
      select item into staff from jsonb_array_elements(employees) item
        where item ->> 'id' = pro.item ->> 'id' limit 1;
      if staff is not null then
        continue;
      end if;
      select count(*) into matches from jsonb_array_elements(existing) item
        where lower(btrim(item ->> 'name')) = lower(btrim(pro.item ->> 'name'));
      if matches = 1 then
        select count(*) into matches from jsonb_array_elements(employees) item
          where lower(btrim(item ->> 'name')) = lower(btrim(pro.item ->> 'name'));
      end if;
      if matches = 1 then
        select item into staff from jsonb_array_elements(employees) item
          where lower(btrim(item ->> 'name')) = lower(btrim(pro.item ->> 'name'));
        if not (staff ? 'role') then
          staff := staff || jsonb_build_object('role', coalesce(nullif(pro.item ->> 'role', ''), 'Profissional'));
          select jsonb_agg(case when item ->> 'id' = staff ->> 'id' then staff else item end order by ordinality)
            into employees from jsonb_array_elements(employees) with ordinality e(item, ordinality);
        end if;
      else
        staff := jsonb_build_object(
          'id', gen_random_uuid()::text, 'name', btrim(pro.item ->> 'name'),
          'role', coalesce(nullif(pro.item ->> 'role', ''), 'Profissional'),
          'salaryCents', 0, 'commissionPercent', 0, 'consumptionDiscountPercent', 0, 'active', true
        );
        employees := employees || jsonb_build_array(staff);
        roster := roster || jsonb_build_array(jsonb_build_object(
          'id', staff ->> 'id', 'name', staff ->> 'name', 'commissionPercent', 0, 'active', true
        ));
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', item ->> 'id', 'name', item ->> 'name',
      'commissionPercent', item -> 'commissionPercent', 'active', item -> 'active'
    ) order by ordinality), '[]'::jsonb)
      into roster from jsonb_array_elements(employees) with ordinality e(item, ordinality);
    finances := jsonb_set(finances, '{employees,employees}', employees);
    perform set_config('app.atomic_employee_write', '1', true);
    insert into public.tenant_records(storage_key, tenant_id, value, updated_at)
      values ('store-finances:' || store_row.id, store_row.id, finances, now())
      on conflict (storage_key) do update set value = excluded.value, updated_at = now()
        where public.tenant_records.tenant_id = excluded.tenant_id;
    if not found then raise exception 'Registro financeiro pertence a outra loja.'; end if;
    insert into public.tenant_records(storage_key, tenant_id, value, updated_at)
      values ('employee-roster:' || store_row.id, store_row.id, roster, now())
      on conflict (storage_key) do update set value = excluded.value, updated_at = now()
        where public.tenant_records.tenant_id = excluded.tenant_id;
    if not found then raise exception 'Lista de funcionários pertence a outra loja.'; end if;
    perform set_config('app.atomic_employee_write', '0', true);

    for member in
      select m.user_id, coalesce(nullif(btrim(p.display_name), ''), p.username) as member_name
      from public.establishment_memberships m join public.profiles p on p.id = m.user_id
      where m.establishment_id = store_row.id and p.role = 'merchant'
        and not m.permissions @> array['*']::text[]
    loop
      if coalesce(member.member_name, '') = '' then raise exception 'Subusuário sem nome na loja %.', store_row.id; end if;
      perform public.add_staff_member(store_row.id, member.member_name, 'Profissional', member.user_id);
    end loop;
  end loop;
end;
$$;

alter table public.establishments disable trigger guard_member_establishment_update;
update public.establishments
set modules = modules || '{"finance":true,"employees":true}'::jsonb
where modules ->> 'finance' is distinct from 'true' or modules ->> 'employees' is distinct from 'true';
alter table public.establishments enable trigger guard_member_establishment_update;
