insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('establishment-logos', 'establishment-logos', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "establishment logos are publicly readable" on storage.objects;
create policy "establishment logos are publicly readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'establishment-logos');

drop policy if exists "members can upload establishment logos" on storage.objects;
create policy "members can upload establishment logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'establishment-logos'
    and public.can_access_establishment((storage.foldername(name))[1])
  );

drop policy if exists "members can update establishment logos" on storage.objects;
create policy "members can update establishment logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'establishment-logos'
    and public.can_access_establishment((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'establishment-logos'
    and public.can_access_establishment((storage.foldername(name))[1])
  );

drop policy if exists "members can delete establishment logos" on storage.objects;
create policy "members can delete establishment logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'establishment-logos'
    and public.can_access_establishment((storage.foldername(name))[1])
  );