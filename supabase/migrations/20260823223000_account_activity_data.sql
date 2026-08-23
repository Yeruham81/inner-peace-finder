begin;

-- Account analytics are always aggregated behind authenticated, owner-scoped
-- SECURITY DEFINER functions. The browser never receives access to the private
-- lead, billing or voice tables themselves.
create index if not exists analytics_events_therapist_event_created_idx
  on public.analytics_events (therapist_id, event_name, created_at desc)
  where therapist_id is not null;

create index if not exists monthly_budget_reservations_account_status_created_idx
  on public.monthly_budget_reservations (account_id, status, committed_at desc);

create or replace function public.get_my_account_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_therapist_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_current_start timestamptz := v_now - pg_catalog.make_interval(days => 30);
  v_previous_start timestamptz := v_now - pg_catalog.make_interval(days => 60);
  v_today date := pg_catalog.timezone('Asia/Jerusalem', v_now)::date;
  v_impressions bigint := 0;
  v_previous_impressions bigint := 0;
  v_profile_views bigint := 0;
  v_previous_profile_views bigint := 0;
  v_unique_profile_views bigint := 0;
  v_previous_unique_profile_views bigint := 0;
  v_leads bigint := 0;
  v_previous_leads bigint := 0;
  v_charges bigint := 0;
  v_previous_charges bigint := 0;
  v_daily jsonb := '[]'::jsonb;
  v_channels jsonb := '[]'::jsonb;
  v_recent_leads jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select account.id, therapist.id
  into v_account_id, v_therapist_id
  from public.therapist_accounts as account
  left join public.therapists as therapist on therapist.owner_account_id = account.id
  where account.auth_user_id = auth.uid();

  if v_account_id is null then
    raise exception 'account_not_found';
  end if;

  if v_therapist_id is null then
    return pg_catalog.jsonb_build_object(
      'therapist_id', null,
      'period_days', 30,
      'summary', pg_catalog.jsonb_build_object(
        'impressions', 0,
        'previous_impressions', 0,
        'profile_views', 0,
        'previous_profile_views', 0,
        'unique_profile_views', 0,
        'previous_unique_profile_views', 0,
        'leads', 0,
        'previous_leads', 0,
        'charges_agorot', 0,
        'previous_charges_agorot', 0
      ),
      'daily', '[]'::jsonb,
      'channels', '[]'::jsonb,
      'recent_leads', '[]'::jsonb
    );
  end if;

  select
    pg_catalog.count(*) filter (
      where event.event_name = 'therapist_card_viewed'
        and event.created_at >= v_current_start
    ),
    pg_catalog.count(*) filter (
      where event.event_name = 'therapist_card_viewed'
        and event.created_at >= v_previous_start
        and event.created_at < v_current_start
    ),
    pg_catalog.count(*) filter (
      where event.event_name = 'therapist_profile_viewed'
        and event.created_at >= v_current_start
    ),
    pg_catalog.count(*) filter (
      where event.event_name = 'therapist_profile_viewed'
        and event.created_at >= v_previous_start
        and event.created_at < v_current_start
    ),
    pg_catalog.count(distinct event.session_id) filter (
      where event.event_name = 'therapist_profile_viewed'
        and event.created_at >= v_current_start
    ),
    pg_catalog.count(distinct event.session_id) filter (
      where event.event_name = 'therapist_profile_viewed'
        and event.created_at >= v_previous_start
        and event.created_at < v_current_start
    )
  into
    v_impressions,
    v_previous_impressions,
    v_profile_views,
    v_previous_profile_views,
    v_unique_profile_views,
    v_previous_unique_profile_views
  from public.analytics_events as event
  where event.therapist_id = v_therapist_id
    and event.created_at >= v_previous_start
    and event.event_name in ('therapist_card_viewed', 'therapist_profile_viewed');

  select
    pg_catalog.count(*) filter (where lead.created_at >= v_current_start),
    pg_catalog.count(*) filter (
      where lead.created_at >= v_previous_start
        and lead.created_at < v_current_start
    )
  into v_leads, v_previous_leads
  from public.lead_events as lead
  where lead.therapist_id = v_therapist_id
    and lead.created_at >= v_previous_start;

  select
    coalesce(pg_catalog.sum(reservation.amount_agorot) filter (
      where reservation.committed_at >= v_current_start
    ), 0),
    coalesce(pg_catalog.sum(reservation.amount_agorot) filter (
      where reservation.committed_at >= v_previous_start
        and reservation.committed_at < v_current_start
    ), 0)
  into v_charges, v_previous_charges
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.status = 'committed'
    and reservation.committed_at >= v_previous_start;

  with days as (
    select (v_today - (29 - series.day_offset))::date as day
    from pg_catalog.generate_series(0, 29) as series(day_offset)
  ), analytics_by_day as (
    select
      pg_catalog.timezone('Asia/Jerusalem', event.created_at)::date as day,
      pg_catalog.count(*) filter (where event.event_name = 'therapist_card_viewed') as impressions,
      pg_catalog.count(*) filter (where event.event_name = 'therapist_profile_viewed') as profile_views
    from public.analytics_events as event
    where event.therapist_id = v_therapist_id
      and event.created_at >= v_current_start
      and event.event_name in ('therapist_card_viewed', 'therapist_profile_viewed')
    group by pg_catalog.timezone('Asia/Jerusalem', event.created_at)::date
  ), leads_by_day as (
    select
      pg_catalog.timezone('Asia/Jerusalem', lead.created_at)::date as day,
      pg_catalog.count(*) as leads
    from public.lead_events as lead
    where lead.therapist_id = v_therapist_id
      and lead.created_at >= v_current_start
    group by pg_catalog.timezone('Asia/Jerusalem', lead.created_at)::date
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'date', day.day,
        'impressions', coalesce(analytics.impressions, 0),
        'profile_views', coalesce(analytics.profile_views, 0),
        'leads', coalesce(leads.leads, 0)
      ) order by day.day
    ),
    '[]'::jsonb
  )
  into v_daily
  from days as day
  left join analytics_by_day as analytics on analytics.day = day.day
  left join leads_by_day as leads on leads.day = day.day;

  with supported_channels(channel, sort_order) as (
    values ('whatsapp'::text, 1), ('phone'::text, 2), ('email'::text, 3), ('other'::text, 4)
  ), channel_counts as (
    select
      case
        when lead.delivery_channel in ('phone', 'phone_call') then 'phone'
        when lead.delivery_channel = 'whatsapp' then 'whatsapp'
        when lead.delivery_channel = 'email' then 'email'
        else 'other'
      end as channel,
      pg_catalog.count(*) as count
    from public.lead_events as lead
    where lead.therapist_id = v_therapist_id
      and lead.created_at >= v_current_start
    group by 1
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'channel', supported.channel,
        'count', coalesce(counts.count, 0)
      ) order by supported.sort_order
    ),
    '[]'::jsonb
  )
  into v_channels
  from supported_channels as supported
  left join channel_counts as counts on counts.channel = supported.channel;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', recent.id,
        'created_at', recent.created_at,
        'channel', recent.channel,
        'delivery_status', recent.delivery_status,
        'charge_agorot', recent.charge_agorot
      ) order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into v_recent_leads
  from (
    select
      lead.id,
      lead.created_at,
      case
        when lead.delivery_channel in ('phone', 'phone_call') then 'phone'
        when lead.delivery_channel = 'whatsapp' then 'whatsapp'
        when lead.delivery_channel = 'email' then 'email'
        else 'other'
      end as channel,
      lead.delivery_status,
      coalesce(charge.amount_agorot, 0) as charge_agorot
    from public.lead_events as lead
    left join public.cta_clicks as click on click.id = lead.cta_event_id
    left join lateral (
      select reservation.amount_agorot
      from public.monthly_budget_reservations as reservation
      left join public.voice_call_sessions as voice
        on voice.budget_reservation_id = reservation.id
       and voice.lead_id = lead.id
      where reservation.account_id = v_account_id
        and reservation.status = 'committed'
        and (
          (
            reservation.source_type = 'cta_click'
            and click.id is not null
            and reservation.source_key = click.therapist_id::text || ':' || click.session_id || ':' || click.cta_id
          )
          or (reservation.source_type = 'voice_call' and voice.id is not null)
        )
      order by reservation.committed_at desc nulls last
      limit 1
    ) as charge on true
    where lead.therapist_id = v_therapist_id
    order by lead.created_at desc
    limit 4
  ) as recent;

  return pg_catalog.jsonb_build_object(
    'therapist_id', v_therapist_id,
    'period_days', 30,
    'summary', pg_catalog.jsonb_build_object(
      'impressions', v_impressions,
      'previous_impressions', v_previous_impressions,
      'profile_views', v_profile_views,
      'previous_profile_views', v_previous_profile_views,
      'unique_profile_views', v_unique_profile_views,
      'previous_unique_profile_views', v_previous_unique_profile_views,
      'leads', v_leads,
      'previous_leads', v_previous_leads,
      'charges_agorot', v_charges,
      'previous_charges_agorot', v_previous_charges
    ),
    'daily', v_daily,
    'channels', v_channels,
    'recent_leads', v_recent_leads
  );
