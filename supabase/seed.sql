-- CoopPilot demo seed (run by `supabase db seed` / `tinbase db reset`).
-- The demo account password is NOT stored here; the seed script assigns it.
-- On hosted Supabase this file is applied with elevated (service) privileges.

-- Demo profile: row is created by the on_auth_user_created trigger when the
-- seed script creates the demo user; this statement fills in realistic data.
insert into public.user_profiles (
  user_id,
  preferred_name,
  location,
  github_url,
  preferred_locations,
  remote_preference,
  preferred_work_term_lengths,
  target_roles,
  onboarding_completed_at
)
select
  u.id,
  'Demo User',
  'Waterloo, ON',
  'https://github.com/cooppilot-demo',
  array['Toronto, ON', 'Remote (Canada)'],
  'Remote or hybrid',
  array['4 months', '8 months'],
  array['Software Developer Intern', 'QA Engineer Co-op'],
  now()
from auth.users u
where u.email = 'demo@cooppilot.local'
on conflict (user_id) do update
set
  preferred_name = excluded.preferred_name,
  location = excluded.location,
  github_url = excluded.github_url,
  preferred_locations = excluded.preferred_locations,
  remote_preference = excluded.remote_preference,
  preferred_work_term_lengths = excluded.preferred_work_term_lengths,
  target_roles = excluded.target_roles,
  onboarding_completed_at = excluded.onboarding_completed_at,
  updated_at = now();
