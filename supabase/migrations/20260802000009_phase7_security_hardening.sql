-- Phase 7: security hardening. Parameterized application search RPC so
-- PostgREST .or() filter strings are never built from user input.
-- Additive migration; 000001-000008 are not modified.

create or replace function public.search_application_ids(
  p_user_id uuid,
  p_term text,
  p_requirement_type text default null
)
returns table (application_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pattern text;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  if p_term is null or length(trim(p_term)) = 0 then
    return;
  end if;

  -- LIKE pattern with a fixed ESCAPE '\'; the input term is bound as a
  -- parameter, so PostgREST filter syntax can never be injected.
  v_pattern := '%' || replace(replace(replace(p_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select a.id
    from public.applications a
    where a.user_id = p_user_id
      and a.archived_at is null
      and (
        a.company ilike v_pattern escape '\'
        or a.job_title ilike v_pattern escape '\'
        or a.notes ilike v_pattern escape '\'
        or exists (
          select 1 from public.application_skills s
          where s.application_id = a.id
            and s.user_id = p_user_id
            and (p_requirement_type is null or s.requirement_type = p_requirement_type)
            and (s.name ilike v_pattern escape '\' or s.normalized_name ilike v_pattern escape '\')
        )
      )
    order by a.id;
end;
$$;

revoke all privileges on function public.search_application_ids(uuid, text, text)
  from public;
revoke all privileges on function public.search_application_ids(uuid, text, text)
  from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all privileges on function public.search_application_ids(uuid, text, text)
      from anon;
  end if;
end
$$;
grant execute on function public.search_application_ids(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke default PUBLIC EXECUTE from the pre-Phase-5 security-definer
-- functions. Each still keeps its authenticated grant; no ordinary role
-- should execute them through the PUBLIC pseudo-role.
-- ---------------------------------------------------------------------------
revoke all privileges on function public.handle_new_user()
  from public;
revoke all privileges on function public.replace_profile_skills(uuid, jsonb)
  from public;
revoke all privileges on function public.swap_sort_order(text, uuid, uuid, uuid)
  from public;
revoke all privileges on function public.create_application(
  uuid, uuid, text, text, text, text, text, text, text, date, text, text[],
  text, text, text, text[], text[], jsonb, text
) from public;
revoke all privileges on function public.duplicate_application(uuid, uuid)
  from public;
revoke all privileges on function public.update_application_status(uuid, uuid, text, date)
  from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all privileges on function public.handle_new_user()
      from anon;
    revoke all privileges on function public.replace_profile_skills(uuid, jsonb)
      from anon;
    revoke all privileges on function public.swap_sort_order(text, uuid, uuid, uuid)
      from anon;
    revoke all privileges on function public.create_application(
      uuid, uuid, text, text, text, text, text, text, text, date, text, text[],
      text, text, text, text[], text[], jsonb, text
    ) from anon;
    revoke all privileges on function public.duplicate_application(uuid, uuid)
      from anon;
    revoke all privileges on function public.update_application_status(uuid, uuid, text, date)
      from anon;
  end if;
end
$$;