end
$fn$;

create or replace function public.get_my_account_leads(_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_therapist_id uuid;
  v_limit integer := least(greatest(coalesce(_limit, 200), 1), 500);
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select account.id, therapist.id
  into v_account_id, v_therapist_id
  from public.therapist_accounts as account
  left join public.therapists as therapist on therapist.owner_account_id = account.id
  where account.auth_user_id = auth.uid();

  if v_account_id is null then
    raise exception 'account_not_found';
  end if;
  if v_therapist_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'created_at', item.created_at,
        'channel', item.channel,
        'delivery_status', item.delivery_status,
        'charge_agorot', item.charge_agorot
      ) order by item.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      lead.id,
      lead.created_at,
      case
        when lead.delivery_channel in ('phone', 'phone_call') then 'phone'
        when lead.delivery_channel = 'whatsapp' then 'whatsapp'
        when lead.delivery_channel = 'email' then 'email'
        else 'other'
      end as channel,
      lead.delivery_status,
      coalesce(charge.amount_agorot, 0) as charge_agorot
    from public.lead_events as lead
    left join public.cta_clicks as click on click.id = lead.cta_event_id
    left join lateral (
      select reservation.amount_agorot
      from public.monthly_budget_reservations as reservation
      left join public.voice_call_sessions as voice
        on voice.budget_reservation_id = reservation.id
       and voice.lead_id = lead.id
      where reservation.account_id = v_account_id
        and reservation.status = 'committed'
        and (
          (
            reservation.source_type = 'cta_click'
            and click.id is not null
            and reservation.source_key = click.therapist_id::text || ':' || click.session_id || ':' || click.cta_id
          )
          or (reservation.source_type = 'voice_call' and voice.id is not null)
        )
      order by reservation.committed_at desc nulls last
      limit 1
    ) as charge on true
    where lead.therapist_id = v_therapist_id
    order by lead.created_at desc
    limit v_limit
  ) as item;

  return v_rows;
