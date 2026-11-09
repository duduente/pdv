create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  establishment_id text not null references public.establishments (id) on delete cascade,
  establishment_name text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_name text not null,
  human_requested_at timestamptz,
  admin_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  sender_kind text not null check (sender_kind in ('merchant', 'ai', 'admin', 'system')),
  sender_id uuid references public.profiles (id) on delete set null,
  sender_name text not null,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_establishment_updated_idx
  on public.support_conversations (establishment_id, updated_at desc);
create index if not exists support_conversations_user_idx
  on public.support_conversations (user_id, establishment_id);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at);

create or replace function public.guard_support_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if not public.is_super_admin() and (
    new.id is distinct from old.id
    or new.establishment_id is distinct from old.establishment_id
    or new.establishment_name is distinct from old.establishment_name
    or new.user_id is distinct from old.user_id
    or new.user_name is distinct from old.user_name
    or new.admin_seen_at is distinct from old.admin_seen_at
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
    or old.human_requested_at is not null
    or new.human_requested_at is null
  ) then
    raise exception 'Only a Super Admin can change support conversation details.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_support_conversation_update on public.support_conversations;
create trigger guard_support_conversation_update
  before update on public.support_conversations
  for each row execute procedure public.guard_support_conversation_update();

create or replace function public.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_support_conversation on public.support_messages;
create trigger touch_support_conversation
  after insert on public.support_messages
  for each row execute procedure public.touch_support_conversation();

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "support_conversations_read" on public.support_conversations;
create policy "support_conversations_read" on public.support_conversations
  for select to authenticated
  using (
    public.is_super_admin()
    or (
      user_id = (select auth.uid())
      and public.can_access_establishment(establishment_id)
    )
  );

drop policy if exists "support_conversations_create" on public.support_conversations;
create policy "support_conversations_create" on public.support_conversations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_access_establishment(establishment_id)
    and human_requested_at is null
    and admin_seen_at is null
  );

drop policy if exists "support_conversations_update" on public.support_conversations;
create policy "support_conversations_update" on public.support_conversations
  for update to authenticated
  using (
    public.is_super_admin()
    or (
      user_id = (select auth.uid())
      and public.can_access_establishment(establishment_id)
    )
  )
  with check (
    public.is_super_admin()
    or (
      user_id = (select auth.uid())
      and public.can_access_establishment(establishment_id)
      and human_requested_at is not null
    )
  );

drop policy if exists "support_messages_read" on public.support_messages;
create policy "support_messages_read" on public.support_messages
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.support_conversations as conversations
      where conversations.id = conversation_id
        and conversations.user_id = (select auth.uid())
        and public.can_access_establishment(conversations.establishment_id)
    )
  );

drop policy if exists "support_messages_create" on public.support_messages;
create policy "support_messages_create" on public.support_messages
  for insert to authenticated
  with check (
    (
      sender_kind = 'admin'
      and sender_id = (select auth.uid())
      and public.is_super_admin()
    )
    or (
      sender_kind in ('merchant', 'ai', 'system')
      and sender_id = (select auth.uid())
      and exists (
        select 1 from public.support_conversations as conversations
        where conversations.id = conversation_id
          and conversations.user_id = (select auth.uid())
          and public.can_access_establishment(conversations.establishment_id)
      )
    )
  );

grant select, insert, update on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;
