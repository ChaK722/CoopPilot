-- Phase 4: transactional status updates (board lifecycle).
-- application_status_events stays append-only: ordinary users cannot write
-- events directly; every change goes through this security-definer RPC.

create or replace function public.update_application_status(
  p_user_id uuid,
  p_application_id uuid,
  p_to_status text,
  p_date_applied date default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_application_id uuid;
  v_current_status text;
begin
  -- 1. Verify the caller identity first.
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  -- 2. Validate the target status before touching any data.
  if p_to_status not in (
    'saved', 'preparing', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'
  ) then
    raise exception 'invalid status';
  end if;

  -- 3. Lock the row and read the CURRENT status from the database; the
  --    client-provided old status is never trusted.
  select id, status into v_application_id, v_current_status
  from public.applications
  where id = p_application_id and user_id = p_user_id
  for update;

  -- 4. Not Found semantics for missing or foreign records.
  if v_application_id is null then
    return null;
  end if;

  -- 5. Same-status request is a no-op: no duplicate event, no history
  --    pollution. An explicitly provided applied date is still honored when
  --    the record has none.
  if v_current_status = p_to_status then
    if p_to_status = 'applied' and p_date_applied is not null then
      update public.applications
      set date_applied = p_date_applied
      where id = v_application_id and date_applied is null;
    end if;
    return v_application_id;
  end if;

  -- 6. Update status (and date_applied per the Phase 4 decision) and append
  --    exactly one event in the same transaction.
  update public.applications
  set status = p_to_status,
      date_applied = case
        when p_to_status = 'applied' and date_applied is null then p_date_applied
        else date_applied
      end
  where id = v_application_id;

  insert into public.application_status_events (
    user_id, application_id, from_status, to_status
  )
  values (p_user_id, v_application_id, v_current_status, p_to_status);

  return v_application_id;
end;
$$;

grant execute on function public.update_application_status(uuid, uuid, text, date)
  to authenticated;
