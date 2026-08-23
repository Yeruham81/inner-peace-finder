begin;

alter table public.voice_call_sessions
  add column if not exists budget_reservation_id uuid
  references public.monthly_budget_reservations(id) on delete set null;

create index if not exists voice_call_sessions_budget_reservation_idx
  on public.voice_call_sessions (budget_reservation_id)
  where budget_reservation_id is not null;

create or replace function public.register_monthly_budget_event(
  _therapist_id uuid,
  _source_type text,
  _source_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_month date := public.billing_month_start(pg_catalog.now());
  v_price bigint;
  v_pricing_active boolean := false;
  v_limit bigint;
  v_spent bigint := 0;
  v_reserved bigint := 0;
  v_existing_status text;
  v_paused boolean := false;
  v_inserted boolean := false;
begin
  select therapist.owner_account_id into v_account_id
  from public.therapists as therapist
  where therapist.id = _therapist_id;

  if v_account_id is null then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', false);
  end if;

  select setting.lead_price_agorot, setting.pricing_active
  into v_price, v_pricing_active
  from public.billing_price_settings as setting
  where setting.singleton = true;

  if not coalesce(v_pricing_active, false) or v_price is null then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account_id::text, 0));

  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now()
  where account_id = v_account_id
    and status = 'reserved'
    and expires_at <= pg_catalog.now();

  select reservation.status into v_existing_status
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.source_type = _source_type
    and reservation.source_key = _source_key;

  if v_existing_status = 'committed' then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', true, 'already_exists', true);
  end if;

  select budget.monthly_limit_agorot into v_limit
  from public.therapist_monthly_budgets as budget
  where budget.account_id = v_account_id;

  select coalesce(max(usage.spent_agorot), 0) into v_spent
  from public.therapist_monthly_budget_usage as usage
  where usage.account_id = v_account_id
    and usage.month_start = v_month;

  select coalesce(sum(reservation.amount_agorot), 0) into v_reserved
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.month_start = v_month
    and reservation.status = 'reserved'
    and reservation.expires_at > pg_catalog.now();

  if v_limit is not null and v_limit - v_spent - v_reserved < v_price then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'tracked', false,
      'reason', 'monthly_budget_exhausted'
    );
  end if;

  insert into public.monthly_budget_reservations (
    account_id, therapist_id, month_start, source_type, source_key,
    amount_agorot, status, committed_at
  ) values (
    v_account_id, _therapist_id, v_month, _source_type, _source_key,
    v_price, 'committed', pg_catalog.now()
  )
  on conflict (account_id, source_type, source_key) do nothing;

  v_inserted := found;
  if v_inserted then
    insert into public.therapist_monthly_budget_usage (account_id, month_start, spent_agorot)
    values (v_account_id, v_month, v_price)
    on conflict (account_id, month_start) do update
      set spent_agorot = public.therapist_monthly_budget_usage.spent_agorot + excluded.spent_agorot;
  end if;

  v_paused := public.reconcile_monthly_budget_hold(v_account_id, true);
  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'tracked', true,
    'already_exists', not v_inserted,
    'is_budget_paused', v_paused
  );
end
$fn$;

