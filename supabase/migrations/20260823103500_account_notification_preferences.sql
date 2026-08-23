alter table public.therapist_accounts
  add column if not exists notify_new_leads boolean not null default true,
  add column if not exists notify_account_updates boolean not null default true;

create or replace function public.get_my_notification_preferences()
returns table (notify_new_leads boolean, notify_account_updates boolean)
language sql
stable
security definer
set search_path = public
as $$
  select account.notify_new_leads, account.notify_account_updates
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid();
$$;

create or replace function public.update_my_notification_preferences(
  _notify_new_leads boolean,
  _notify_account_updates boolean
)
returns table (notify_new_leads boolean, notify_account_updates boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  update public.therapist_accounts as account
  set
    notify_new_leads = _notify_new_leads,
    notify_account_updates = _notify_account_updates,
    updated_at = now()
  where account.auth_user_id = auth.uid()
  returning account.notify_new_leads, account.notify_account_updates;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public, anon;
revoke all on function public.update_my_notification_preferences(boolean, boolean) from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.update_my_notification_preferences(boolean, boolean) to authenticated;
