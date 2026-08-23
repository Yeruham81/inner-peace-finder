begin;

-- Payment methods used by administrator-operated test accounts are explicitly
-- identified as test data. No card number, token or fictional PAN is stored.
alter table public.therapist_accounts
  add column if not exists payment_method_kind text not null default 'none';

alter table public.therapist_accounts
  drop constraint if exists therapist_accounts_payment_method_kind_check;
alter table public.therapist_accounts
  add constraint therapist_accounts_payment_method_kind_check
  check (payment_method_kind in ('none', 'real', 'test'));

update public.therapist_accounts
set payment_method_kind = 'real'
where payment_method_status = 'active'
  and payment_method_kind = 'none';

-- A budget hold is separate from the therapist's own visibility choice and
-- from payment-method failures. The timestamp makes the hold expire naturally
-- at the beginning of the next Israeli calendar month.
alter table public.therapists
  add column if not exists budget_hold_until timestamptz,
  add column if not exists budget_hold_reason text;

alter table public.therapists
  drop constraint if exists therapists_budget_hold_reason_check;
alter table public.therapists
  add constraint therapists_budget_hold_reason_check
  check (budget_hold_reason is null or budget_hold_reason = 'monthly_budget');

create index if not exists therapists_budget_hold_until_idx
  on public.therapists (budget_hold_until)
  where budget_hold_until is not null;

create table if not exists public.billing_price_settings (
  singleton boolean primary key default true check (singleton),
  lead_price_agorot bigint,
  pricing_active boolean not null default false,
  currency text not null default 'ILS' check (currency = 'ILS'),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lead_price_agorot is null or lead_price_agorot > 0),
  check (not pricing_active or lead_price_agorot is not null)
);

insert into public.billing_price_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.therapist_monthly_budgets (
  account_id uuid primary key references public.therapist_accounts(id) on delete cascade,
  monthly_limit_agorot bigint,
  notify_on_exhaustion boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (monthly_limit_agorot is null or monthly_limit_agorot > 0)
);

create table if not exists public.therapist_monthly_budget_usage (
  account_id uuid not null references public.therapist_accounts(id) on delete cascade,
  month_start date not null,
  spent_agorot bigint not null default 0 check (spent_agorot >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, month_start)
);

create table if not exists public.monthly_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.therapist_accounts(id) on delete cascade,
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  month_start date not null,
  source_type text not null check (source_type in ('cta_click', 'voice_call')),
  source_key text not null,
  amount_agorot bigint not null check (amount_agorot > 0),
  status text not null check (status in ('reserved', 'committed', 'released')),
  expires_at timestamptz,
  committed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_type, source_key)
);

create index if not exists monthly_budget_reservations_active_idx
  on public.monthly_budget_reservations (account_id, month_start, expires_at)
  where status = 'reserved';

create table if not exists public.monthly_budget_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.therapist_accounts(id) on delete cascade,
  month_start date not null,
  monthly_limit_agorot bigint not null check (monthly_limit_agorot > 0),
  spent_agorot bigint not null check (spent_agorot >= 0),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, month_start)
);

create index if not exists monthly_budget_notifications_status_idx
  on public.monthly_budget_notifications (status, created_at);

revoke all on table public.billing_price_settings from public, anon, authenticated;
revoke all on table public.therapist_monthly_budgets from public, anon, authenticated;
revoke all on table public.therapist_monthly_budget_usage from public, anon, authenticated;
revoke all on table public.monthly_budget_reservations from public, anon, authenticated;
revoke all on table public.monthly_budget_notifications from public, anon, authenticated;
grant all on table public.billing_price_settings to service_role;
grant all on table public.therapist_monthly_budgets to service_role;
grant all on table public.therapist_monthly_budget_usage to service_role;
grant all on table public.monthly_budget_reservations to service_role;
grant all on table public.monthly_budget_notifications to service_role;

