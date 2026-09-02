-- Runtime lead-policy controls used by the admin System Settings screen.
-- Defaults preserve the production behavior that existed before this migration.

begin;

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
  settings_row public.system_settings%rowtype;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' OR _session_hash IS NULL OR _session_hash = '' THEN
    RAISE EXCEPTION 'identity hashes are required';
  END IF;

  SELECT setting.* INTO settings_row
  FROM public.system_settings AS setting
  WHERE setting.singleton = true;
  IF settings_row.singleton IS NULL THEN
    RAISE EXCEPTION 'system_settings_unavailable';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  IF settings_row.lead_antispam_enabled THEN
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

  IF settings_row.hide_unclaimed_after_first_lead
     AND v_unclaimed
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
  settings_row public.system_settings%rowtype;
begin
  if _ip_hash is null or _ip_hash = '' or _session_hash is null or _session_hash = '' then
    raise exception 'identity hashes are required';
  end if;

  select setting.* into settings_row
  from public.system_settings as setting
  where setting.singleton = true;
  if settings_row.singleton is null then
    raise exception 'system_settings_unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  if settings_row.lead_antispam_enabled then
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


commit;
