create policy "Public can read product images"
    on storage.objects
    for select
    to anon
    using (bucket_id = 'product-images');

create policy "Authenticated can read product images"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'product-images');

create policy "Brands can upload product images"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'product-images'
        and (public.has_role(auth.uid(), 'brand'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
    );

create policy "Brands can update product images"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'product-images'
        and (public.has_role(auth.uid(), 'brand'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
    )
    with check (
        bucket_id = 'product-images'
        and (public.has_role(auth.uid(), 'brand'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
    );

create policy "Brands can delete product images"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'product-images'
        and (public.has_role(auth.uid(), 'brand'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
    );

create policy "Users can read own try-on photos"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'try-on-photos'
        and storage.filename(name) like auth.uid() || '/%'
    );

create policy "Users can upload own try-on photos"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'try-on-photos'
        and storage.filename(name) like auth.uid() || '/%'
    );

create policy "Users can update own try-on photos"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'try-on-photos'
        and storage.filename(name) like auth.uid() || '/%'
    )
    with check (
        bucket_id = 'try-on-photos'
        and storage.filename(name) like auth.uid() || '/%'
    );

create policy "Users can delete own try-on photos"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'try-on-photos'
        and storage.filename(name) like auth.uid() || '/%'
    );