alter table public.billing_price_settings enable row level security;
alter table public.therapist_monthly_budgets enable row level security;
alter table public.therapist_monthly_budget_usage enable row level security;
alter table public.monthly_budget_reservations enable row level security;
alter table public.monthly_budget_notifications enable row level security;
alter table public.billing_price_settings force row level security;
alter table public.therapist_monthly_budgets force row level security;
alter table public.therapist_monthly_budget_usage force row level security;
alter table public.monthly_budget_reservations force row level security;
alter table public.monthly_budget_notifications force row level security;

drop trigger if exists billing_price_settings_set_updated_at on public.billing_price_settings;
create trigger billing_price_settings_set_updated_at
  before update on public.billing_price_settings
  for each row execute function public.set_updated_at();

drop trigger if exists therapist_monthly_budgets_set_updated_at on public.therapist_monthly_budgets;
create trigger therapist_monthly_budgets_set_updated_at
  before update on public.therapist_monthly_budgets
  for each row execute function public.set_updated_at();

drop trigger if exists therapist_monthly_budget_usage_set_updated_at on public.therapist_monthly_budget_usage;
create trigger therapist_monthly_budget_usage_set_updated_at
  before update on public.therapist_monthly_budget_usage
  for each row execute function public.set_updated_at();

drop trigger if exists monthly_budget_reservations_set_updated_at on public.monthly_budget_reservations;
create trigger monthly_budget_reservations_set_updated_at
  before update on public.monthly_budget_reservations
  for each row execute function public.set_updated_at();

drop trigger if exists monthly_budget_notifications_set_updated_at on public.monthly_budget_notifications;
create trigger monthly_budget_notifications_set_updated_at
  before update on public.monthly_budget_notifications
  for each row execute function public.set_updated_at();

