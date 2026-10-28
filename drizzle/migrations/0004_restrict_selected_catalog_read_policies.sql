ALTER POLICY "Categories are public read" ON public.categories
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.category_id = categories.id AND p.status = 'published'
));

ALTER POLICY "Public can read product images" ON storage.objects
USING (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM public.product_images pi
    JOIN public.products p ON p.id = pi.product_id
    WHERE p.status = 'published'
      AND right(split_part(pi.url, '?', 1), length('/product-images/' || storage.objects.name)) = '/product-images/' || storage.objects.name
  )
);

ALTER POLICY "Authenticated can read product images" ON storage.objects
USING (
  bucket_id = 'product-images'
  AND (
    owner_id = (SELECT auth.uid()::text)
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
);