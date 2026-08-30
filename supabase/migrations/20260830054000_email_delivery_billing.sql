begin;

-- Email leads are charged only after Brevo reports `delivered`.  Until that
-- terminal provider event, the lead price is reserved against the therapist's
-- monthly cap so concurrent contacts cannot overspend the configured budget.
create table if not exists public.email_lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead_events(id) on delete cascade,
  therapist_id uuid not null references public.therapists(id) on delete cascade,
  cta_event_id uuid references public.cta_clicks(id) on delete set null,
  budget_reservation_id uuid references public.monthly_budget_reservations(id) on delete set null,
  provider text not null default 'brevo',
  channel text not null default 'email',
  provider_message_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'deferred', 'delivered', 'hard_bounce', 'soft_bounce', 'blocked', 'invalid_email', 'error')),
  billable_eligible boolean not null default false,
  error_code text,
  billed_at timestamptz,
  reservation_released_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  deferred_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists email_lead_deliveries_lead_idx
  on public.email_lead_deliveries (lead_id);
create index if not exists email_lead_deliveries_status_idx
  on public.email_lead_deliveries (status, created_at desc);

revoke all on table public.email_lead_deliveries from public, anon, authenticated;
grant all on table public.email_lead_deliveries to service_role;
alter table public.email_lead_deliveries enable row level security;

drop trigger if exists email_lead_deliveries_set_updated_at on public.email_lead_deliveries;
create trigger email_lead_deliveries_set_updated_at
  before update on public.email_lead_deliveries
  for each row execute function public.set_updated_at();

