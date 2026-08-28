begin;

alter table public.monthly_budget_reservations
  drop constraint if exists monthly_budget_reservations_source_type_check;
alter table public.monthly_budget_reservations
  add constraint monthly_budget_reservations_source_type_check
  check (source_type in ('cta_click', 'voice_call', 'whatsapp_lead'));

create or replace function public.reserve_monthly_budget_for_source(
  _therapist_id uuid,
  _source_type text,
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
    and reservation.source_type = _source_type
    and reservation.source_key = _source_key;

  if v_reservation.id is not null and v_reservation.status in ('reserved', 'committed') then
    return pg_catalog.jsonb_build_object(
      'allowed', true, 'tracked', true,
      'reservation_id', v_reservation.id, 'already_exists', true
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
      'allowed', false, 'tracked', false, 'reason', 'monthly_budget_exhausted'
    );
  end if;

  insert into public.monthly_budget_reservations (
    account_id, therapist_id, month_start, source_type, source_key,
    amount_agorot, status, expires_at
  ) values (
    v_account_id, _therapist_id, v_month, _source_type, _source_key,
    v_price, 'reserved',
    pg_catalog.now() + pg_catalog.make_interval(mins => greatest(_ttl_minutes, 5))
  )
  returning * into v_reservation;

  perform public.reconcile_monthly_budget_hold(v_account_id, false);
  return pg_catalog.jsonb_build_object(
    'allowed', true, 'tracked', true,
    'reservation_id', v_reservation.id, 'already_exists', false
  );
end
$fn$;

revoke all on function public.reserve_monthly_budget_for_source(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_monthly_budget_for_source(uuid, text, text, integer)
  to service_role;

create table if not exists public.whatsapp_lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead_events(id) on delete cascade,
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  cta_event_id uuid references public.cta_clicks(id) on delete set null,
  budget_reservation_id uuid references public.monthly_budget_reservations(id) on delete set null,
  provider text not null default 'twilio',
  channel text not null default 'whatsapp',
  message_sid text unique,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'undelivered')),
  error_code text,
  billed_at timestamptz,
  reservation_released_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_lead_deliveries_lead_idx
  on public.whatsapp_lead_deliveries (lead_id);
create index if not exists whatsapp_lead_deliveries_status_idx
  on public.whatsapp_lead_deliveries (status, created_at desc);

revoke all on table public.whatsapp_lead_deliveries from public, anon, authenticated;
grant all on table public.whatsapp_lead_deliveries to service_role;
alter table public.whatsapp_lead_deliveries enable row level security;

drop trigger if exists whatsapp_lead_deliveries_set_updated_at on public.whatsapp_lead_deliveries;
create trigger whatsapp_lead_deliveries_set_updated_at
  before update on public.whatsapp_lead_deliveries
  for each row execute function public.set_updated_at();

