begin;

create table if not exists public.system_settings (
  singleton boolean primary key default true check (singleton),
  support_email text not null default 'admin@tipulinks.co.il',
  maintenance_enabled boolean not null default false,
  search_indexing_enabled boolean not null default false,
  require_verified_credential_for_publish boolean not null default false,
  require_payment_method_for_publish boolean not null default true,
  require_contact_method_for_publish boolean not null default true,
  max_contact_methods smallint not null default 3 check (max_contact_methods between 1 and 3),
  lead_message_max_length integer not null default 2000 check (lead_message_max_length between 100 and 2000),
  lead_challenge_ttl_minutes smallint not null default 10 check (lead_challenge_ttl_minutes between 2 and 30),
  lead_antispam_enabled boolean not null default true,
  hide_unclaimed_after_first_lead boolean not null default true,
  ai_search_enabled boolean not null default true,
  ai_fallback_enabled boolean not null default true,
  search_results_limit smallint not null default 20 check (search_results_limit between 5 and 50),
  show_unverified_therapists boolean not null default true,
  system_emails_enabled boolean not null default true,
  therapist_notifications_enabled boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.system_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.system_settings enable row level security;
revoke all on table public.system_settings from public, anon, authenticated;
grant all on table public.system_settings to service_role;

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();

-- Publication policy is independent of the therapist-registration switch.
-- Once a therapist account exists, closing public registration must not block
-- that therapist from completing or publishing the existing profile.
create or replace function public.publish_my_completed_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  account_row public.therapist_accounts%rowtype;
  profile_row public.therapists%rowtype;
  settings_row public.system_settings%rowtype;
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

  select setting.* into settings_row
  from public.system_settings as setting
  where setting.singleton = true;

  if settings_row.singleton is null then
    raise exception 'system_settings_unavailable';
  end if;

  if settings_row.require_payment_method_for_publish
    and account_row.payment_method_status <> 'active'
  then
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

  if settings_row.require_verified_credential_for_publish then
    if not exists (
      select 1
      from public.therapist_credentials as credential
      where credential.therapist_id = profile_row.id
        and credential.verification_status = 'verified'
    ) then
      raise exception 'credential_step_incomplete';
    end if;
  elsif not (
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
    or not exists (select 1 from public.therapist_professions where therapist_id = profile_row.id)
    or not exists (select 1 from public.therapist_languages where therapist_id = profile_row.id)
    or not exists (select 1 from public.therapist_populations where therapist_id = profile_row.id)
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

  if cardinality(profile_row.contact_methods) > settings_row.max_contact_methods then
    raise exception 'contact_step_incomplete';
  end if;

  if settings_row.require_contact_method_for_publish and (
    cardinality(profile_row.contact_methods) = 0
    or profile_row.preferred_contact_method is null
    or not (profile_row.preferred_contact_method = any(profile_row.contact_methods))
    or ('email' = any(profile_row.contact_methods) and nullif(btrim(profile_row.email), '') is null)
    or (
      ('whatsapp' = any(profile_row.contact_methods) or 'phone' = any(profile_row.contact_methods))
      and nullif(btrim(profile_row.phone), '') is null
    )
  ) then
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
