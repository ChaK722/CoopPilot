-- Phase 2 follow-up: automatic sort_order assignment on create and a
-- transactional swap used by the move-up/move-down controls.

-- sort_order is now assigned by a before-insert trigger instead of a column
-- default, so application inserts omit it and receive max+1 per user.
alter table public.educations alter column sort_order drop default;
alter table public.experiences alter column sort_order drop default;
alter table public.projects alter column sort_order drop default;

create or replace function public.assign_sort_order()
returns trigger
language plpgsql
as $$
declare
  next_order integer;
begin
  if new.sort_order is null then
    execute format(
      'select coalesce(max(sort_order), -1) + 1 from %I where user_id = $1',
      tg_table_name
    ) into next_order using new.user_id;
    new.sort_order := next_order;
  end if;
  return new;
end;
$$;

create trigger educations_assign_sort_order
  before insert on public.educations
  for each row
  execute function public.assign_sort_order();

create trigger experiences_assign_sort_order
  before insert on public.experiences
  for each row
  execute function public.assign_sort_order();

create trigger projects_assign_sort_order
  before insert on public.projects
  for each row
  execute function public.assign_sort_order();

-- Transactional swap of two records' sort_order values. Runs as the invoking
-- role (RLS applies), verifies the caller owns the rows, and returns false
-- when either record does not exist for the user.
create or replace function public.swap_sort_order(
  p_table text,
  p_id_a uuid,
  p_id_b uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
as $$
declare
  order_a integer;
  order_b integer;
begin
  if p_table not in ('educations', 'experiences', 'projects') then
    raise exception 'invalid table name';
  end if;

  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  execute format(
    'select sort_order from %I where id = $1 and user_id = $2',
    p_table
  ) into order_a using p_id_a, p_user_id;

  execute format(
    'select sort_order from %I where id = $1 and user_id = $2',
    p_table
  ) into order_b using p_id_b, p_user_id;

  if order_a is null or order_b is null then
    return false;
  end if;

  execute format(
    'update %I set sort_order = $1 where id = $2 and user_id = $3',
    p_table
  ) using order_b, p_id_a, p_user_id;

  execute format(
    'update %I set sort_order = $1 where id = $2 and user_id = $3',
    p_table
  ) using order_a, p_id_b, p_user_id;

  return true;
end;
$$;

grant execute on function public.swap_sort_order(text, uuid, uuid, uuid) to authenticated;