create or replace function public.submit_whatsapp_lead(
  _challenge_id uuid,
  _answer integer,
  _ip_hash text,
  _session_hash text,
  _session_id text,
  _therapist_id uuid,
  _cta_id text,
  _source_problem_id uuid,
  _population_id uuid,
  _visitor_name text,
  _visitor_phone text,
  _message text,
  _user_agent text
)
returns table(
  allowed boolean,
  reason text,
  lead_id uuid,
  delivery_id uuid,
  therapist_name text,
  destination text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  ip_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(mins => 15);
  therapist_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(hours => 1);
  attempt_count integer;
  distinct_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  v_therapist public.therapists;
  v_cta_id uuid;
  v_lead_id uuid;
  v_delivery_id uuid;
  v_reservation jsonb;
  v_destination text;
begin
  if _ip_hash is null or _ip_hash = '' or _session_hash is null or _session_hash = '' then
    raise exception 'identity hashes are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  select pg_catalog.count(*) into attempt_count
  from public.lead_submission_attempts a
  where a.ip_hash = _ip_hash and a.created_at >= ip_window;
  if attempt_count >= 10 then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    return query select false, 'rate_limit_exceeded', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select pg_catalog.count(distinct a.therapist_id) into distinct_therapists
  from public.lead_submission_attempts a
  where a.ip_hash = _ip_hash
    and a.created_at >= ip_window
    and a.therapist_id is not null
    and a.therapist_id <> _therapist_id;
  if distinct_therapists >= 5 then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    return query select false, 'rate_limit_exceeded', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select pg_catalog.count(*) into accepted_same
  from public.lead_submission_attempts a
  where a.ip_hash = _ip_hash
    and a.therapist_id = _therapist_id
    and a.outcome = 'accepted'
    and a.created_at >= therapist_window;
  if accepted_same >= 3 then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    return query select false, 'rate_limit_exceeded', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select * into challenge from public.lead_challenges c
  where c.id = _challenge_id
  for update;

  if not found
     or challenge.ip_hash is distinct from _ip_hash
     or challenge.expected_answer is distinct from _answer then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'challenge_failed');
    return query select false, 'challenge_failed', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if challenge.consumed_at is not null or challenge.expires_at <= pg_catalog.now() then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'challenge_expired');
    return query select false, 'challenge_expired', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select * into v_therapist
  from public.therapists t
  where t.id = _therapist_id
    and t.is_active = true
    and t.profile_status = 'published'
    and t.visibility in ('visible', 'published')
  for update;
  if not found then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    return query select false, 'therapist_unavailable', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_therapist.owner_account_id is null
     or v_therapist.do_not_republish
     or not ('whatsapp' = any (v_therapist.contact_methods)) then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    return query select false, 'therapist_unavailable', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  v_destination := coalesce(nullif(v_therapist.contact_destination, ''), v_therapist.phone);
  if v_destination is null or v_destination = '' then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    return query select false, 'therapist_unavailable', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  update public.lead_challenges
  set consumed_at = pg_catalog.now()
  where id = challenge.id;

  v_reservation := public.reserve_monthly_budget_for_source(
    _therapist_id, 'whatsapp_lead', _session_id || ':' || pg_catalog.gen_random_uuid()::text, 240
  );
  if not coalesce((v_reservation ->> 'allowed')::boolean, false) then
    insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      values (_ip_hash, _session_hash, _therapist_id, 'monthly_budget_exhausted');
    return query select false, 'monthly_budget_exhausted', null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.cta_clicks
      (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
    values
      (_therapist_id, _session_id, coalesce(_cta_id, 'whatsapp_lead'), _source_problem_id,
       _ip_hash, _user_agent, false)
    on conflict (session_id, therapist_id, cta_id) do nothing
    returning id into v_cta_id;

  if v_cta_id is null then
    select c.id into v_cta_id
    from public.cta_clicks c
    where c.session_id = _session_id
      and c.therapist_id = _therapist_id
      and c.cta_id = coalesce(_cta_id, 'whatsapp_lead')
    limit 1;
  end if;

  insert into public.lead_events (
    cta_event_id, session_id, therapist_id, problem_id, population_id,
    visitor_name, visitor_phone, message, challenge_presented, challenge_passed,
    delivery_channel, delivery_status
  ) values (
    v_cta_id, _session_id, _therapist_id, _source_problem_id, _population_id,
    _visitor_name, _visitor_phone, _message, null, true,
    'whatsapp', 'pending'
  )
  returning id into v_lead_id;

  insert into public.whatsapp_lead_deliveries (
    lead_id, therapist_id, cta_event_id, budget_reservation_id, status
  ) values (
    v_lead_id, _therapist_id, v_cta_id, (v_reservation ->> 'reservation_id')::uuid, 'pending'
  )
  returning id into v_delivery_id;

  insert into public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    values (_ip_hash, _session_hash, _therapist_id, 'accepted');

  return query select true, 'accepted', v_lead_id, v_delivery_id,
                      v_therapist.full_name, v_destination;
end
$fn$;

revoke all on function public.submit_whatsapp_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_whatsapp_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text)
  to service_role;

