begin;

-- Browser clients no longer write analytics rows directly. Every event passes
-- a validated server endpoint and this rate-limited service-role-only function.
alter table public.analytics_events
  add column if not exists identity_hash text;

revoke insert on table public.analytics_events from anon, authenticated;
drop policy if exists "Anyone can insert analytics events" on public.analytics_events;

create index if not exists analytics_events_identity_created_idx
  on public.analytics_events (identity_hash, created_at desc)
  where identity_hash is not null;

create index if not exists analytics_events_session_event_therapist_created_idx
  on public.analytics_events (session_id, event_name, therapist_id, created_at desc);

create or replace function public.record_public_analytics_event(
  _event_name text,
  _session_hash text,
  _identity_hash text,
  _therapist_id uuid,
  _problem_id uuid,
  _population_id uuid,
  _rank_position integer,
  _page_source text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_window interval;
  v_recent_count integer;
begin
  if _event_name not in (
    'search_executed',
    'therapist_results_rendered',
    'therapist_card_viewed',
    'therapist_profile_viewed',
    'cta_shown',
    'cta_clicked',
    'no_results_returned',
    'anti_spam_passed',
    'lead_created',
    'lead_delivered',
    'lead_rate_limited',
    'search_clarification_shown',
    'search_clarification_chosen'
  ) then
    raise exception 'invalid_analytics_event';
  end if;

  if _session_hash is null or char_length(_session_hash) <> 64
     or _identity_hash is null or char_length(_identity_hash) <> 64 then
    raise exception 'invalid_analytics_identity';
  end if;
  if _page_source is not null and char_length(_page_source) > 80 then
    raise exception 'invalid_page_source';
  end if;
  if _rank_position is not null and (_rank_position < 0 or _rank_position > 5000) then
    raise exception 'invalid_rank_position';
  end if;

  if _therapist_id is not null and not exists (
    select 1
    from public.therapists as therapist
    where therapist.id = _therapist_id
      and therapist.is_active = true
      and therapist.profile_status = 'published'
      and therapist.visibility in ('visible', 'published')
      and therapist.do_not_republish = false
  ) then
    return false;
  end if;

  -- Serialize an identity's check/insert pair so concurrent bursts cannot race
  -- past the limit. identity_hash is an HMAC derived from the request IP.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_identity_hash, 0));

  select pg_catalog.count(*) into v_recent_count
  from public.analytics_events as event
  where event.identity_hash = _identity_hash
    and event.created_at >= pg_catalog.now() - interval '1 minute';

  if v_recent_count >= 120 then
    return false;
  end if;

  v_window := case
    when _event_name = 'therapist_profile_viewed' then interval '5 minutes'
    when _event_name = 'therapist_card_viewed' then interval '10 seconds'
    else interval '1 second'
  end;

  if exists (
    select 1
    from public.analytics_events as event
    where event.session_id = _session_hash
      and event.event_name = _event_name
      and event.therapist_id is not distinct from _therapist_id
      and event.problem_id is not distinct from _problem_id
      and event.population_id is not distinct from _population_id
      and event.page_source is not distinct from _page_source
      and event.created_at >= pg_catalog.now() - v_window
  ) then
    return false;
  end if;

  insert into public.analytics_events (
    event_name,
    session_id,
    identity_hash,
    therapist_id,
    problem_id,
    population_id,
    rank_position,
    page_source
  ) values (
    _event_name,
    _session_hash,
    _identity_hash,
    _therapist_id,
    _problem_id,
    _population_id,
    _rank_position,
    nullif(trim(coalesce(_page_source, '')), '')
  );

  return true;
end
$fn$;

revoke all on function public.record_public_analytics_event(
  text, text, text, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.record_public_analytics_event(
  text, text, text, uuid, uuid, uuid, integer, text
) to service_role;

commit;
