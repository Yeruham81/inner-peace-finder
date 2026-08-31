-- Prevent a therapist from lowering the current calendar-month budget below
-- charges already accrued plus active reservations that may still become charges.
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
  v_month date := public.billing_month_start(pg_catalog.now());
  v_spent bigint := 0;
  v_reserved bigint := 0;
  v_minimum_agorot bigint := 0;
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

  -- Serialize a budget change with the same per-account lock used by billable
  -- events and reservations. This prevents a concurrent lead from creating a
  -- reservation between the floor check and the budget update.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account_id::text, 0));

  select coalesce(max(usage.spent_agorot), 0)
  into v_spent
  from public.therapist_monthly_budget_usage as usage
  where usage.account_id = v_account_id
    and usage.month_start = v_month;

  select coalesce(sum(reservation.amount_agorot), 0)
  into v_reserved
  from public.monthly_budget_reservations as reservation
  where reservation.account_id = v_account_id
    and reservation.month_start = v_month
    and reservation.status = 'reserved'
    and reservation.expires_at > pg_catalog.now();

  v_minimum_agorot := v_spent + v_reserved;

  if _monthly_limit_agorot is not null and _monthly_limit_agorot < v_minimum_agorot then
    raise exception 'monthly_budget_below_current_usage:%', v_minimum_agorot;
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

revoke all on function public.set_my_monthly_budget(bigint, boolean) from public, anon;
grant execute on function public.set_my_monthly_budget(bigint, boolean) to authenticated;