end
$fn$;

create or replace function public.get_my_billing_transactions(_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_month date := public.billing_month_start(pg_catalog.now());
  v_limit integer := least(greatest(coalesce(_limit, 100), 1), 500);
  v_charged_leads bigint := 0;
  v_charged_agorot bigint := 0;
  v_rows jsonb := '[]'::jsonb;
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

  select pg_catalog.count(*), coalesce(pg_catalog.sum(reservation.amount_agorot), 0)
  into v_charged_leads, v_charged_agorot
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.month_start = v_month
    and reservation.status = 'committed';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', item.id,
        'created_at', item.created_at,
        'source_type', item.source_type,
        'lead_id', item.lead_id,
        'channel', item.channel,
        'amount_agorot', item.amount_agorot
      ) order by item.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      reservation.id,
      reservation.committed_at as created_at,
      reservation.source_type,
      coalesce(written_lead.id, voice.lead_id) as lead_id,
      case
        when reservation.source_type = 'voice_call' then 'phone'
        when written_lead.delivery_channel = 'whatsapp' then 'whatsapp'
        when written_lead.delivery_channel = 'email' then 'email'
        else 'other'
      end as channel,
      reservation.amount_agorot
    from public.monthly_budget_reservations as reservation
    left join lateral (
      select lead.id, lead.delivery_channel
      from public.cta_clicks as click
      join public.lead_events as lead on lead.cta_event_id = click.id
      where reservation.source_type = 'cta_click'
        and reservation.source_key = click.therapist_id::text || ':' || click.session_id || ':' || click.cta_id
      order by lead.created_at desc
      limit 1
    ) as written_lead on true
    left join lateral (
      select session.lead_id
      from public.voice_call_sessions as session
      where session.budget_reservation_id = reservation.id
      order by session.requested_at desc
      limit 1
    ) as voice on true
    where reservation.account_id = v_account_id
      and reservation.status = 'committed'
    order by reservation.committed_at desc
    limit v_limit
  ) as item;

  return pg_catalog.jsonb_build_object(
    'month_start', v_month,
    'charged_leads', v_charged_leads,
    'charged_agorot', v_charged_agorot,
    'transactions', v_rows
  );
end
$fn$;

revoke all on function public.get_my_account_dashboard() from public, anon;
revoke all on function public.get_my_account_leads(integer) from public, anon;
revoke all on function public.get_my_billing_transactions(integer) from public, anon;
grant execute on function public.get_my_account_dashboard() to authenticated;
grant execute on function public.get_my_account_leads(integer) to authenticated;
grant execute on function public.get_my_billing_transactions(integer) to authenticated;

commit;
