begin;

-- Account deletion is a billing-sensitive workflow.  A deletion request freezes
-- the therapist first, waits for in-flight lead reservations to settle, and
-- only permits final deletion after every accrued charge has been paid.
create table if not exists public.account_deletion_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null unique references public.therapist_accounts(id) on delete cascade,
  previous_account_status public.therapist_account_status not null,
  status text not null default 'frozen'
    check (status in ('frozen', 'blocked_pending_leads', 'payment_method_required', 'payment_required', 'payment_processing', 'payment_failed', 'ready_to_delete')),
  outstanding_agorot bigint not null default 0 check (outstanding_agorot >= 0),
  pending_reservations integer not null default 0 check (pending_reservations >= 0),
  requested_at timestamptz not null default pg_catalog.now(),
  last_checked_at timestamptz not null default pg_catalog.now(),
  last_error text,
  updated_at timestamptz not null default pg_catalog.now()
);

-- Payment records intentionally survive deletion of auth.users / therapist_accounts
-- so Tipulinks can retain the minimal accounting record required for billing and
-- legal obligations.  account_reference is an immutable non-FK audit key.
create table if not exists public.billing_payment_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid references public.therapist_accounts(id) on delete set null,
  account_reference uuid not null,
  deletion_request_id uuid references public.account_deletion_requests(id) on delete set null,
  purpose text not null check (purpose in ('account_deletion', 'monthly_collection', 'manual')),
  amount_agorot bigint not null check (amount_agorot > 0),
  status text not null check (status in ('processing', 'succeeded', 'failed')),
  payment_method_kind text,
  provider text,
  provider_reference text,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  succeeded_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists billing_payment_attempts_account_reference_idx
  on public.billing_payment_attempts (account_reference, status, created_at desc);

revoke all on table public.account_deletion_requests from public, anon, authenticated;
revoke all on table public.billing_payment_attempts from public, anon, authenticated;
grant all on table public.account_deletion_requests to service_role;
grant all on table public.billing_payment_attempts to service_role;
alter table public.account_deletion_requests enable row level security;
alter table public.billing_payment_attempts enable row level security;
alter table public.account_deletion_requests force row level security;
alter table public.billing_payment_attempts force row level security;

drop trigger if exists account_deletion_requests_set_updated_at on public.account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
  before update on public.account_deletion_requests
  for each row execute function public.set_updated_at();

drop trigger if exists billing_payment_attempts_set_updated_at on public.billing_payment_attempts;
create trigger billing_payment_attempts_set_updated_at
  before update on public.billing_payment_attempts
  for each row execute function public.set_updated_at();

create or replace function public.account_outstanding_balance_agorot(_account_id uuid)
returns bigint
language sql
security definer
set search_path = ''
as $fn$
  select greatest(
    0::bigint,
    coalesce((
      select pg_catalog.sum(usage.spent_agorot)
      from public.therapist_monthly_budget_usage as usage
      where usage.account_id = _account_id
    ), 0::bigint)
    - coalesce((
      select pg_catalog.sum(payment.amount_agorot)
      from public.billing_payment_attempts as payment
      where payment.account_reference = _account_id
        and payment.status = 'succeeded'
        and payment.purpose in ('account_deletion', 'monthly_collection', 'manual')
    ), 0::bigint)
  );
$fn$;

revoke all on function public.account_outstanding_balance_agorot(uuid) from public, anon, authenticated;
grant execute on function public.account_outstanding_balance_agorot(uuid) to service_role;

-- A suspended account must never acquire a new billable reservation.  Existing
-- reservations are allowed to resolve through their normal provider callbacks.
create or replace function public.reject_new_reservation_for_suspended_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if exists (
    select 1
    from public.therapist_accounts as account
    where account.id = new.account_id
      and account.account_status = 'suspended'
  ) then
    raise exception 'account_not_eligible' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_reject_new_reservation_for_suspended_account on public.monthly_budget_reservations;
create trigger trg_reject_new_reservation_for_suspended_account
  before insert on public.monthly_budget_reservations
  for each row execute function public.reject_new_reservation_for_suspended_account();

