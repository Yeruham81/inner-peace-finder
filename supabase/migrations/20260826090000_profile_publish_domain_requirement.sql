begin;

-- A profile marked as published must carry at least one canonical treatment
-- domain. Rows that could not actually appear by treatment domain are moved
-- back to draft so the stored status matches their real publication state.
update public.therapists
set
  profile_status = 'draft',
  visibility = 'hidden',
  is_active = false,
  updated_at = pg_catalog.now()
where profile_status = 'published'
  and (
    pg_catalog.jsonb_typeof(semantic_profile) <> 'array'
    or semantic_profile = '[]'::jsonb
  );

alter table public.therapists
  drop constraint if exists therapists_published_semantic_profile_required;
alter table public.therapists
  add constraint therapists_published_semantic_profile_required
  check (
    profile_status <> 'published'
    or (
      pg_catalog.jsonb_typeof(semantic_profile) = 'array'
      and semantic_profile <> '[]'::jsonb
    )
  );

-- Replace the former 60-character and years-of-experience requirements with
-- the semantic-domain requirement at the final self-publication boundary.
create or replace function public.publish_my_completed_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  account_row public.therapist_accounts%rowtype;
  profile_row public.therapists%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select account.* into account_row
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid()
  for update;

  if account_row.id is null or account_row.account_status = 'suspended' then
    raise exception 'account_not_eligible' using errcode = '42501';
  end if;

  select therapist.* into profile_row
  from public.therapists as therapist
  where therapist.owner_account_id = account_row.id
  for update;

  if profile_row.id is null then
    raise exception 'profile_not_found';
  end if;

  if profile_row.profile_status = 'published' then
    if pg_catalog.jsonb_typeof(profile_row.semantic_profile) <> 'array'
      or profile_row.semantic_profile = '[]'::jsonb
    then
      raise exception 'profile_step_incomplete';
    end if;

    return jsonb_build_object(
      'therapist_id', profile_row.id,
      'profile_status', profile_row.profile_status,
      'visibility', profile_row.visibility,
      'slug', profile_row.slug
    );
  end if;

  if account_row.payment_method_status <> 'active' then
    raise exception 'payment_method_not_active';
  end if;

  if exists (
    select 1
    from public.therapist_credentials as credential
    where credential.therapist_id = profile_row.id
      and credential.verification_status in ('rejected', 'expired')
  ) then
    raise exception 'credential_step_incomplete';
  end if;

  if not (
    account_row.credential_verification_skipped_at is not null
    or exists (
      select 1
      from public.therapist_credentials as credential
      where credential.therapist_id = profile_row.id
        and (
          credential.verification_status in ('pending_review', 'verified')
          or (
            credential.verification_status = 'unverified'
            and credential.document_url is not null
          )
        )
    )
  ) then
    raise exception 'credential_step_incomplete';
  end if;

  if profile_row.profile_status <> 'completed'
    or char_length(btrim(profile_row.full_name)) < 2
    or profile_row.gender is null
    or nullif(btrim(profile_row.professional_title), '') is null
    or pg_catalog.jsonb_typeof(profile_row.semantic_profile) <> 'array'
    or profile_row.semantic_profile = '[]'::jsonb
    or not exists (
      select 1 from public.therapist_professions where therapist_id = profile_row.id
    )
    or not exists (
      select 1 from public.therapist_languages where therapist_id = profile_row.id
    )
    or not exists (
      select 1 from public.therapist_populations where therapist_id = profile_row.id
    )
    or not exists (
      select 1
      from public.therapist_locations as location
      where location.therapist_id = profile_row.id
        and location.is_active
        and (
          (location.location_type = 'clinic' and nullif(btrim(location.city), '') is not null)
          or location.location_type = 'online'
          or (location.location_type = 'home_visit' and location.region is not null)
        )
    )
  then
    raise exception 'profile_step_incomplete';
  end if;

  if cardinality(profile_row.contact_methods) = 0
    or profile_row.preferred_contact_method is null
    or not (profile_row.preferred_contact_method = any(profile_row.contact_methods))
    or ('email' = any(profile_row.contact_methods) and nullif(btrim(profile_row.email), '') is null)
    or (
      ('whatsapp' = any(profile_row.contact_methods) or 'phone' = any(profile_row.contact_methods))
      and nullif(btrim(profile_row.phone), '') is null
    )
  then
    raise exception 'contact_step_incomplete';
  end if;

  update public.therapists
  set
    profile_status = 'published',
    visibility = 'visible',
    is_active = true,
    billing_hold = false,
    is_active_before_billing_hold = null,
    updated_at = now()
  where id = profile_row.id
  returning * into profile_row;

  update public.therapist_accounts
  set onboarding_completed = true, updated_at = now()
  where id = account_row.id;

  return jsonb_build_object(
    'therapist_id', profile_row.id,
    'profile_status', profile_row.profile_status,
    'visibility', profile_row.visibility,
    'slug', profile_row.slug
  );
end;
$fn$;

revoke all on function public.publish_my_completed_profile() from public, anon;
grant execute on function public.publish_my_completed_profile() to authenticated;

commit;
