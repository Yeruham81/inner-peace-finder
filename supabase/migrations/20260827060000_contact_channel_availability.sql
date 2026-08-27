begin;

-- Global availability switches for the three public contact channels.
-- Therapist preferences remain stored independently, so temporarily disabling
-- a channel never deletes a therapist's configuration or preferred method.
create table if not exists public.contact_channel_settings (
  singleton boolean primary key default true check (singleton),
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  phone_enabled boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.contact_channel_settings (
  singleton,
  email_enabled,
  whatsapp_enabled,
  phone_enabled
)
values (true, true, false, false)
on conflict (singleton) do nothing;

revoke all on table public.contact_channel_settings from public, anon, authenticated;
grant all on table public.contact_channel_settings to service_role;

alter table public.contact_channel_settings enable row level security;
alter table public.contact_channel_settings force row level security;

drop trigger if exists contact_channel_settings_set_updated_at on public.contact_channel_settings;
create trigger contact_channel_settings_set_updated_at
  before update on public.contact_channel_settings
  for each row execute function public.set_updated_at();

comment on table public.contact_channel_settings is
  'Singleton global feature flags for public therapist contact channels. Service-role only.';

commit;
