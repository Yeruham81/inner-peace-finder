-- Admin broadcasts and in-app announcements.
-- All campaign authoring/sending is service-role only.

create table if not exists public.admin_broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  category text not null check (category in ('operational', 'product', 'marketing')),
  title text not null check (char_length(title) between 1 and 160),
  email_subject text null check (email_subject is null or char_length(email_subject) between 1 and 180),
  body text not null check (char_length(body) between 1 and 12000),
  cta_label text null check (cta_label is null or char_length(cta_label) <= 80),
  cta_url text null check (cta_url is null or char_length(cta_url) <= 1000),
  delivery_channels text[] not null default '{}'::text[],
  site_display_type text null check (site_display_type is null or site_display_type in ('modal', 'banner')),
  audience jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz null,
  expires_at timestamptz null,
  status text not null default 'sending' check (
    status in ('scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')
  ),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  email_recipient_count integer not null default 0 check (email_recipient_count >= 0),
  site_recipient_count integer not null default 0 check (site_recipient_count >= 0),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  opened_count integer not null default 0 check (opened_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  brevo_batch_id uuid null,
  brevo_campaign_id bigint null,
  brevo_list_id bigint null,
  brevo_list_deleted_at timestamptz null,
  last_error text null,
  locked_at timestamptz null,
  cancelled_at timestamptz null,
  constraint admin_broadcast_channels_nonempty check (cardinality(delivery_channels) > 0),
  constraint admin_broadcast_channels_allowed check (
    delivery_channels <@ array['email', 'site']::text[]
  ),
  constraint admin_broadcast_site_type_required check (
    not ('site' = any(delivery_channels)) or site_display_type is not null
  ),
  constraint admin_broadcast_email_subject_required check (
    not ('email' = any(delivery_channels)) or email_subject is not null
  ),
  constraint admin_broadcast_banner_expiry_required check (
    site_display_type is distinct from 'banner' or expires_at is not null
  ),
  constraint admin_broadcast_expiry_after_start check (
    expires_at is null or expires_at > coalesce(scheduled_at, created_at)
  )
);

create index if not exists admin_broadcast_campaigns_created_at_idx
  on public.admin_broadcast_campaigns (created_at desc);
create index if not exists admin_broadcast_campaigns_status_idx
  on public.admin_broadcast_campaigns (status, scheduled_at);
create unique index if not exists admin_broadcast_campaigns_brevo_campaign_idx
  on public.admin_broadcast_campaigns (brevo_campaign_id)
  where brevo_campaign_id is not null;

create table if not exists public.admin_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.admin_broadcast_campaigns(id) on delete cascade,
  auth_user_id uuid null references auth.users(id) on delete set null,
  therapist_account_id uuid null references public.therapist_accounts(id) on delete set null,
  channel text not null check (channel in ('email', 'site')),
  email text null,
  display_name text null,
  status text not null default 'pending' check (
    status in ('pending', 'active', 'submitted', 'delivered', 'opened', 'failed', 'cancelled')
  ),
  provider_message_id text null,
  submitted_at timestamptz null,
  delivered_at timestamptz null,
  opened_at timestamptz null,
  failed_at timestamptz null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, auth_user_id, channel)
);

create index if not exists admin_broadcast_recipients_campaign_idx
  on public.admin_broadcast_recipients (campaign_id, channel, status);
create index if not exists admin_broadcast_recipients_message_idx
  on public.admin_broadcast_recipients (provider_message_id)
  where provider_message_id is not null;
create index if not exists admin_broadcast_recipients_email_idx
  on public.admin_broadcast_recipients (campaign_id, lower(email))
  where email is not null;
create index if not exists admin_broadcast_recipients_auth_idx
  on public.admin_broadcast_recipients (auth_user_id, channel)
  where auth_user_id is not null;

create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.admin_broadcast_campaigns(id) on delete cascade,
  display_type text not null check (display_type in ('modal', 'banner')),
  category text not null check (category in ('operational', 'product', 'marketing')),
  title text not null,
  body text not null,
  cta_label text null,
  cta_url text null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint site_banner_expiry_required check (display_type <> 'banner' or expires_at is not null),
  constraint site_announcement_expiry_after_start check (expires_at is null or expires_at > starts_at)
);

create index if not exists site_announcements_active_idx
  on public.site_announcements (starts_at, expires_at)
  where cancelled_at is null;

create table if not exists public.user_announcement_dismissals (
  announcement_id uuid not null references public.site_announcements(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, auth_user_id)
);

alter table public.admin_broadcast_campaigns enable row level security;
alter table public.admin_broadcast_recipients enable row level security;
alter table public.site_announcements enable row level security;
alter table public.user_announcement_dismissals enable row level security;

revoke all on table public.admin_broadcast_campaigns from public, anon, authenticated;
revoke all on table public.admin_broadcast_recipients from public, anon, authenticated;
revoke all on table public.site_announcements from public, anon, authenticated;
revoke all on table public.user_announcement_dismissals from public, anon, authenticated;
grant all on table public.admin_broadcast_campaigns to service_role;
grant all on table public.admin_broadcast_recipients to service_role;
grant all on table public.site_announcements to service_role;
grant all on table public.user_announcement_dismissals to service_role;
