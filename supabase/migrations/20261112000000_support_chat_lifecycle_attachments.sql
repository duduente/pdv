alter table public.support_conversations
  add column if not exists admin_joined_at timestamptz,
  add column if not exists admin_typing_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.support_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text;

alter table public.support_messages
  drop constraint if exists support_messages_attachment_metadata_check;
alter table public.support_messages
  add constraint support_messages_attachment_metadata_check check (
    (attachment_path is null and attachment_name is null and attachment_mime_type is null)
    or (
      attachment_path is not null
      and attachment_name is not null
      and attachment_mime_type is not null
      and attachment_mime_type in ('application/pdf', 'image/jpeg')
    )
  );

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
    or new.admin_joined_at is distinct from old.admin_joined_at
    or new.admin_typing_at is distinct from old.admin_typing_at
    or new.created_at is distinct from old.created_at
    or new.updated_at is distinct from old.updated_at
    or (
      new.human_requested_at is distinct from old.human_requested_at
      and (old.human_requested_at is not null or new.human_requested_at is null)
    )
    or (
      new.closed_at is distinct from old.closed_at
      and (
        new.closed_at is null
        or new.closed_at > now()
        or old.closed_at is not null
        or old.human_requested_at is null
        or old.updated_at > now() - interval '10 minutes'
      )
    )
  ) then
    raise exception 'Only a Super Admin can change support conversation details.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set updated_at = new.created_at,
      admin_typing_at = null
  where id = new.conversation_id;
  return new;
end;
$$;

drop policy if exists "support_messages_create" on public.support_messages;
create policy "support_messages_create" on public.support_messages
  for insert to authenticated
  with check (
    (attachment_path is null or attachment_path like conversation_id::text || '/%')
    and (
      (
        sender_kind = 'admin'
        and sender_id = (select auth.uid())
        and public.is_super_admin()
        and exists (
          select 1 from public.support_conversations as conversations
          where conversations.id = conversation_id
            and conversations.closed_at is null
            and (
              conversations.human_requested_at is null
              or conversations.updated_at > now() - interval '10 minutes'
            )
        )
      )
      or (
        sender_kind in ('merchant', 'ai', 'system')
        and sender_id = (select auth.uid())
        and exists (
          select 1 from public.support_conversations as conversations
          where conversations.id = conversation_id
            and conversations.user_id = (select auth.uid())
            and conversations.closed_at is null
            and (
              conversations.human_requested_at is null
              or conversations.updated_at > now() - interval '10 minutes'
            )
            and public.can_access_establishment(conversations.establishment_id)
        )
      )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880, array['application/pdf', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "support attachments are readable by conversation participants" on storage.objects;
create policy "support attachments are readable by conversation participants" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and exists (
      select 1 from public.support_conversations as conversations
      where conversations.id::text = (storage.foldername(name))[1]
        and (
          public.is_super_admin()
          or (
            conversations.user_id = (select auth.uid())
            and public.can_access_establishment(conversations.establishment_id)
          )
        )
    )
  );

drop policy if exists "conversation participants can upload support attachments" on storage.objects;
create policy "conversation participants can upload support attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and exists (
      select 1 from public.support_conversations as conversations
      where conversations.id::text = (storage.foldername(name))[1]
        and conversations.closed_at is null
        and (
          conversations.human_requested_at is null
          or conversations.updated_at > now() - interval '10 minutes'
        )
        and (
          public.is_super_admin()
          or (
            conversations.user_id = (select auth.uid())
            and public.can_access_establishment(conversations.establishment_id)
          )
        )
    )
  );
