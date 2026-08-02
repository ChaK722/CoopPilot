-- Phase 6: dashboard and analytics.
-- One shared database-backed analytics snapshot RPC plus a bounded board
-- match-score RPC. Additive migration; 000001-000007 are not modified.

-- ---------------------------------------------------------------------------
-- Index support for analytics queries
-- ---------------------------------------------------------------------------
-- Status-history stage reach and earliest applied-stage events filter by
-- (user_id, to_status) and then order by changed_at. The existing
-- application_status_events_user_to_idx covers the filter; this composite
-- avoids a per-user sort when computing funnel sets and submission dates.
create index if not exists application_status_events_user_to_changed_idx
  on public.application_status_events (user_id, to_status, changed_at);

-- ---------------------------------------------------------------------------
-- get_application_analytics: one snapshot for Dashboard and Analytics
-- ---------------------------------------------------------------------------
create or replace function public.get_application_analytics(
  p_user_id uuid,
  p_today date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  -- Identity first; p_today only affects time windows, never permissions.
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  if p_today is null then
    raise exception 'today is required';
  end if;

  with base_apps as (
    select id, company, job_title, status, deadline, date_applied, updated_at
    from public.applications
    where user_id = p_user_id
      and archived_at is null
  ),
  applied_stage_apps as (
    select distinct e.application_id
    from public.application_status_events e
    where e.user_id = p_user_id
      and e.to_status in ('applied', 'interview', 'offer', 'rejected', 'withdrawn')
  ),
  interview_apps as (
    select distinct e.application_id
    from public.application_status_events e
    where e.user_id = p_user_id
      and e.to_status = 'interview'
  ),
  offer_apps as (
    select distinct e.application_id
    from public.application_status_events e
    where e.user_id = p_user_id
      and e.to_status = 'offer'
  ),
  upcoming as (
    select b.id, b.company, b.job_title, b.deadline, b.updated_at
    from base_apps b
    where b.status in ('saved', 'preparing')
      and b.deadline is not null
      and b.deadline >= p_today
      and b.deadline <= (p_today + 7)
  ),
  requiring_action as (
    select b.id, b.company, b.job_title, b.status, b.deadline, b.updated_at,
           case
             when b.deadline < p_today then 1
             else 2
           end as priority
    from base_apps b
    where b.status in ('saved', 'preparing')
      and b.deadline is not null
      and (b.deadline < p_today or b.deadline <= (p_today + 3))
  ),
  status_counts as (
    select status, count(*) as count
    from base_apps
    group by status
  ),
  submission_dates as (
    select b.id,
           coalesce(
             b.date_applied,
             (
               select (e.changed_at at time zone 'America/Toronto')::date
               from public.application_status_events e
               where e.application_id = b.id
                 and e.user_id = p_user_id
                 and e.to_status in ('applied', 'interview', 'offer', 'rejected', 'withdrawn')
               order by e.changed_at asc, e.id asc
               limit 1
             )
           ) as submission_date
    from base_apps b
    where exists (
      select 1 from applied_stage_apps s where s.application_id = b.id
    )
  ),
  months as (
    select to_char(submission_date, 'YYYY-MM') as month, count(*) as count
    from submission_dates
    group by 1
  ),
  skills as (
    select sk.normalized_name,
           min(sk.name) as name,
           count(distinct sk.application_id) as total_count,
           count(distinct sk.application_id) filter (where sk.requirement_type = 'required')
             as required_count,
           count(distinct sk.application_id) filter (where sk.requirement_type = 'preferred')
             as preferred_count
    from public.application_skills sk
    join base_apps b on b.id = sk.application_id
    where sk.user_id = p_user_id
    group by sk.normalized_name
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', (select count(*) from base_apps),
      'active', (
        select count(*) from base_apps
        where status in ('saved', 'preparing', 'applied', 'interview')
      ),
      'interviews', (
        select count(*) from base_apps b
        where exists (select 1 from interview_apps i where i.application_id = b.id)
      ),
      'offers', (
        select count(*) from base_apps b
        where exists (select 1 from offer_apps o where o.application_id = b.id)
      ),
      'applied_denominator', (
        select count(*) from base_apps b
        where exists (select 1 from applied_stage_apps s where s.application_id = b.id)
      ),
      'upcoming_deadlines', (select count(*) from upcoming),
      'interview_rate', (
        select case
          when (select count(*) from base_apps b
                where exists (select 1 from applied_stage_apps s where s.application_id = b.id)) > 0
          then round(
            (select count(*) from base_apps b
             where exists (select 1 from interview_apps i where i.application_id = b.id))::numeric
            * 100
            / (select count(*) from base_apps b
               where exists (select 1 from applied_stage_apps s where s.application_id = b.id)),
            1
          )
          else null
        end
      ),
      'offer_rate', (
        select case
          when (select count(*) from base_apps b
                where exists (select 1 from applied_stage_apps s where s.application_id = b.id)) > 0
          then round(
            (select count(*) from base_apps b
             where exists (select 1 from offer_apps o where o.application_id = b.id))::numeric
            * 100
            / (select count(*) from base_apps b
               where exists (select 1 from applied_stage_apps s where s.application_id = b.id)),
            1
          )
          else null
        end
      )
    ),
    'status_counts', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', s.status, 'count', s.count) order by s.ord
      ), '[]'::jsonb)
      from (
        select st.status,
               coalesce(c.count, 0) as count,
               st.ord
        from (
          values
            ('saved', 1),
            ('preparing', 2),
            ('applied', 3),
            ('interview', 4),
            ('offer', 5),
            ('rejected', 6),
            ('withdrawn', 7)
        ) as st(status, ord)
        left join status_counts c on c.status = st.status
      ) s
    ),
    'submissions_over_time', (
      select coalesce(jsonb_agg(
        jsonb_build_object('month', m.month, 'count', m.count) order by m.month
      ), '[]'::jsonb)
      from months m
    ),
    'top_skills', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'normalized_name', s.normalized_name,
          'name', s.name,
          'total_count', s.total_count,
          'required_count', s.required_count,
          'preferred_count', s.preferred_count
        ) order by s.total_count desc, s.normalized_name asc
      ), '[]'::jsonb)
      from (
        select s.*
        from skills s
        order by s.total_count desc, s.normalized_name asc
        limit 10
      ) s
    ),
    'upcoming_deadlines', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'company', u.company,
          'job_title', u.job_title,
          'deadline', u.deadline,
          'updated_at', u.updated_at
        ) order by u.ord
      ), '[]'::jsonb)
      from (
        select u.*,
               row_number() over (
                 order by u.deadline asc, u.company asc, u.id asc
               ) as ord
        from upcoming u
        order by u.deadline asc, u.company asc, u.id asc
        limit 5
      ) u
    ),
    'recently_updated', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'company', r.company,
          'job_title', r.job_title,
          'status', r.status,
          'updated_at', r.updated_at
        ) order by r.ord
      ), '[]'::jsonb)
      from (
        select r.*,
               row_number() over (
                 order by r.updated_at desc, r.id asc
               ) as ord
        from base_apps r
        order by r.updated_at desc, r.id asc
        limit 5
      ) r
    ),
    'requiring_action', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'company', a.company,
          'job_title', a.job_title,
          'status', a.status,
          'deadline', a.deadline,
          'updated_at', a.updated_at,
          'reason', case when a.priority = 1 then 'Deadline passed' else 'Apply before deadline' end
        ) order by a.ord
      ), '[]'::jsonb)
      from (
        select a.*,
               row_number() over (
                 order by a.priority asc, a.deadline asc, a.updated_at desc, a.id asc
               ) as ord
        from requiring_action a
        order by a.priority asc, a.deadline asc, a.updated_at desc, a.id asc
        limit 5
      ) a
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_board_match_scores: latest match score per board application
-- ---------------------------------------------------------------------------
-- Bounded batch read for the board; never one query per card. Only
-- non-archived applications of the caller are included.
create or replace function public.get_board_match_scores(p_user_id uuid)
returns table (application_id uuid, overall_score integer)
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  return query
    select distinct on (m.application_id) m.application_id, m.overall_score
    from public.match_analyses m
    join public.applications a
      on a.id = m.application_id
     and a.user_id = m.user_id
     and a.archived_at is null
    where m.user_id = p_user_id
    order by m.application_id, m.generated_at desc, m.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- ACL: no PUBLIC/anon, authenticated only
-- ---------------------------------------------------------------------------
revoke all privileges on function public.get_application_analytics(uuid, date)
  from public;
revoke all privileges on function public.get_application_analytics(uuid, date)
  from authenticated;
revoke all privileges on function public.get_board_match_scores(uuid)
  from public;
revoke all privileges on function public.get_board_match_scores(uuid)
  from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all privileges on function public.get_application_analytics(uuid, date)
      from anon;
    revoke all privileges on function public.get_board_match_scores(uuid)
      from anon;
  end if;
end
$$;

grant execute on function public.get_application_analytics(uuid, date)
  to authenticated;
grant execute on function public.get_board_match_scores(uuid)
  to authenticated;