create or replace function public.reserve_monthly_budget_for_voice(
  _therapist_id uuid,
  _source_key text,
  _ttl_minutes integer default 240
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_month date := public.billing_month_start(pg_catalog.now());
  v_price bigint;
  v_pricing_active boolean := false;
  v_limit bigint;
  v_spent bigint := 0;
  v_reserved bigint := 0;
  v_reservation public.monthly_budget_reservations%rowtype;
begin
  select therapist.owner_account_id into v_account_id
  from public.therapists as therapist
  where therapist.id = _therapist_id;

  if v_account_id is null then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', false);
  end if;

  select setting.lead_price_agorot, setting.pricing_active
  into v_price, v_pricing_active
  from public.billing_price_settings as setting
  where setting.singleton = true;

  if not coalesce(v_pricing_active, false) or v_price is null then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account_id::text, 0));

  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now()
  where account_id = v_account_id
    and status = 'reserved'
    and expires_at <= pg_catalog.now();

  select reservation.* into v_reservation
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.source_type = 'voice_call'
    and reservation.source_key = _source_key;

  if v_reservation.id is not null and v_reservation.status in ('reserved', 'committed') then
    return pg_catalog.jsonb_build_object(
      'allowed', true,
      'tracked', true,
      'reservation_id', v_reservation.id,
      'already_exists', true
    );
  end if;

  select budget.monthly_limit_agorot into v_limit
  from public.therapist_monthly_budgets as budget
  where budget.account_id = v_account_id;

  select coalesce(max(usage.spent_agorot), 0) into v_spent
  from public.therapist_monthly_budget_usage as usage
  where usage.account_id = v_account_id
    and usage.month_start = v_month;

  select coalesce(sum(reservation.amount_agorot), 0) into v_reserved
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.month_start = v_month
    and reservation.status = 'reserved'
    and reservation.expires_at > pg_catalog.now();

  if v_limit is not null and v_limit - v_spent - v_reserved < v_price then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'tracked', false,
      'reason', 'monthly_budget_exhausted'
    );
  end if;

  insert into public.monthly_budget_reservations (
    account_id, therapist_id, month_start, source_type, source_key,
    amount_agorot, status, expires_at
  ) values (
    v_account_id, _therapist_id, v_month, 'voice_call', _source_key,
    v_price, 'reserved', pg_catalog.now() + pg_catalog.make_interval(mins => greatest(_ttl_minutes, 5))
  )
  returning * into v_reservation;

  perform public.reconcile_monthly_budget_hold(v_account_id, false);
  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'tracked', true,
    'reservation_id', v_reservation.id,
    'already_exists', false
  );
end
$fn$;