create or replace function public.attach_whatsapp_lead_message(
  _delivery_id uuid,
  _message_sid text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.whatsapp_lead_deliveries
  set message_sid = coalesce(message_sid, _message_sid),
      status = case when status = 'pending' then 'queued' else status end
  where id = _delivery_id;
end
$fn$;

create or replace function public.fail_whatsapp_lead_delivery(
  _delivery_id uuid,
  _error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_delivery public.whatsapp_lead_deliveries%rowtype;
begin
  select * into v_delivery
  from public.whatsapp_lead_deliveries
  where id = _delivery_id
  for update;
  if v_delivery.id is null then return; end if;

  if v_delivery.billed_at is null and v_delivery.budget_reservation_id is not null
     and v_delivery.reservation_released_at is null then
    perform public.release_monthly_budget_reservation(v_delivery.budget_reservation_id);
  end if;

  update public.whatsapp_lead_deliveries
  set status = 'failed',
      error_code = left(coalesce(_error_code, 'unknown'), 64),
      failed_at = coalesce(failed_at, pg_catalog.now()),
      reservation_released_at = coalesce(reservation_released_at, pg_catalog.now())
  where id = _delivery_id;

  update public.lead_events
  set delivery_status = 'failed'
  where id = v_delivery.lead_id;
end
$fn$;

create or replace function public.record_whatsapp_lead_status(
  _message_sid text,
  _status text,
  _error_code text default null
)
returns table(handled boolean, billed boolean, therapist_id uuid, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_delivery public.whatsapp_lead_deliveries%rowtype;
  v_status text := lower(coalesce(_status, ''));
  v_billed boolean := false;
  v_result jsonb;
begin
  select * into v_delivery
  from public.whatsapp_lead_deliveries
  where message_sid = _message_sid
  for update;

  if v_delivery.id is null then
    return query select false, false, null::uuid, null::uuid;
    return;
  end if;

  if v_status in ('queued', 'accepted', 'sending') then
    update public.whatsapp_lead_deliveries
    set status = case when status in ('pending', 'queued') then 'queued' else status end
    where id = v_delivery.id;

  elsif v_status = 'sent' then
    update public.whatsapp_lead_deliveries
    set status = case when status in ('pending', 'queued', 'sent') then 'sent' else status end,
        sent_at = coalesce(sent_at, pg_catalog.now())
    where id = v_delivery.id;

  elsif v_status = 'delivered' then
    if v_delivery.billed_at is null then
      if v_delivery.budget_reservation_id is not null then
        v_result := public.commit_monthly_budget_reservation(v_delivery.budget_reservation_id);
        v_billed := coalesce((v_result ->> 'allowed')::boolean, false)
                    and not coalesce((v_result ->> 'already_exists')::boolean, false);
      else
        v_billed := true;
      end if;

      update public.whatsapp_lead_deliveries
      set status = 'delivered',
          delivered_at = coalesce(delivered_at, pg_catalog.now()),
          billed_at = pg_catalog.now()
      where id = v_delivery.id;

      update public.cta_clicks
      set billable = true
      where id = v_delivery.cta_event_id;

      update public.lead_events
      set delivery_status = 'sent'
      where id = v_delivery.lead_id;
    else
      update public.whatsapp_lead_deliveries
      set status = 'delivered'
      where id = v_delivery.id;
    end if;

  elsif v_status = 'read' then
    update public.whatsapp_lead_deliveries
    set status = case when status = 'delivered' then 'read' else status end
    where id = v_delivery.id;

  elsif v_status in ('failed', 'undelivered') then
    if v_delivery.billed_at is null then
      if v_delivery.budget_reservation_id is not null
         and v_delivery.reservation_released_at is null then
        perform public.release_monthly_budget_reservation(v_delivery.budget_reservation_id);
      end if;

      update public.whatsapp_lead_deliveries
      set status = v_status,
          error_code = left(coalesce(_error_code, error_code, 'unknown'), 64),
          failed_at = coalesce(failed_at, pg_catalog.now()),
          reservation_released_at = coalesce(reservation_released_at, pg_catalog.now())
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'failed'
      where id = v_delivery.lead_id;
    end if;
  end if;

  return query select true, v_billed, v_delivery.therapist_id, v_delivery.lead_id;
end
$fn$;

revoke all on function public.attach_whatsapp_lead_message(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_whatsapp_lead_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.record_whatsapp_lead_status(text, text, text) from public, anon, authenticated;
grant execute on function public.attach_whatsapp_lead_message(uuid, text) to service_role;
grant execute on function public.fail_whatsapp_lead_delivery(uuid, text) to service_role;
grant execute on function public.record_whatsapp_lead_status(text, text, text) to service_role;

commit;