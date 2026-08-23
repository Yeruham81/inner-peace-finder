begin;

-- ---------------------------------------------------------------------------
-- Therapist lead inbox: keep list rows non-PII, reveal details only through an
-- owner-scoped function, and let the owner maintain a small private workflow.
-- ---------------------------------------------------------------------------

alter table public.lead_events
  add column if not exists therapist_status text not null default 'new',
  add column if not exists therapist_note text,
  add column if not exists therapist_updated_at timestamptz;

alter table public.lead_events
  drop constraint if exists lead_events_therapist_status_check,
  add constraint lead_events_therapist_status_check
    check (therapist_status in ('new', 'in_progress', 'handled', 'archived')),
  drop constraint if exists lead_events_therapist_note_length_check,
  add constraint lead_events_therapist_note_length_check
    check (therapist_note is null or char_length(therapist_note) <= 2000);

create index if not exists lead_events_therapist_workflow_idx
  on public.lead_events (therapist_id, therapist_status, created_at desc);

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
        'workflow_status', item.workflow_status,
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
      lead.therapist_status as workflow_status,
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

create or replace function public.get_my_account_lead_detail(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_therapist_id uuid;
  v_detail jsonb;
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
    raise exception 'lead_not_found' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', lead.id,
    'created_at', lead.created_at,
    'channel', case
      when lead.delivery_channel in ('phone', 'phone_call') then 'phone'
      when lead.delivery_channel = 'whatsapp' then 'whatsapp'
      when lead.delivery_channel = 'email' then 'email'
      else 'other'
    end,
    'delivery_status', lead.delivery_status,
    'workflow_status', lead.therapist_status,
    'visitor_name', nullif(lead.visitor_name, 'שיחה טלפונית'),
    'visitor_phone', nullif(lead.visitor_phone, 'not_stored'),
    'message', lead.message,
    'problem_name', problem.name_he,
    'population_name', population.name,
    'private_note', lead.therapist_note,
    'updated_at', lead.therapist_updated_at,
    'charge_agorot', coalesce(charge.amount_agorot, 0)
  )
  into v_detail
  from public.lead_events as lead
  left join public.problems as problem on problem.id = lead.problem_id
  left join public.population_groups as population on population.id = lead.population_id
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
  where lead.id = _lead_id
    and lead.therapist_id = v_therapist_id;

  if v_detail is null then
    raise exception 'lead_not_found' using errcode = '42501';
  end if;
  return v_detail;
end
$fn$;

create or replace function public.update_my_account_lead(
  _lead_id uuid,
  _workflow_status text,
  _private_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_therapist_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if _workflow_status not in ('new', 'in_progress', 'handled', 'archived') then
    raise exception 'invalid_workflow_status';
  end if;
  if char_length(coalesce(_private_note, '')) > 2000 then
    raise exception 'private_note_too_long';
  end if;

  select therapist.id into v_therapist_id
  from public.therapist_accounts as account
  join public.therapists as therapist on therapist.owner_account_id = account.id
  where account.auth_user_id = auth.uid();

  if v_therapist_id is null then
    raise exception 'lead_not_found' using errcode = '42501';
  end if;

  update public.lead_events as lead
  set therapist_status = _workflow_status,
      therapist_note = nullif(trim(coalesce(_private_note, '')), ''),
      therapist_updated_at = pg_catalog.now()
  where lead.id = _lead_id
    and lead.therapist_id = v_therapist_id;

  if not found then
    raise exception 'lead_not_found' using errcode = '42501';
  end if;

  return public.get_my_account_lead_detail(_lead_id);
end
$fn$;

revoke all on function public.get_my_account_lead_detail(uuid) from public, anon;
revoke all on function public.update_my_account_lead(uuid, text, text) from public, anon;
grant execute on function public.get_my_account_lead_detail(uuid) to authenticated;
grant execute on function public.update_my_account_lead(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Credential review metadata. Only server-side administrator actions write it.
-- ---------------------------------------------------------------------------

alter table public.therapist_credentials
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create index if not exists therapist_credentials_pending_submitted_idx
  on public.therapist_credentials (submitted_at desc)
  where verification_status = 'pending_review';

-- ---------------------------------------------------------------------------
-- Staff support workflow plus an owner-scoped request history.
-- ---------------------------------------------------------------------------

alter table public.account_support_requests
  add column if not exists staff_response text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.account_support_requests
  drop constraint if exists account_support_requests_staff_response_length_check,
  add constraint account_support_requests_staff_response_length_check
    check (staff_response is null or char_length(staff_response) <= 2000);

drop trigger if exists trg_account_support_requests_updated_at on public.account_support_requests;
create trigger trg_account_support_requests_updated_at
  before update on public.account_support_requests
  for each row execute function public.set_updated_at();

create index if not exists account_support_requests_status_created_idx
  on public.account_support_requests (status, created_at desc);

create or replace function public.get_my_support_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'category', request.category,
        'subject', request.subject,
        'message', request.message,
        'status', request.status,
        'staff_response', request.staff_response,
        'created_at', request.created_at,
        'updated_at', request.updated_at
      ) order by request.created_at desc
    ),
    '[]'::jsonb
  )
  from public.account_support_requests as request
  join public.therapist_accounts as account on account.id = request.account_id
  where account.auth_user_id = auth.uid()
