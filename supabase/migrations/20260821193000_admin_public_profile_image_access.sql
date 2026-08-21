-- Allow a trusted Tipulinks admin to manage the profile image of an
-- unclaimed profile created from public information. Ownership is still not
-- granted: access is scoped to admin_public_info profiles with no owner.

DROP POLICY IF EXISTS "Admin can upload unclaimed public-profile image" ON storage.objects;
CREATE POLICY "Admin can upload unclaimed public-profile image"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'therapist-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'tipulinks_role') = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.profile_origin = 'admin_public_info'
      AND t.owner_account_id IS NULL
      AND t.do_not_republish = false
  )
);

DROP POLICY IF EXISTS "Admin can update unclaimed public-profile image" ON storage.objects;
CREATE POLICY "Admin can update unclaimed public-profile image"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'therapist-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'tipulinks_role') = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.profile_origin = 'admin_public_info'
      AND t.owner_account_id IS NULL
      AND t.do_not_republish = false
  )
)
WITH CHECK (
  bucket_id = 'therapist-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'tipulinks_role') = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.profile_origin = 'admin_public_info'
      AND t.owner_account_id IS NULL
      AND t.do_not_republish = false
  )
);

DROP POLICY IF EXISTS "Admin can delete unclaimed public-profile image" ON storage.objects;
CREATE POLICY "Admin can delete unclaimed public-profile image"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'therapist-images'
  AND (auth.jwt() -> 'app_metadata' ->> 'tipulinks_role') = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.profile_origin = 'admin_public_info'
      AND t.owner_account_id IS NULL
      AND t.do_not_republish = false
  )
);
