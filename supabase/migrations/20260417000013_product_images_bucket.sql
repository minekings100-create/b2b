-- 20260417000013_product_images_bucket.sql
-- Phase 2.2+ addition — Supabase Storage bucket for product images.
-- Private bucket; admin writes; any authenticated user can read (signed URLs
-- are still generated server-side before hitting the client).

insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', false)
  on conflict (id) do nothing;

-- Read: every authenticated user can read images.
create policy "product-images read authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-images');

-- Write: admin only (super_admin / administration).
create policy "product-images insert admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
    )
  );

create policy "product-images update admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
    )
  )
  with check (
    bucket_id = 'product-images'
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
    )
  );

create policy "product-images delete admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('administration')
    )
  );
