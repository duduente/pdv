create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text not null default '',
  role text not null default 'merchant' check (role in ('super_admin', 'merchant')),
  created_at timestamptz not null default now()
);

create table if not exists public.establishments (
  id text primary key,
  slug text not null unique,
  name text not null,
  owner text not null default '',
  email text not null default '',
  plan text not null default '',
  monthly_revenue numeric(12, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  modules jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  whatsapp text not null default '',
  template text,
  created_at timestamptz not null default now()
);

create table if not exists public.establishment_memberships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  establishment_id text not null references public.establishments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, establishment_id)
);

create table if not exists public.tenant_records (
  storage_key text primary key,
  tenant_id text references public.establishments (id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists establishment_memberships_tenant_idx
  on public.establishment_memberships (establishment_id, user_id);
create index if not exists tenant_records_tenant_idx
  on public.tenant_records (tenant_id);

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'super_admin'
  );
$$;

create or replace function public.can_access_establishment(target_establishment_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.establishment_memberships
    where user_id = (select auth.uid())
      and establishment_id = target_establishment_id
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.guard_member_establishment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() and (
    new.id is distinct from old.id
    or new.slug is distinct from old.slug
    or new.plan is distinct from old.plan
    or new.monthly_revenue is distinct from old.monthly_revenue
    or new.status is distinct from old.status
    or new.modules is distinct from old.modules
    or new.template is distinct from old.template
  ) then
    raise exception 'Only a Super Admin can change store modules, plan, or status.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_member_establishment_update on public.establishments;
create trigger guard_member_establishment_update
  before update on public.establishments
  for each row execute procedure public.guard_member_establishment_update();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.establishment_memberships enable row level security;
alter table public.tenant_records enable row level security;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_super_admin());

drop policy if exists "profiles_admin_manage" on public.profiles;
create policy "profiles_admin_manage" on public.profiles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "establishments_read_authorized" on public.establishments;
create policy "establishments_read_authorized" on public.establishments
  for select to authenticated
  using (public.can_access_establishment(id));

drop policy if exists "establishments_admin_insert_delete" on public.establishments;
create policy "establishments_admin_insert_delete" on public.establishments
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "establishments_authorized_update" on public.establishments;
create policy "establishments_authorized_update" on public.establishments
  for update to authenticated
  using (public.can_access_establishment(id))
  with check (public.can_access_establishment(id));

drop policy if exists "establishments_admin_delete" on public.establishments;
create policy "establishments_admin_delete" on public.establishments
  for delete to authenticated
  using (public.is_super_admin());

drop policy if exists "memberships_read_self_or_admin" on public.establishment_memberships;
create policy "memberships_read_self_or_admin" on public.establishment_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_super_admin());

drop policy if exists "memberships_admin_manage" on public.establishment_memberships;
create policy "memberships_admin_manage" on public.establishment_memberships
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "tenant_records_read_authorized" on public.tenant_records;
create policy "tenant_records_read_authorized" on public.tenant_records
  for select to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_establishment(tenant_id))
  );

drop policy if exists "tenant_records_insert_authorized" on public.tenant_records;
create policy "tenant_records_insert_authorized" on public.tenant_records
  for insert to authenticated
  with check (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_establishment(tenant_id))
  );

drop policy if exists "tenant_records_update_authorized" on public.tenant_records;
create policy "tenant_records_update_authorized" on public.tenant_records
  for update to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_establishment(tenant_id))
  )
  with check (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_establishment(tenant_id))
  );

drop policy if exists "tenant_records_delete_authorized" on public.tenant_records;
create policy "tenant_records_delete_authorized" on public.tenant_records
  for delete to authenticated
  using (
    (tenant_id is null and public.is_super_admin())
    or (tenant_id is not null and public.can_access_establishment(tenant_id))
  );