create or replace function public.prepare_account_deletion(_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account public.therapist_accounts%rowtype;
  v_request public.account_deletion_requests%rowtype;
  v_outstanding bigint := 0;
  v_pending integer := 0;
  v_status text;
begin
  if _actor is null then
    raise exception 'actor_required' using errcode = '42501';
  end if;

  select account.* into v_account
  from public.therapist_accounts as account
  where account.auth_user_id = _actor
  for update;

  if v_account.id is null then
    raise exception 'account_not_found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account.id::text, 0));

  insert into public.account_deletion_requests (
    account_id, previous_account_status, status, requested_at, last_checked_at
  ) values (
    v_account.id, v_account.account_status, 'frozen', pg_catalog.now(), pg_catalog.now()
  )
  on conflict (account_id) do update
    set last_checked_at = excluded.last_checked_at,
        last_error = null
  returning * into v_request;

  -- Freeze first.  This is deliberately done before any balance check so a
  -- failed/blocked deletion cannot keep receiving new paid leads.
  update public.therapist_accounts
  set account_status = 'suspended', updated_at = pg_catalog.now()
  where id = v_account.id;

  update public.therapists
  set visibility = 'hidden'::public.therapist_visibility,
      is_active = false,
      updated_at = pg_catalog.now()
  where owner_account_id = v_account.id;

  -- Only genuinely expired finite reservations can be released automatically.
  -- Active/infinite reservations must resolve normally; otherwise deletion is
  -- blocked rather than risking the loss of a legitimate billable lead.
  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where account_id = v_account.id
    and status = 'reserved'
    and expires_at is not null
    and expires_at <> 'infinity'::timestamptz
    and expires_at <= pg_catalog.now();

  select pg_catalog.count(*)::integer into v_pending
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account.id
    and reservation.status = 'reserved';

  v_outstanding := public.account_outstanding_balance_agorot(v_account.id);

  if v_pending > 0 then
    v_status := 'blocked_pending_leads';
  elsif v_outstanding = 0 then
    v_status := 'ready_to_delete';
  elsif v_account.payment_method_status <> 'active'
     or v_account.payment_method_kind not in ('real', 'test') then
    v_status := 'payment_method_required';
  else
    v_status := 'payment_required';
  end if;

  update public.account_deletion_requests
  set status = v_status,
      outstanding_agorot = v_outstanding,
      pending_reservations = v_pending,
      last_checked_at = pg_catalog.now(),
      last_error = null
  where id = v_request.id
  returning * into v_request;

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'outstanding_agorot', v_request.outstanding_agorot,
    'pending_reservations', v_request.pending_reservations,
    'payment_method_status', v_account.payment_method_status,
    'payment_method_kind', v_account.payment_method_kind,
    'profile_frozen', true
  );
end;
$fn$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

