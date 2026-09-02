-- Unified support mailbox backed by Zoho Mail.
-- Site requests remain owner-scoped; external emails may exist without an account_id.

alter table public.account_support_requests
  alter column account_id drop not null;

alter table public.account_support_requests
  add column if not exists source text not null default 'site',
  add column if not exists requester_email text,
  add column if not exists requester_name text,
  add column if not exists ticket_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  add column if not exists zoho_thread_id text,
  add column if not exists last_zoho_message_id text,
  add column if not exists last_message_at timestamptz not null default now();

alter table public.account_support_requests
  drop constraint if exists account_support_requests_source_check,
  add constraint account_support_requests_source_check
    check (source in ('site', 'email'));

alter table public.account_support_requests
  drop constraint if exists account_support_requests_ticket_code_check,
  add constraint account_support_requests_ticket_code_check
    check (ticket_code ~ '^[A-F0-9]{10}$');

create unique index if not exists account_support_requests_ticket_code_uidx
  on public.account_support_requests (ticket_code);

create unique index if not exists account_support_requests_zoho_thread_uidx
  on public.account_support_requests (zoho_thread_id)
  where zoho_thread_id is not null;

create index if not exists account_support_requests_last_message_idx
  on public.account_support_requests (last_message_at desc);

create table if not exists public.account_support_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_support_requests(id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  channel text not null check (channel in ('site', 'email')),
  sender_email text,
  sender_name text,
  recipient_email text,
  body text not null check (char_length(body) between 1 and 50000),
  zoho_message_id text,
  zoho_thread_id text,
  has_attachment boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.account_support_messages enable row level security;
revoke all on table public.account_support_messages from public, anon, authenticated;
grant all on table public.account_support_messages to service_role;

create unique index if not exists account_support_messages_zoho_message_uidx
  on public.account_support_messages (zoho_message_id)
  where zoho_message_id is not null;

create index if not exists account_support_messages_request_occurred_idx
  on public.account_support_messages (request_id, occurred_at asc);

-- Preserve existing requests as the first message of their conversation.
insert into public.account_support_messages (
  request_id,
  direction,
  channel,
  body,
  occurred_at
)
select
  request.id,
  'incoming',
  'site',
  request.message,
  request.created_at
from public.account_support_requests as request
where not exists (
  select 1
  from public.account_support_messages as message
  where message.request_id = request.id
);

insert into public.account_support_messages (
  request_id,
  direction,
  channel,
  body,
  occurred_at
)
select
  request.id,
  'outgoing',
  'site',
  request.staff_response,
  coalesce(request.reviewed_at, request.updated_at)
from public.account_support_requests as request
where request.staff_response is not null
  and trim(request.staff_response) <> ''
  and not exists (
    select 1
    from public.account_support_messages as message
    where message.request_id = request.id
      and message.direction = 'outgoing'
      and message.body = request.staff_response
  );

update public.account_support_requests
set last_message_at = greatest(created_at, updated_at);

-- New site submissions atomically create both the request and its first message.
create or replace function public.submit_my_support_request(
  _category text,
  _subject text,
  _message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _account_id uuid;
  _request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _category not in ('bug', 'complaint', 'suggestion', 'other') then
    raise exception 'Invalid support request category';
  end if;
  if char_length(trim(_subject)) not between 3 and 120 then
    raise exception 'Invalid support request subject';
  end if;
  if char_length(trim(_message)) not between 10 and 4000 then
    raise exception 'Invalid support request message';
  end if;

  select id into _account_id
  from public.therapist_accounts
  where auth_user_id = auth.uid();

  if _account_id is null then
    raise exception 'Therapist account not found';
  end if;

  insert into public.account_support_requests (
    account_id,
    category,
    subject,
    message,
    source,
    last_message_at
  ) values (
    _account_id,
    _category,
    trim(_subject),
    trim(_message),
    'site',
    pg_catalog.now()
  )
  returning id into _request_id;

  insert into public.account_support_messages (
    request_id,
    direction,
    channel,
    body,
    occurred_at
  ) values (
    _request_id,
    'incoming',
    'site',
    trim(_message),
    pg_catalog.now()
  );

  return _request_id;
end;
$$;

revoke all on function public.submit_my_support_request(text, text, text) from public, anon;
grant execute on function public.submit_my_support_request(text, text, text) to authenticated;

-- The therapist UI intentionally shows only a compact status history, capped at 10 requests.
create or replace function public.get_my_support_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    pg_catalog.jsonb_agg(item.payload order by item.created_at desc),
    '[]'::jsonb
  )
  from (
    select
      request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'category', request.category,
        'subject', request.subject,
        'status', request.status,
        'created_at', request.created_at,
        'updated_at', request.updated_at
      ) as payload
    from public.account_support_requests as request
    join public.therapist_accounts as account on account.id = request.account_id
    where account.auth_user_id = auth.uid()
    order by request.created_at desc
    limit 10
  ) as item
$fn$;

revoke all on function public.get_my_support_requests() from public, anon;
grant execute on function public.get_my_support_requests() to authenticated;

-- Only credential-review email preferences remain user-configurable.
create or replace function public.get_my_account_update_notification_preference()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select account.notify_account_updates
  from public.therapist_accounts as account
  where account.auth_user_id = auth.uid()
$fn$;

create or replace function public.update_my_account_update_notification_preference(
  _notify_account_updates boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_value boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.therapist_accounts as account
  set notify_account_updates = _notify_account_updates
  where account.auth_user_id = auth.uid()
  returning account.notify_account_updates into v_value;

  if v_value is null then
    raise exception 'Therapist account not found';
  end if;

  return v_value;
end
$fn$;

revoke all on function public.get_my_account_update_notification_preference() from public, anon;
grant execute on function public.get_my_account_update_notification_preference() to authenticated;
revoke all on function public.update_my_account_update_notification_preference(boolean) from public, anon;
grant execute on function public.update_my_account_update_notification_preference(boolean) to authenticated;