create or replace function public.billing_month_start(_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $fn$
  select pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Jerusalem', _at))::date
$fn$;

create or replace function public.billing_next_month_at(_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $fn$
  select (
    pg_catalog.date_trunc('month', pg_catalog.timezone('Asia/Jerusalem', _at))
    + pg_catalog.make_interval(months => 1)
  ) at time zone 'Asia/Jerusalem'
$fn$;

revoke all on function public.billing_month_start(timestamptz) from public, anon, authenticated;
revoke all on function public.billing_next_month_at(timestamptz) from public, anon, authenticated;

create or replace function public.reconcile_monthly_budget_hold(
  _account_id uuid,
  _queue_notification boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_month date := public.billing_month_start(pg_catalog.now());
  v_next_month timestamptz := public.billing_next_month_at(pg_catalog.now());
  v_limit bigint;
  v_notify boolean := true;
  v_spent bigint := 0;
  v_reserved bigint := 0;
  v_price bigint;
  v_pricing_active boolean := false;
  v_paused boolean := false;
begin
  select setting.lead_price_agorot, setting.pricing_active
  into v_price, v_pricing_active
  from public.billing_price_settings as setting
  where setting.singleton = true;

  select budget.monthly_limit_agorot, budget.notify_on_exhaustion
  into v_limit, v_notify
  from public.therapist_monthly_budgets as budget
  where budget.account_id = _account_id;

  select coalesce(max(usage.spent_agorot), 0)
  into v_spent
  from public.therapist_monthly_budget_usage as usage
  where usage.account_id = _account_id
    and usage.month_start = v_month;

  select coalesce(sum(reservation.amount_agorot), 0)
  into v_reserved
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = _account_id
    and reservation.month_start = v_month
    and reservation.status = 'reserved'
    and reservation.expires_at > pg_catalog.now();

  if not coalesce(v_pricing_active, false) or v_price is null or v_limit is null then
    update public.therapists
    set budget_hold_until = null,
        budget_hold_reason = null
    where owner_account_id = _account_id
      and budget_hold_reason = 'monthly_budget';
    return false;
  end if;

  v_paused := greatest(v_limit - v_spent - v_reserved, 0) < v_price;

  if v_paused then
    update public.therapists
    set budget_hold_until = v_next_month,
        budget_hold_reason = 'monthly_budget'
    where owner_account_id = _account_id;

    if _queue_notification and coalesce(v_notify, true) then
      insert into public.monthly_budget_notifications (
        account_id, month_start, monthly_limit_agorot, spent_agorot
      ) values (
        _account_id, v_month, v_limit, v_spent
      )
      on conflict (account_id, month_start) do nothing;
    end if;
  else
    update public.therapists
    set budget_hold_until = null,
        budget_hold_reason = null
    where owner_account_id = _account_id
      and budget_hold_reason = 'monthly_budget';
  end if;

  return v_paused;
end
$fn$;

revoke all on function public.reconcile_monthly_budget_hold(uuid, boolean) from public, anon, authenticated;
grant execute on function public.reconcile_monthly_budget_hold(uuid, boolean) to service_role;

create or replace function public.monthly_budget_snapshot(_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_month date := public.billing_month_start(pg_catalog.now());
  v_limit bigint;
  v_notify boolean := true;
  v_spent bigint := 0;
  v_reserved bigint := 0;
  v_price bigint;
  v_pricing_active boolean := false;
  v_hold_until timestamptz;
  v_therapist_id uuid;
  v_pending boolean := false;
begin
  select budget.monthly_limit_agorot, budget.notify_on_exhaustion
  into v_limit, v_notify
  from public.therapist_monthly_budgets as budget
  where budget.account_id = _account_id;

  select coalesce(max(usage.spent_agorot), 0)
  into v_spent
  from public.therapist_monthly_budget_usage as usage
  where usage.account_id = _account_id
    and usage.month_start = v_month;

  select coalesce(sum(reservation.amount_agorot), 0)
  into v_reserved
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = _account_id
    and reservation.month_start = v_month
    and reservation.status = 'reserved'
    and reservation.expires_at > pg_catalog.now();

  select setting.lead_price_agorot, setting.pricing_active
  into v_price, v_pricing_active
  from public.billing_price_settings as setting
  where setting.singleton = true;

  select therapist.id, therapist.budget_hold_until
  into v_therapist_id, v_hold_until
  from public.therapists as therapist
  where therapist.owner_account_id = _account_id;

  select exists (
    select 1
    from public.monthly_budget_notifications as notification
    where notification.account_id = _account_id
      and notification.month_start = v_month
      and notification.status in ('pending', 'failed')
  ) into v_pending;

  return pg_catalog.jsonb_build_object(
    'therapist_id', v_therapist_id,
    'month_start', v_month,
    'next_month_at', public.billing_next_month_at(pg_catalog.now()),
    'monthly_limit_agorot', v_limit,
    'notify_on_exhaustion', coalesce(v_notify, true),
    'spent_agorot', v_spent,
    'reserved_agorot', v_reserved,
    'remaining_agorot', case
      when v_limit is null then null
      else greatest(v_limit - v_spent - v_reserved, 0)
    end,
    'lead_price_agorot', case when v_pricing_active then v_price else null end,
    'pricing_active', coalesce(v_pricing_active, false),
    'is_budget_paused', v_hold_until > pg_catalog.now(),
    'budget_hold_until', v_hold_until,
    'notification_pending', v_pending
  );
end
$fn$;

revoke all on function public.monthly_budget_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.monthly_budget_snapshot(uuid) to service_role;

create or replace function public.get_my_monthly_budget()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select account.id into v_account_id
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid();

  if v_account_id is null then
    raise exception 'account_not_found';
  end if;

  perform public.reconcile_monthly_budget_hold(v_account_id, false);
  return public.monthly_budget_snapshot(v_account_id);
end
$fn$;

create or replace function public.set_my_monthly_budget(
  _monthly_limit_agorot bigint,
  _notify_on_exhaustion boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if _monthly_limit_agorot is not null and _monthly_limit_agorot <= 0 then
    raise exception 'invalid_monthly_budget';
  end if;

  select account.id into v_account_id
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid()
  for update;

  if v_account_id is null then
    raise exception 'account_not_found';
  end if;

  insert into public.therapist_monthly_budgets (
    account_id, monthly_limit_agorot, notify_on_exhaustion
  ) values (
    v_account_id, _monthly_limit_agorot, coalesce(_notify_on_exhaustion, true)
  )
  on conflict (account_id) do update
    set monthly_limit_agorot = excluded.monthly_limit_agorot,
        notify_on_exhaustion = excluded.notify_on_exhaustion;

  perform public.reconcile_monthly_budget_hold(v_account_id, true);
  return public.monthly_budget_snapshot(v_account_id);
end
$fn$;

revoke all on function public.get_my_monthly_budget() from public, anon;
revoke all on function public.set_my_monthly_budget(bigint, boolean) from public, anon;
grant execute on function public.get_my_monthly_budget() to authenticated;
grant execute on function public.set_my_monthly_budget(bigint, boolean) to authenticated;

create or replace function public.set_my_test_payment_method(_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account public.therapist_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'tipulinks_role', '') <> 'admin' then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select account.* into v_account
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid()
  for update;

  if v_account.id is null then
    raise exception 'account_not_found';
  end if;

  if _enabled and v_account.payment_method_status = 'active'
     and v_account.payment_method_kind = 'real' then
    raise exception 'real_payment_method_exists';
  elsif _enabled then
    update public.therapist_accounts
    set payment_method_status = 'active',
        payment_method_kind = 'test'
    where id = v_account.id;
  elsif v_account.payment_method_kind = 'test' then
    update public.therapist_accounts
    set payment_method_status = 'not_configured',
        payment_method_kind = 'none'
    where id = v_account.id;
  end if;

  select account.* into v_account
  from public.therapist_accounts as account
  where account.id = v_account.id;

  return pg_catalog.jsonb_build_object(
    'payment_method_status', v_account.payment_method_status,
    'payment_method_kind', v_account.payment_method_kind
  );
end
$fn$;

revoke all on function public.set_my_test_payment_method(boolean) from public, anon;
grant execute on function public.set_my_test_payment_method(boolean) to authenticated;

-- A published profile without an active payment method is a billing-repair
-- state even if it predates the onboarding panel. This removes the green-panel
-- contradiction and prevents legacy profiles from remaining publicly active.
create or replace function public.enforce_therapist_billing_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_payment_status text;
begin
  if new.owner_account_id is null then
    return new;
  end if;

  select account.payment_method_status
  into v_payment_status
  from public.therapist_accounts as account
  where account.id = new.owner_account_id;

  if new.profile_status = 'published' and v_payment_status <> 'active' then
    if tg_op = 'INSERT' then
      new.is_active_before_billing_hold := new.is_active;
    elsif not old.billing_hold then
      new.is_active_before_billing_hold := new.is_active;
    elsif new.is_active is distinct from old.is_active then
      new.is_active_before_billing_hold := new.is_active;
    end if;
    new.billing_hold := true;
    new.is_active := false;
  end if;

  return new;
end
$fn$;

drop trigger if exists trg_enforce_therapist_billing_hold on public.therapists;
create trigger trg_enforce_therapist_billing_hold
  before insert or update of owner_account_id, is_active, billing_hold, profile_status
  on public.therapists
  for each row execute function public.enforce_therapist_billing_hold();

create or replace function public.sync_account_payment_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.payment_method_status <> 'active' then
    update public.therapists
    set billing_hold = true
    where owner_account_id = new.id
      and profile_status = 'published'
      and not billing_hold;
  else
    update public.therapists
    set billing_hold = false,
        is_active = coalesce(is_active_before_billing_hold, is_active),
        is_active_before_billing_hold = null
    where owner_account_id = new.id
      and billing_hold;
  end if;
  return new;
end
$fn$;

update public.therapists as therapist
set billing_hold = true
from public.therapist_accounts as account
where therapist.owner_account_id = account.id
  and therapist.profile_status = 'published'
  and account.payment_method_status <> 'active'
  and not therapist.billing_hold;

commit;
