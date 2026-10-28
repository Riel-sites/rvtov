-- try-on-photos: replace broken filename()-based policies with foldername()-based ones
drop policy if exists "Users can read own try-on photos" on storage.objects;
drop policy if exists "Users can upload own try-on photos" on storage.objects;
drop policy if exists "Users can update own try-on photos" on storage.objects;
drop policy if exists "Users can delete own try-on photos" on storage.objects;

create policy "Users can read own try-on photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'try-on-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own try-on photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'try-on-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update own try-on photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'try-on-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'try-on-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own try-on photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'try-on-photos' and (storage.foldername(name))[1] = auth.uid()::text);