create or replace function public.claim_account_deletion_payment(_actor uuid, _request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account public.therapist_accounts%rowtype;
  v_request public.account_deletion_requests%rowtype;
  v_attempt public.billing_payment_attempts%rowtype;
  v_outstanding bigint := 0;
  v_pending integer := 0;
  v_idempotency text;
begin
  select account.* into v_account
  from public.therapist_accounts as account
  where account.auth_user_id = _actor
  for update;

  if v_account.id is null then
    raise exception 'account_not_found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account.id::text, 0));

  select request.* into v_request
  from public.account_deletion_requests as request
  where request.id = _request_id
    and request.account_id = v_account.id
  for update;

  if v_request.id is null then
    raise exception 'account_deletion_request_not_found' using errcode = '42501';
  end if;

  update public.therapist_accounts
  set account_status = 'suspended', updated_at = pg_catalog.now()
  where id = v_account.id;

  update public.therapists
  set visibility = 'hidden'::public.therapist_visibility,
      is_active = false,
      updated_at = pg_catalog.now()
  where owner_account_id = v_account.id;

  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where account_id = v_account.id
    and status = 'reserved'
    and expires_at is not null
    and expires_at <> 'infinity'::timestamptz
    and expires_at <= pg_catalog.now();

  select pg_catalog.count(*)::integer into v_pending
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account.id
    and reservation.status = 'reserved';

  v_outstanding := public.account_outstanding_balance_agorot(v_account.id);

  if v_pending > 0 then
    update public.account_deletion_requests
    set status = 'blocked_pending_leads', pending_reservations = v_pending,
        outstanding_agorot = v_outstanding, last_checked_at = pg_catalog.now()
    where id = v_request.id;
    return pg_catalog.jsonb_build_object(
      'status', 'blocked_pending_leads', 'request_id', v_request.id,
      'pending_reservations', v_pending, 'outstanding_agorot', v_outstanding
    );
  end if;

  if v_outstanding = 0 then
    update public.account_deletion_requests
    set status = 'ready_to_delete', pending_reservations = 0,
        outstanding_agorot = 0, last_checked_at = pg_catalog.now()
    where id = v_request.id;
    return pg_catalog.jsonb_build_object('status', 'ready_to_delete', 'request_id', v_request.id, 'outstanding_agorot', 0);
  end if;

  if v_account.payment_method_status <> 'active'
     or v_account.payment_method_kind not in ('real', 'test') then
    update public.account_deletion_requests
    set status = 'payment_method_required', pending_reservations = 0,
        outstanding_agorot = v_outstanding, last_checked_at = pg_catalog.now()
    where id = v_request.id;
    return pg_catalog.jsonb_build_object(
      'status', 'payment_method_required', 'request_id', v_request.id,
      'outstanding_agorot', v_outstanding,
      'payment_method_status', v_account.payment_method_status,
      'payment_method_kind', v_account.payment_method_kind
    );
  end if;

  v_idempotency := 'account-deletion:' || v_request.id::text || ':' || v_outstanding::text;

  insert into public.billing_payment_attempts (
    account_id, account_reference, deletion_request_id, purpose, amount_agorot,
    status, payment_method_kind, idempotency_key
  ) values (
    v_account.id, v_account.id, v_request.id, 'account_deletion', v_outstanding,
    'processing', v_account.payment_method_kind, v_idempotency
  )
  on conflict (idempotency_key) do update
    set status = case
          when public.billing_payment_attempts.status = 'succeeded' then 'succeeded'
          else 'processing'
        end,
        payment_method_kind = excluded.payment_method_kind,
        last_error = case
          when public.billing_payment_attempts.status = 'succeeded' then public.billing_payment_attempts.last_error
          else null
        end,
        updated_at = pg_catalog.now()
  returning * into v_attempt;

  update public.account_deletion_requests
  set status = 'payment_processing', pending_reservations = 0,
      outstanding_agorot = v_outstanding, last_checked_at = pg_catalog.now(), last_error = null
  where id = v_request.id;

  return pg_catalog.jsonb_build_object(
    'status', 'payment_processing',
    'request_id', v_request.id,
    'payment_attempt_id', v_attempt.id,
    'amount_agorot', v_attempt.amount_agorot,
    'payment_method_kind', v_attempt.payment_method_kind,
    'idempotency_key', v_attempt.idempotency_key
  );
end;
$fn$;

revoke all on function public.claim_account_deletion_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_payment(uuid, uuid) to service_role;

create or replace function public.finish_account_deletion_payment(
  _actor uuid,
  _request_id uuid,
  _payment_attempt_id uuid,
  _success boolean,
  _provider text default null,
  _provider_reference text default null,
  _error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_outstanding bigint := 0;
begin
  select account.id into v_account_id
  from public.therapist_accounts as account
  where account.auth_user_id = _actor
  for update;

  if v_account_id is null then
    raise exception 'account_not_found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account_id::text, 0));

  if not exists (
    select 1 from public.account_deletion_requests as request
    where request.id = _request_id and request.account_id = v_account_id
  ) then
    raise exception 'account_deletion_request_not_found' using errcode = '42501';
  end if;

  update public.billing_payment_attempts
  set status = case when _success then 'succeeded' else 'failed' end,
      provider = nullif(_provider, ''),
      provider_reference = nullif(_provider_reference, ''),
      last_error = case when _success then null else left(coalesce(_error, 'payment_failed'), 500) end,
      succeeded_at = case when _success then coalesce(succeeded_at, pg_catalog.now()) else succeeded_at end,
      updated_at = pg_catalog.now()
  where id = _payment_attempt_id
    and account_reference = v_account_id
    and deletion_request_id = _request_id
    and purpose = 'account_deletion';

  if not found then
    raise exception 'payment_attempt_not_found' using errcode = '42501';
  end if;

  v_outstanding := public.account_outstanding_balance_agorot(v_account_id);

  update public.account_deletion_requests
  set status = case
        when _success and v_outstanding = 0 then 'ready_to_delete'
        when _success then 'payment_required'
        else 'payment_failed'
      end,
      outstanding_agorot = v_outstanding,
      last_checked_at = pg_catalog.now(),
      last_error = case when _success then null else left(coalesce(_error, 'payment_failed'), 500) end
  where id = _request_id;

  return pg_catalog.jsonb_build_object(
    'status', case
      when _success and v_outstanding = 0 then 'ready_to_delete'
      when _success then 'payment_required'
      else 'payment_failed'
    end,
    'request_id', _request_id,
    'outstanding_agorot', v_outstanding
  );
end;
$fn$;

revoke all on function public.finish_account_deletion_payment(uuid, uuid, uuid, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_account_deletion_payment(uuid, uuid, uuid, boolean, text, text, text)
  to service_role;

create or replace function public.assert_account_deletion_ready(_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_request_id uuid;
  v_outstanding bigint := 0;
  v_pending integer := 0;
begin
  select account.id into v_account_id
  from public.therapist_accounts as account
  where account.auth_user_id = _actor
  for update;

  if v_account_id is null then
    raise exception 'account_not_found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account_id::text, 0));

  select request.id into v_request_id
  from public.account_deletion_requests as request
  where request.account_id = v_account_id
  for update;

  if v_request_id is null then
    raise exception 'account_deletion_not_prepared' using errcode = '42501';
  end if;

  update public.therapist_accounts
  set account_status = 'suspended', updated_at = pg_catalog.now()
  where id = v_account_id;

  update public.therapists
  set visibility = 'hidden'::public.therapist_visibility,
      is_active = false,
      updated_at = pg_catalog.now()
  where owner_account_id = v_account_id;

  update public.monthly_budget_reservations
  set status = 'released', released_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where account_id = v_account_id
    and status = 'reserved'
    and expires_at is not null
    and expires_at <> 'infinity'::timestamptz
    and expires_at <= pg_catalog.now();

  select pg_catalog.count(*)::integer into v_pending
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.status = 'reserved';

  if v_pending > 0 then
    update public.account_deletion_requests
    set status = 'blocked_pending_leads', pending_reservations = v_pending,
        last_checked_at = pg_catalog.now()
    where id = v_request_id;
    raise exception 'account_deletion_pending_leads';
  end if;

  v_outstanding := public.account_outstanding_balance_agorot(v_account_id);
  if v_outstanding > 0 then
    update public.account_deletion_requests
    set status = 'payment_required', outstanding_agorot = v_outstanding,
        pending_reservations = 0, last_checked_at = pg_catalog.now()
    where id = v_request_id;
    raise exception 'account_deletion_balance_due:%', v_outstanding;
  end if;

  update public.account_deletion_requests
  set status = 'ready_to_delete', outstanding_agorot = 0,
      pending_reservations = 0, last_checked_at = pg_catalog.now(), last_error = null
  where id = v_request_id;

  return pg_catalog.jsonb_build_object('ready', true, 'request_id', v_request_id);
end;
$fn$;

revoke all on function public.assert_account_deletion_ready(uuid) from public, anon, authenticated;
grant execute on function public.assert_account_deletion_ready(uuid) to service_role;

-- Preserve the freeze atomically when profile deletion is part of an account
-- deletion request.  The profile-only deletion workflow still resets the
-- reusable account to active as before.
create or replace function public.finalize_therapist_profile_deletion(_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account_id uuid;
  v_deleted integer := 0;
  v_account_deletion_pending boolean := false;
begin
  if _actor is null then
    raise exception 'actor is required' using errcode = '42501';
  end if;

  select id into v_account_id
  from public.therapist_accounts
  where auth_user_id = _actor
  for update;

  if v_account_id is null then
    raise exception 'therapist account not found for actor' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.account_deletion_requests as request
    where request.account_id = v_account_id
  ) into v_account_deletion_pending;

  with removed as (
    delete from public.therapists
    where owner_account_id = v_account_id
    returning 1
  )
  select pg_catalog.count(*) into v_deleted from removed;

  update public.therapist_accounts
  set account_status = case
        when v_account_deletion_pending then 'suspended'::public.therapist_account_status
        else 'active'::public.therapist_account_status
      end,
      onboarding_completed = false,
      updated_at = pg_catalog.now()
  where id = v_account_id;

  return pg_catalog.jsonb_build_object('deleted', v_deleted > 0);
end;
$fn$;

revoke all on function public.finalize_therapist_profile_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finalize_therapist_profile_deletion(uuid) to service_role;

commit;