create or replace function public.attach_email_lead_message(
  _delivery_id uuid,
  _message_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.email_lead_deliveries
  set provider_message_id = coalesce(provider_message_id, nullif(_message_id, '')),
      status = case when status = 'pending' then 'accepted' else status end,
      accepted_at = coalesce(accepted_at, pg_catalog.now())
  where id = _delivery_id;
end
$fn$;

create or replace function public.fail_email_lead_delivery(
  _delivery_id uuid,
  _error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_delivery public.email_lead_deliveries%rowtype;
begin
  select * into v_delivery
  from public.email_lead_deliveries
  where id = _delivery_id
  for update;

  if v_delivery.id is null then return; end if;
  if v_delivery.billed_at is not null then return; end if;

  if v_delivery.budget_reservation_id is not null
     and v_delivery.reservation_released_at is null then
    perform public.release_monthly_budget_reservation(v_delivery.budget_reservation_id);
  end if;

  update public.email_lead_deliveries
  set status = 'error',
      error_code = left(coalesce(_error_code, 'unknown'), 256),
      failed_at = coalesce(failed_at, pg_catalog.now()),
      reservation_released_at = case
        when budget_reservation_id is null then reservation_released_at
        else coalesce(reservation_released_at, pg_catalog.now())
      end
  where id = _delivery_id;

  update public.lead_events
  set delivery_status = 'failed'
  where id = v_delivery.lead_id;
end
$fn$;

-- Provider callbacks may arrive before the sending request has finished
-- persisting Brevo's message-id.  The delivery UUID is therefore embedded in a
-- Brevo tag and accepted here as a trusted correlation key after webhook auth.
create or replace function public.record_email_lead_status(
  _message_id text,
  _status text,
  _error_code text default null,
  _delivery_id uuid default null
)
returns table(handled boolean, billed boolean, therapist_id uuid, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_delivery public.email_lead_deliveries%rowtype;
  v_status text := lower(coalesce(_status, ''));
  v_billed boolean := false;
  v_result jsonb;
  v_commit_allowed boolean := false;
begin
  if nullif(_message_id, '') is not null then
    select * into v_delivery
    from public.email_lead_deliveries
    where provider_message_id = _message_id
    for update;
  end if;

  if v_delivery.id is not null then
    if _delivery_id is not null and v_delivery.id <> _delivery_id then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;
  else
    if _delivery_id is null then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    select * into v_delivery
    from public.email_lead_deliveries
    where id = _delivery_id
    for update;

    if v_delivery.id is null then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    if nullif(_message_id, '') is not null
       and v_delivery.provider_message_id is not null
       and v_delivery.provider_message_id <> _message_id then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    if v_delivery.provider_message_id is null and nullif(_message_id, '') is not null then
      update public.email_lead_deliveries
      set provider_message_id = _message_id
      where id = v_delivery.id;
    end if;
  end if;

  if v_status in ('request', 'sent') then
    update public.email_lead_deliveries
    set status = case when status = 'pending' then 'accepted' else status end,
        accepted_at = coalesce(accepted_at, pg_catalog.now())
    where id = v_delivery.id;

  elsif v_status = 'deferred' then
    if v_delivery.billed_at is null
       and v_delivery.status in ('pending', 'accepted', 'deferred') then
      update public.email_lead_deliveries
      set status = 'deferred',
          deferred_at = coalesce(deferred_at, pg_catalog.now()),
          error_code = left(coalesce(_error_code, error_code, 'deferred'), 256)
      where id = v_delivery.id;
    end if;

  elsif v_status = 'delivered' then
    -- A terminal delivery failure wins if callbacks are retried out of order;
    -- never turn a released reservation into a later charge.
    if v_delivery.billed_at is null
       and v_delivery.status not in ('hard_bounce', 'soft_bounce', 'blocked', 'invalid_email', 'error') then
      if not v_delivery.billable_eligible then
        v_commit_allowed := false;
      elsif v_delivery.budget_reservation_id is not null then
        v_result := public.commit_monthly_budget_reservation(v_delivery.budget_reservation_id);
        v_commit_allowed := coalesce((v_result ->> 'allowed')::boolean, false);
        v_billed := v_commit_allowed
                    and not coalesce((v_result ->> 'already_exists')::boolean, false);
      else
        -- Pricing/budget tracking can be disabled or exempt for the account.
        -- Delivery is still a billable event in the lead ledger.
        v_commit_allowed := true;
        v_billed := true;
      end if;

      update public.email_lead_deliveries
      set status = 'delivered',
          delivered_at = coalesce(delivered_at, pg_catalog.now())
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'sent',
          provider_message_id = coalesce(provider_message_id, nullif(_message_id, ''))
      where id = v_delivery.lead_id;

      if v_delivery.billable_eligible and v_commit_allowed then
        update public.email_lead_deliveries
        set billed_at = coalesce(billed_at, pg_catalog.now())
        where id = v_delivery.id;

        update public.cta_clicks
        set billable = true
        where id = v_delivery.cta_event_id;
      end if;
    else
      update public.email_lead_deliveries
      set status = 'delivered'
      where id = v_delivery.id;
    end if;

  elsif v_status in ('hard_bounce', 'soft_bounce', 'blocked', 'invalid_email', 'error') then
    if v_delivery.billed_at is null and v_delivery.status <> 'delivered' then
      if v_delivery.budget_reservation_id is not null
         and v_delivery.reservation_released_at is null then
        perform public.release_monthly_budget_reservation(v_delivery.budget_reservation_id);
      end if;

      update public.email_lead_deliveries
      set status = v_status,
          error_code = left(coalesce(_error_code, error_code, v_status), 256),
          failed_at = coalesce(failed_at, pg_catalog.now()),
          reservation_released_at = case
            when budget_reservation_id is null then reservation_released_at
            else coalesce(reservation_released_at, pg_catalog.now())
          end
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'failed',
          provider_message_id = coalesce(provider_message_id, nullif(_message_id, ''))
      where id = v_delivery.lead_id;
    end if;
  end if;

  return query select true, v_billed, v_delivery.therapist_id, v_delivery.lead_id;
end
$fn$;

revoke all on function public.attach_email_lead_message(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_email_lead_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.record_email_lead_status(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.attach_email_lead_message(uuid, text) to service_role;
grant execute on function public.fail_email_lead_delivery(uuid, text) to service_role;
grant execute on function public.record_email_lead_status(text, text, text, uuid) to service_role;

-- Replace the generic form-submission RPC.  The form is the Email contact
-- action, so a claimed profile is now always dispatched by email.  A new
-- billable CTA starts as non-billable and receives a finite budget reservation;
-- only the Brevo `delivered` callback may flip that CTA to billable.
drop function if exists public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_lead(
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
RETURNS TABLE(
  allowed boolean,
  reason text,
  lead_id uuid,
  cta_event_id uuid,
  billable boolean,
  therapist_name text,
  delivery_channel text,
  destination text,
  delivery_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  ip_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(mins => 15);
  therapist_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(hours => 1);
  attempt_count integer;
  distinct_therapists integer;
  session_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  v_therapist public.therapists;
  v_cta_id uuid;
  v_lead_id uuid;
  v_delivery_id uuid;
  v_reservation jsonb;
  v_budget_reservation_id uuid;
  v_billable_eligible boolean := false;
  v_unclaimed boolean := false;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' OR _session_hash IS NULL OR _session_hash = '' THEN
    RAISE EXCEPTION 'identity hashes are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  SELECT pg_catalog.count(*) INTO attempt_count
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash AND a.created_at >= ip_window;
  IF attempt_count >= 10 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO distinct_therapists
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.created_at >= ip_window
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF distinct_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO session_therapists
    FROM public.lead_submission_attempts a
    WHERE a.session_hash = _session_hash
      AND a.created_at >= ip_window
      AND a.outcome = 'accepted'
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF session_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO accepted_same
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.therapist_id = _therapist_id
      AND a.outcome = 'accepted'
      AND a.created_at >= therapist_window;
  IF accepted_same >= 3 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO challenge FROM public.lead_challenges c
    WHERE c.id = _challenge_id
    FOR UPDATE;

  IF NOT FOUND
     OR challenge.ip_hash IS DISTINCT FROM _ip_hash
     OR challenge.expected_answer IS DISTINCT FROM _answer THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_failed');
    RETURN QUERY SELECT false, 'challenge_failed', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= pg_catalog.now() THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_expired');
    RETURN QUERY SELECT false, 'challenge_expired', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_therapist
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  v_unclaimed := v_therapist.profile_origin = 'admin_public_info'
                 AND v_therapist.owner_account_id IS NULL;

  IF v_unclaimed
     AND (v_therapist.first_contact_reserved_at IS NOT NULL OR v_therapist.first_contact_sent_at IS NOT NULL) THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'unclaimed_contact_limit');
    RETURN QUERY SELECT false, 'unclaimed_contact_limit', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  -- The public email action must resolve to a server-side professional email.
  IF NOT v_unclaimed THEN
    IF NOT ('email' = ANY (v_therapist.contact_methods))
       OR nullif(pg_catalog.btrim(v_therapist.email), '') IS NULL THEN
      INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
        VALUES (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
      RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::uuid, false,
                          NULL::text, NULL::text, NULL::text, NULL::uuid;
      RETURN;
    END IF;
  END IF;

  -- Preserve the established session-level CTA dedupe.  Only a genuinely new
  -- CTA may reserve budget and later become billable.
  SELECT c.id INTO v_cta_id
  FROM public.cta_clicks c
  WHERE c.session_id = _session_id
    AND c.therapist_id = _therapist_id
    AND c.cta_id = coalesce(_cta_id, 'primary')
  LIMIT 1;

  IF NOT v_unclaimed AND v_cta_id IS NULL THEN
    v_delivery_id := pg_catalog.gen_random_uuid();
    v_reservation := public.reserve_monthly_budget_for_source(
      _therapist_id,
      'cta_click',
      _therapist_id::text || ':' || _session_id || ':' || coalesce(_cta_id, 'primary'),
      4320
    );
    IF NOT coalesce((v_reservation ->> 'allowed')::boolean, false) THEN
      INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
        VALUES (_ip_hash, _session_hash, _therapist_id, 'monthly_budget_exhausted');
      RETURN QUERY SELECT false, 'monthly_budget_exhausted', NULL::uuid, NULL::uuid, false,
                          NULL::text, NULL::text, NULL::text, NULL::uuid;
      RETURN;
    END IF;
    v_budget_reservation_id := nullif(v_reservation ->> 'reservation_id', '')::uuid;
  ELSIF NOT v_unclaimed THEN
    v_delivery_id := pg_catalog.gen_random_uuid();
  END IF;

  -- From here on everything commits or rolls back together.
  UPDATE public.lead_challenges
    SET consumed_at = pg_catalog.now()
    WHERE id = challenge.id;

  IF v_unclaimed THEN
    UPDATE public.therapists
      SET first_contact_reserved_at = pg_catalog.now()
      WHERE id = _therapist_id;
  END IF;

  IF v_cta_id IS NULL THEN
    INSERT INTO public.cta_clicks
        (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
      VALUES
        (_therapist_id, _session_id, coalesce(_cta_id, 'primary'), _source_problem_id,
         _ip_hash, _user_agent, false)
      ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
      RETURNING id INTO v_cta_id;

    IF v_cta_id IS NOT NULL AND NOT v_unclaimed THEN
      v_billable_eligible := true;
    ELSIF v_cta_id IS NULL THEN
      -- Defensive race fallback.  Session locking should normally make this
      -- impossible, but never keep a reservation for a deduplicated CTA.
      SELECT c.id INTO v_cta_id
      FROM public.cta_clicks c
      WHERE c.session_id = _session_id
        AND c.therapist_id = _therapist_id
        AND c.cta_id = coalesce(_cta_id, 'primary')
      LIMIT 1;

      IF v_budget_reservation_id IS NOT NULL THEN
        perform public.release_monthly_budget_reservation(v_budget_reservation_id);
        v_budget_reservation_id := NULL;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.lead_events (
    cta_event_id, session_id, therapist_id, problem_id, population_id,
    visitor_name, visitor_phone, message, challenge_presented, challenge_passed,
    delivery_channel, delivery_status
  ) VALUES (
    v_cta_id, _session_id, _therapist_id, _source_problem_id, _population_id,
    _visitor_name, _visitor_phone, _message, NULL, true,
    'email', CASE WHEN v_unclaimed THEN 'awaiting_consent' ELSE 'pending' END
  )
  RETURNING id INTO v_lead_id;

  IF NOT v_unclaimed THEN
    INSERT INTO public.email_lead_deliveries (
      id, lead_id, therapist_id, cta_event_id, budget_reservation_id,
      status, billable_eligible
    ) VALUES (
      v_delivery_id, v_lead_id, _therapist_id, v_cta_id, v_budget_reservation_id,
      'pending', v_billable_eligible
    );
  END IF;

  INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    VALUES (_ip_hash, _session_hash, _therapist_id, 'accepted');

  RETURN QUERY SELECT true, 'accepted',
                      v_lead_id, v_cta_id, false,
                      v_therapist.full_name,
                      CASE WHEN v_unclaimed THEN 'consent_hold' ELSE 'email' END,
                      CASE WHEN v_unclaimed THEN NULL::text ELSE v_therapist.email END,
                      CASE WHEN v_unclaimed THEN NULL::uuid ELSE v_delivery_id END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) TO service_role;

-- Keep the split authorization path retired and the challenge purge restricted.
DROP FUNCTION IF EXISTS public.authorize_lead_submission(uuid, integer, text, text, uuid);
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role;

commit;
