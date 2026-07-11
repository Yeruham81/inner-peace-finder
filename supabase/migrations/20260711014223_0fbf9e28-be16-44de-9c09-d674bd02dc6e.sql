
-- RLS policies for therapist-images storage bucket.
-- Path convention: <therapist_id>/<filename>. Owner is the therapist who owns
-- the therapists row whose id equals the first path segment.

CREATE POLICY "Therapist images are readable by anyone (anon)"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'therapist-images');

CREATE POLICY "Owner can upload therapist image"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'therapist-images'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE a.auth_user_id = auth.uid()
      AND t.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Owner can update therapist image"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'therapist-images'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE a.auth_user_id = auth.uid()
      AND t.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Owner can delete therapist image"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'therapist-images'
  AND EXISTS (
    SELECT 1
    FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE a.auth_user_id = auth.uid()
      AND t.id::text = (storage.foldername(name))[1]
  )
);