create or replace function public.commit_monthly_budget_reservation(_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reservation public.monthly_budget_reservations%rowtype;
  v_paused boolean := false;
begin
  select reservation.* into v_reservation
  from public.monthly_budget_reservations as reservation
  where reservation.id = _reservation_id;

  if v_reservation.id is null then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', false);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_reservation.account_id::text, 0));
  select reservation.* into v_reservation
  from public.monthly_budget_reservations as reservation
  where reservation.id = _reservation_id
  for update;

  if v_reservation.status = 'committed' then
    return pg_catalog.jsonb_build_object('allowed', true, 'tracked', true, 'already_exists', true);
  end if;
  if v_reservation.status <> 'reserved' then
    return pg_catalog.jsonb_build_object('allowed', false, 'tracked', false, 'reason', 'reservation_unavailable');
  end if;

  insert into public.therapist_monthly_budget_usage (account_id, month_start, spent_agorot)
  values (v_reservation.account_id, v_reservation.month_start, v_reservation.amount_agorot)
  on conflict (account_id, month_start) do update
    set spent_agorot = public.therapist_monthly_budget_usage.spent_agorot + excluded.spent_agorot;

  update public.monthly_budget_reservations
  set status = 'committed', committed_at = pg_catalog.now()
  where id = v_reservation.id;

  v_paused := public.reconcile_monthly_budget_hold(v_reservation.account_id, true);
  return pg_catalog.jsonb_build_object('allowed', true, 'tracked', true, 'is_budget_paused', v_paused);
end
$fn$;

create or replace function public.release_monthly_budget_reservation(_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
begin
  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now()
  where id = _reservation_id
    and status = 'reserved'
  returning account_id into v_account_id;

  if v_account_id is null then return false; end if;
  perform public.reconcile_monthly_budget_hold(v_account_id, false);
  return true;
end
$fn$;

revoke all on function public.register_monthly_budget_event(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reserve_monthly_budget_for_voice(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.commit_monthly_budget_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_monthly_budget_reservation(uuid) from public, anon, authenticated;
grant execute on function public.register_monthly_budget_event(uuid, text, text) to service_role;
grant execute on function public.reserve_monthly_budget_for_voice(uuid, text, integer) to service_role;
grant execute on function public.commit_monthly_budget_reservation(uuid) to service_role;
grant execute on function public.release_monthly_budget_reservation(uuid) to service_role;

create or replace function public.enforce_cta_monthly_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reservation_id uuid;
  v_result jsonb;
begin
  if not new.billable then return new; end if;

  if new.cta_id = 'voice_call' then
    select session.budget_reservation_id into v_reservation_id
    from public.voice_call_sessions as session
    where session.therapist_id = new.therapist_id
      and session.session_id = new.session_id
    order by session.requested_at desc
    limit 1;
  end if;

  if v_reservation_id is not null then
    v_result := public.commit_monthly_budget_reservation(v_reservation_id);
  else
    v_result := public.register_monthly_budget_event(
      new.therapist_id,
      'cta_click',
      new.therapist_id::text || ':' || new.session_id || ':' || new.cta_id
    );
  end if;

  if not coalesce((v_result ->> 'allowed')::boolean, false) then
    raise exception 'monthly_budget_exhausted';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_enforce_cta_monthly_budget on public.cta_clicks;
create trigger trg_enforce_cta_monthly_budget
  before insert on public.cta_clicks
  for each row execute function public.enforce_cta_monthly_budget();

create or replace function public.reserve_voice_monthly_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_result jsonb;
begin
  v_result := public.reserve_monthly_budget_for_voice(new.therapist_id, new.id::text, 240);
  if not coalesce((v_result ->> 'allowed')::boolean, false) then
    raise exception 'monthly_budget_exhausted';
  end if;
  new.budget_reservation_id := (v_result ->> 'reservation_id')::uuid;
  return new;
end
$fn$;

drop trigger if exists trg_reserve_voice_monthly_budget on public.voice_call_sessions;
create trigger trg_reserve_voice_monthly_budget
  before insert on public.voice_call_sessions
  for each row execute function public.reserve_voice_monthly_budget();

create or replace function public.release_unused_voice_monthly_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.budget_reservation_id is not null
     and new.billable_event_at is null
     and new.outcome is not null
     and new.outcome <> 'answered' then
    perform public.release_monthly_budget_reservation(new.budget_reservation_id);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_release_unused_voice_monthly_budget on public.voice_call_sessions;
create trigger trg_release_unused_voice_monthly_budget
  after update of outcome, billable_event_at on public.voice_call_sessions
  for each row execute function public.release_unused_voice_monthly_budget();

create or replace function public.claim_monthly_budget_notification(_therapist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_notification public.monthly_budget_notifications%rowtype;
  v_account public.therapist_accounts%rowtype;
  v_therapist public.therapists%rowtype;
begin
  select notification.* into v_notification
  from public.monthly_budget_notifications as notification
  join public.therapists as therapist on therapist.owner_account_id = notification.account_id
  where therapist.id = _therapist_id
    and therapist.budget_hold_until > pg_catalog.now()
    and (
      notification.status in ('pending', 'failed')
      or (notification.status = 'sending' and notification.updated_at < pg_catalog.now() - pg_catalog.make_interval(mins => 10))
    )
  order by notification.created_at
  for update of notification skip locked
  limit 1;

  if v_notification.id is null then return null; end if;

  update public.monthly_budget_notifications
  set status = 'sending', attempts = attempts + 1, last_error = null
  where id = v_notification.id;

  select account.* into v_account
  from public.therapist_accounts as account
  where account.id = v_notification.account_id;
  select therapist.* into v_therapist
  from public.therapists as therapist
  where therapist.id = _therapist_id;

  return pg_catalog.jsonb_build_object(
    'notification_id', v_notification.id,
    'auth_user_id', v_account.auth_user_id,
    'therapist_name', v_therapist.full_name,
    'monthly_limit_agorot', v_notification.monthly_limit_agorot,
    'spent_agorot', v_notification.spent_agorot,
    'month_start', v_notification.month_start
  );
end
$fn$;

create or replace function public.finish_monthly_budget_notification(
  _notification_id uuid,
  _success boolean,
  _error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.monthly_budget_notifications
  set status = case when _success then 'sent' else 'failed' end,
      sent_at = case when _success then pg_catalog.now() else sent_at end,
      last_error = case when _success then null else left(coalesce(_error, 'unknown_error'), 500) end
  where id = _notification_id;
end
$fn$;

revoke all on function public.claim_monthly_budget_notification(uuid) from public, anon, authenticated;
revoke all on function public.finish_monthly_budget_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_monthly_budget_notification(uuid) to service_role;
grant execute on function public.finish_monthly_budget_notification(uuid, boolean, text) to service_role;

commit;
