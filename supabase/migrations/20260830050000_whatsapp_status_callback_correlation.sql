begin;

-- Twilio can deliver a message-status callback very quickly, including before
-- the Messages API response has returned far enough for the application to
-- attach MessageSid to whatsapp_lead_deliveries. New sends therefore include
-- the already-created delivery UUID in the signed StatusCallback URL. The
-- callback may use that trusted correlation key to attach MessageSid and apply
-- the status atomically in the same transaction.
--
-- Keep the three-argument calling form compatible by making _delivery_id
-- optional. This also allows callbacks from messages created before this
-- migration to continue resolving by MessageSid alone.
drop function if exists public.record_whatsapp_lead_status(text, text, text);

create function public.record_whatsapp_lead_status(
  _message_sid text,
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
  v_delivery public.whatsapp_lead_deliveries%rowtype;
  v_status text := lower(coalesce(_status, ''));
  v_billed boolean := false;
  v_result jsonb;
  v_commit_allowed boolean := false;
begin
  -- Normal path after MessageSid has already been attached.
  select * into v_delivery
  from public.whatsapp_lead_deliveries
  where message_sid = _message_sid
  for update;

  if v_delivery.id is not null then
    -- A signed callback must never be allowed to correlate one provider SID to
    -- a different Tipulinks delivery row.
    if _delivery_id is not null and v_delivery.id <> _delivery_id then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;
  else
    -- Race-safe path: the delivery row exists before the Twilio send, so the
    -- signed callback URL can identify it even when MessageSid is not attached
    -- yet by the request handler.
    if _delivery_id is null then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    select * into v_delivery
    from public.whatsapp_lead_deliveries
    where id = _delivery_id
    for update;

    if v_delivery.id is null then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    if v_delivery.message_sid is not null and v_delivery.message_sid <> _message_sid then
      return query select false, false, null::uuid, null::uuid;
      return;
    end if;

    if v_delivery.message_sid is null then
      update public.whatsapp_lead_deliveries
      set message_sid = _message_sid
      where id = v_delivery.id;
    end if;
  end if;

  if v_status in ('queued', 'accepted', 'sending') then
    update public.whatsapp_lead_deliveries
    set status = case when status in ('pending', 'queued') then 'queued' else status end
    where id = v_delivery.id;

  elsif v_status = 'sent' then
    update public.whatsapp_lead_deliveries
    set status = case when status in ('pending', 'queued', 'sent') then 'sent' else status end,
        sent_at = coalesce(sent_at, pg_catalog.now())
    where id = v_delivery.id;

  elsif v_status = 'delivered' then
    if v_delivery.billed_at is null then
      if v_delivery.budget_reservation_id is not null then
        v_result := public.commit_monthly_budget_reservation(v_delivery.budget_reservation_id);
        v_commit_allowed := coalesce((v_result ->> 'allowed')::boolean, false);
        v_billed := v_commit_allowed
                    and not coalesce((v_result ->> 'already_exists')::boolean, false);
      else
        -- Untracked reservations are valid when pricing/budget tracking is not
        -- active for this therapist.
        v_commit_allowed := true;
        v_billed := true;
      end if;

      update public.whatsapp_lead_deliveries
      set status = 'delivered',
          delivered_at = coalesce(delivered_at, pg_catalog.now())
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'sent'
      where id = v_delivery.lead_id;

      if v_commit_allowed then
        update public.whatsapp_lead_deliveries
        set billed_at = coalesce(billed_at, pg_catalog.now())
        where id = v_delivery.id;

        update public.cta_clicks
        set billable = true
        where id = v_delivery.cta_event_id;
      end if;
    else
      update public.whatsapp_lead_deliveries
      set status = 'delivered'
      where id = v_delivery.id;
    end if;

  elsif v_status = 'read' then
    update public.whatsapp_lead_deliveries
    set status = case when status = 'delivered' then 'read' else status end
    where id = v_delivery.id;

  elsif v_status in ('failed', 'undelivered') then
    if v_delivery.billed_at is null then
      if v_delivery.budget_reservation_id is not null
         and v_delivery.reservation_released_at is null then
        perform public.release_monthly_budget_reservation(v_delivery.budget_reservation_id);
      end if;

      update public.whatsapp_lead_deliveries
      set status = v_status,
          error_code = left(coalesce(_error_code, error_code, 'unknown'), 64),
          failed_at = coalesce(failed_at, pg_catalog.now()),
          reservation_released_at = coalesce(reservation_released_at, pg_catalog.now())
      where id = v_delivery.id;

      update public.lead_events
      set delivery_status = 'failed'
      where id = v_delivery.lead_id;
    end if;
  end if;

  return query select true, v_billed, v_delivery.therapist_id, v_delivery.lead_id;
end
$fn$;

revoke all on function public.record_whatsapp_lead_status(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_lead_status(text, text, text, uuid)
  to service_role;

commit;
