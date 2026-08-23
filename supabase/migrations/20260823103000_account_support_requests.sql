create table if not exists public.account_support_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.therapist_accounts(id) on delete cascade,
  category text not null check (category in ('bug', 'complaint', 'suggestion', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'in_review', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_support_requests_account_created_idx
  on public.account_support_requests (account_id, created_at desc);

alter table public.account_support_requests enable row level security;

revoke all on table public.account_support_requests from anon, authenticated;
grant all on table public.account_support_requests to service_role;

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

  insert into public.account_support_requests (account_id, category, subject, message)
  values (_account_id, _category, trim(_subject), trim(_message))
  returning id into _request_id;

  return _request_id;
end;
$$;

revoke all on function public.submit_my_support_request(text, text, text) from public, anon;
grant execute on function public.submit_my_support_request(text, text, text) to authenticated;
