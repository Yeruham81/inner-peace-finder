begin;

-- Global gate for creation of new therapist accounts. Existing accounts keep
-- working normally when registration is disabled. This setting is separate
-- from contact-channel availability so one admin save cannot affect the other.
create table if not exists public.therapist_registration_settings (
  singleton boolean primary key default true check (singleton),
  registration_enabled boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.therapist_registration_settings (
  singleton,
  registration_enabled
)
values (true, false)
on conflict (singleton) do nothing;

revoke all on table public.therapist_registration_settings from public, anon, authenticated;
grant all on table public.therapist_registration_settings to service_role;

alter table public.therapist_registration_settings enable row level security;
alter table public.therapist_registration_settings force row level security;

drop trigger if exists therapist_registration_settings_set_updated_at on public.therapist_registration_settings;
create trigger therapist_registration_settings_set_updated_at
  before update on public.therapist_registration_settings
  for each row execute function public.set_updated_at();

comment on table public.therapist_registration_settings is
  'Singleton global switch controlling creation of new therapist accounts. Service-role only.';

-- RLS needs a privileged, read-only accessor because the settings table itself
-- is intentionally not readable by authenticated users.
create or replace function public.is_therapist_registration_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select registration_enabled
       from public.therapist_registration_settings
      where singleton = true),
    false
  );
$$;

revoke all on function public.is_therapist_registration_enabled() from public;
grant execute on function public.is_therapist_registration_enabled() to authenticated, service_role;

-- This is the database boundary. Even an authenticated user who bypasses the
-- website UI cannot create a therapist_accounts row while registration is off.
drop policy if exists "Account owner can insert self" on public.therapist_accounts;
create policy "Account owner can insert self"
  on public.therapist_accounts for insert to authenticated
  with check (
    auth_user_id = auth.uid()
    and public.is_therapist_registration_enabled()
  );

commit;
