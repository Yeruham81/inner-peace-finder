begin;

-- WhatsApp delivery can remain queued/sent for an indeterminate amount of time.
-- Keep its budget reservation active until Twilio explicitly reports a terminal
-- outcome. Using PostgreSQL's `infinity` timestamp preserves the existing budget
-- accounting queries (`expires_at > now()`) without changing Voice/Email TTLs.
update public.monthly_budget_reservations as reservation
set expires_at = 'infinity'::timestamptz
from public.whatsapp_lead_deliveries as delivery
where reservation.id = delivery.budget_reservation_id
  and reservation.source_type = 'whatsapp_lead'
  and reservation.status = 'reserved'
  and delivery.status in ('pending', 'queued', 'sent');

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
  v_expires_at timestamptz;
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

  -- Only finite TTL reservations are eligible for automatic expiry. WhatsApp
  -- reservations use `infinity` and are released only on failed/undelivered.
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

  v_expires_at := case
    when _source_type = 'whatsapp_lead' then 'infinity'::timestamptz
    else pg_catalog.now() + pg_catalog.make_interval(mins => greatest(_ttl_minutes, 5))
  end;

  insert into public.monthly_budget_reservations (
    account_id, therapist_id, month_start, source_type, source_key,
    amount_agorot, status, expires_at
  ) values (
    v_account_id, _therapist_id, v_month, _source_type, _source_key,
    v_price, 'reserved', v_expires_at
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
  v_commit_allowed boolean := false;
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
        v_commit_allowed := coalesce((v_result ->> 'allowed')::boolean, false);
        v_billed := v_commit_allowed
                    and not coalesce((v_result ->> 'already_exists')::boolean, false);
      else
        -- Untracked reservations are valid when pricing/budget tracking is not
        -- active for this therapist. Preserve the pre-existing billable event
        -- semantics without inventing a budget reservation.
        v_commit_allowed := true;
        v_billed := true;
      end if;

      -- Delivery state reflects Twilio and is independent of billing success.
      update public.whatsapp_lead_deliveries
      set status = 'delivered',
          delivered_at = coalesce(delivered_at, pg_catalog.now())
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'sent'
      where id = v_delivery.lead_id;

      -- Never claim that the lead was billed unless the reservation commit
      -- actually succeeded (or no reservation was required).
      if v_commit_allowed then
        update public.whatsapp_lead_deliveries
        set billed_at = coalesce(billed_at, pg_catalog.now())
        where id = v_delivery.id;

        update public.cta_clicks
        set billable = true
        where id = v_delivery.cta_event_id;
      end if;
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

revoke all on function public.record_whatsapp_lead_status(text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_lead_status(text, text, text)
  to service_role;

commit;