$fn$;

revoke all on function public.get_my_support_requests() from public, anon;
grant execute on function public.get_my_support_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Preference-aware, idempotent email-notification outbox.
-- ---------------------------------------------------------------------------

create table if not exists public.account_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.therapist_accounts(id) on delete cascade,
  notification_kind text not null check (
    notification_kind in ('new_lead', 'credential_status', 'support_status')
  ),
  entity_key text not null check (char_length(entity_key) between 1 and 200),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 20),
  provider_message_id text,
  last_error text,
  last_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, notification_kind, entity_key)
);

alter table public.account_notification_deliveries enable row level security;
revoke all on table public.account_notification_deliveries from public, anon, authenticated;
grant all on table public.account_notification_deliveries to service_role;

drop trigger if exists trg_account_notification_deliveries_updated_at
  on public.account_notification_deliveries;
create trigger trg_account_notification_deliveries_updated_at
  before update on public.account_notification_deliveries
  for each row execute function public.set_updated_at();

create or replace function public.claim_account_notification(
  _account_id uuid,
  _notification_kind text,
  _entity_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_enabled boolean;
  v_delivery_id uuid;
begin
  if _notification_kind not in ('new_lead', 'credential_status', 'support_status') then
    raise exception 'invalid_notification_kind';
  end if;

  select case
    when _notification_kind = 'new_lead' then account.notify_new_leads
    else account.notify_account_updates
  end
  into v_enabled
  from public.therapist_accounts as account
  where account.id = _account_id;

  if not coalesce(v_enabled, false) then
    return false;
  end if;

  insert into public.account_notification_deliveries (
    account_id, notification_kind, entity_key, status, attempts, last_attempt_at
  ) values (
    _account_id, _notification_kind, _entity_key, 'sending', 1, pg_catalog.now()
  )
  on conflict (account_id, notification_kind, entity_key) do update
    set status = 'sending',
        attempts = public.account_notification_deliveries.attempts + 1,
        last_error = null,
        last_attempt_at = pg_catalog.now()
    where public.account_notification_deliveries.status = 'failed'
      and public.account_notification_deliveries.attempts < 20
  returning id into v_delivery_id;

  return v_delivery_id is not null;
end
$fn$;

create or replace function public.finish_account_notification(
  _account_id uuid,
  _notification_kind text,
  _entity_key text,
  _success boolean,
  _provider_message_id text,
  _error text
)
returns void
language sql
security definer
set search_path = ''
as $fn$
  update public.account_notification_deliveries
  set status = case when _success then 'sent' else 'failed' end,
      provider_message_id = case when _success then nullif(_provider_message_id, '') else null end,
      last_error = case when _success then null else left(coalesce(_error, 'unknown_error'), 1000) end,
      sent_at = case when _success then pg_catalog.now() else null end
  where account_id = _account_id
    and notification_kind = _notification_kind
    and entity_key = _entity_key
    and status = 'sending'
$fn$;

revoke all on function public.claim_account_notification(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.finish_account_notification(uuid, text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_account_notification(uuid, text, text) to service_role;
grant execute on function public.finish_account_notification(uuid, text, text, boolean, text, text)
  to service_role;

commit;
