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

-- Phase 2 demo records. Fixed ids keep the seed repeatable and idempotent.
insert into public.educations (
  id, user_id, school, degree, program, start_date,
  expected_graduation_date, relevant_coursework, sort_order
)
select
  'a0000000-0000-4000-8000-000000000001',
  u.id,
  'University of Waterloo',
  'Bachelor of Computer Science',
  'Computer Science (Co-op)',
  '2022-09-01',
  '2027-04-30',
  array['Data Structures & Algorithms', 'Databases', 'Operating Systems'],
  0
from auth.users u
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set
  school = excluded.school,
  degree = excluded.degree,
  program = excluded.program,
  start_date = excluded.start_date,
  expected_graduation_date = excluded.expected_graduation_date,
  relevant_coursework = excluded.relevant_coursework,
  updated_at = now();

insert into public.profile_skills (
  id, user_id, category, name, normalized_name
)
select
  ('a0000000-0000-4000-8000-' || lpad((skill.ord - 1)::text, 12, '0'))::uuid,
  u.id,
  (skill.item ->> 'category'),
  (skill.item ->> 'name'),
  (skill.item ->> 'normalized_name')
from auth.users u
cross join jsonb_array_elements('[
  {"category":"programming_languages","name":"TypeScript","normalized_name":"typescript"},
  {"category":"programming_languages","name":"Python","normalized_name":"python"},
  {"category":"frameworks","name":"React","normalized_name":"react"},
  {"category":"frameworks","name":"Next.js","normalized_name":"next.js"},
  {"category":"cloud_platforms","name":"AWS","normalized_name":"aws"},
  {"category":"tools","name":"Git","normalized_name":"git"},
  {"category":"tools","name":"PostgreSQL","normalized_name":"postgresql"},
  {"category":"concepts","name":"REST APIs","normalized_name":"rest apis"},
  {"category":"spoken_languages","name":"English","normalized_name":"english"},
  {"category":"spoken_languages","name":"Mandarin","normalized_name":"mandarin"}
]'::jsonb) with ordinality as skill(item, ord)
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set category = excluded.category,
    name = excluded.name,
    normalized_name = excluded.normalized_name;

insert into public.experiences (
  id, user_id, title, organization, location, start_date, end_date,
  description, bullet_points, sort_order
)
select
  'a0000000-0000-4000-8000-000000000002',
  u.id,
  'Software Developer Intern',
  'Demo Corp',
  'Remote',
  '2025-01-06',
  '2025-04-25',
  'Worked on web application features end-to-end.',
  array['Built a REST API used by 2,000+ users', 'Shipped responsive UI improvements with React'],
  0
from auth.users u
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set
  title = excluded.title,
  organization = excluded.organization,
  location = excluded.location,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  description = excluded.description,
  bullet_points = excluded.bullet_points,
  updated_at = now();

insert into public.projects (
  id, user_id, name, technologies, start_date, end_date,
  description, bullet_points, github_url, demo_url, sort_order
)
select
  'a0000000-0000-4000-8000-000000000003',
  u.id,
  'CoopPilot',
  array['Next.js', 'TypeScript', 'Supabase'],
  '2026-05-01',
  null,
  'Personal job application companion.',
  array['Full RLS-backed multi-user data isolation'],
  'https://github.com/ChaK722/CoopPilot',
  null,
  0
from auth.users u
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set
  name = excluded.name,
  technologies = excluded.technologies,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  description = excluded.description,
  bullet_points = excluded.bullet_points,
  github_url = excluded.github_url,
  demo_url = excluded.demo_url,
  updated_at = now();
