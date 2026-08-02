-- CoopPilot demo seed (run by `supabase db seed` / `tinbase db reset`).
-- The demo account password is NOT stored here; the seed script assigns it.
-- On hosted Supabase this file is applied with elevated (service) privileges.
-- The demo email below matches the seed script's SEED_DEMO_EMAIL default
-- (demo@cooppilot.local); change both together when customizing.

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
  {"category":"concepts","name":"Data Structures & Algorithms","normalized_name":"data structures & algorithms"},
  {"category":"spoken_languages","name":"English","normalized_name":"english"},
  {"category":"spoken_languages","name":"Mandarin","normalized_name":"mandarin"}
]'::jsonb) with ordinality as skill(item, ord)
where u.email = 'demo@cooppilot.local'
on conflict (user_id, category, normalized_name) do update
set category = excluded.category,
    name = excluded.name,
    normalized_name = excluded.normalized_name,
    id = excluded.id;

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

-- Phase 3 demo applications, skills, status history, and interviews.
-- Fixed ids keep the seed repeatable and idempotent.
insert into public.applications (
  id, user_id, creation_key, company, job_title, location, country,
  work_arrangement, employment_type, work_term_duration, deadline,
  salary_text, education_requirements, years_of_experience, posting_url,
  original_description, responsibilities, qualifications, status
)
select
  v.id,
  u.id,
  v.creation_key,
  v.company,
  v.job_title,
  v.location,
  v.country,
  v.work_arrangement,
  v.employment_type,
  v.work_term_duration,
  v.deadline,
  v.salary_text,
  v.education_requirements,
  v.years_of_experience,
  v.posting_url,
  v.original_description,
  v.responsibilities,
  v.qualifications,
  v.status
from auth.users u
cross join (
  values
    (
      'a0000000-0000-4000-8000-000000000101'::uuid,
      'b0000000-0000-4000-8000-000000000101'::uuid,
      'Example Tech Inc.', 'Software Developer Co-op', 'Toronto, ON', 'Canada',
      'Hybrid', 'Co-op / Internship', '4 months', '2026-09-15'::date,
      'Competitive hourly rate', array['Currently enrolled in a CS program'],
      '0-2 years', 'https://example.com/careers/coop',
      'Example Tech Inc. is hiring a Software Developer Co-op for the fall term.',
      array['Build and maintain web application features'],
      array['Experience with TypeScript or JavaScript'],
      'saved'
    ),
    (
      'a0000000-0000-4000-8000-000000000102'::uuid,
      'b0000000-0000-4000-8000-000000000102'::uuid,
      'Northwind Labs', 'QA Automation Intern', 'Remote (Canada)', 'Canada',
      'Remote', 'Internship', '8 months', '2026-08-30'::date,
      'CAD 30/hr', array[]::text[],
      '0-1 years', null,
      'Northwind Labs is looking for a QA Automation Intern to write end-to-end tests.',
      array['Write and maintain end-to-end tests'],
      array['Familiarity with Playwright or Cypress'],
      'applied'
    ),
    (
      'a0000000-0000-4000-8000-000000000103'::uuid,
      'b0000000-0000-4000-8000-000000000103'::uuid,
      'Maple Cloud Systems', 'Backend Developer Co-op', 'Waterloo, ON', 'Canada',
      'On-site', 'Co-op', '4 months', '2026-08-20'::date,
      'Competitive', array['Second-year CS or related program'],
      null, 'https://maplecloud.example.com/careers',
      'Maple Cloud Systems is hiring a Backend Developer Co-op for PostgreSQL-backed services.',
      array['Build REST APIs', 'Optimize database queries'],
      array['Experience with PostgreSQL', 'Experience with Node.js'],
      'interview'
    )
) as v(
  id, creation_key, company, job_title, location, country,
  work_arrangement, employment_type, work_term_duration, deadline,
  salary_text, education_requirements, years_of_experience, posting_url,
  original_description, responsibilities, qualifications, status
)
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set
  company = excluded.company,
  job_title = excluded.job_title,
  status = excluded.status,
  original_description = excluded.original_description,
  updated_at = now();

insert into public.application_skills (
  id, user_id, application_id, requirement_type, name, normalized_name, sort_order
)
select
  ('a0000000-0000-4000-8000-' || lpad((skill.item ->> 'id_num')::text, 12, '0'))::uuid,
  u.id,
  (skill.item ->> 'application_id')::uuid,
  (skill.item ->> 'requirement_type'),
  (skill.item ->> 'name'),
  lower((skill.item ->> 'name')),
  (skill.item ->> 'sort_order')::int
from auth.users u
cross join jsonb_array_elements('[
  {"id_num":1001,"application_id":"a0000000-0000-4000-8000-000000000101","requirement_type":"required","name":"TypeScript","sort_order":0},
  {"id_num":1002,"application_id":"a0000000-0000-4000-8000-000000000101","requirement_type":"required","name":"React","sort_order":1},
  {"id_num":1003,"application_id":"a0000000-0000-4000-8000-000000000101","requirement_type":"preferred","name":"AWS","sort_order":2},
  {"id_num":1004,"application_id":"a0000000-0000-4000-8000-000000000102","requirement_type":"required","name":"Playwright","sort_order":0},
  {"id_num":1005,"application_id":"a0000000-0000-4000-8000-000000000102","requirement_type":"preferred","name":"Python","sort_order":1},
  {"id_num":1006,"application_id":"a0000000-0000-4000-8000-000000000103","requirement_type":"required","name":"PostgreSQL","sort_order":0},
  {"id_num":1007,"application_id":"a0000000-0000-4000-8000-000000000103","requirement_type":"required","name":"Node.js","sort_order":1},
  {"id_num":1008,"application_id":"a0000000-0000-4000-8000-000000000103","requirement_type":"preferred","name":"Docker","sort_order":2}
]'::jsonb) as skill(item)
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set requirement_type = excluded.requirement_type,
    name = excluded.name,
    normalized_name = excluded.normalized_name;

insert into public.application_status_events (
  id, user_id, application_id, from_status, to_status, changed_at
)
select
  ('a0000000-0000-4000-8000-' || lpad((ev.item ->> 'id_num')::text, 12, '0'))::uuid,
  u.id,
  (ev.item ->> 'application_id')::uuid,
  (ev.item ->> 'from_status'),
  (ev.item ->> 'to_status'),
  now() - ((6 - (ev.item ->> 'seq')::int) * interval '1 day')
from auth.users u
cross join jsonb_array_elements('[
  {"id_num":2001,"application_id":"a0000000-0000-4000-8000-000000000101","from_status":null,"to_status":"saved","seq":1},
  {"id_num":2002,"application_id":"a0000000-0000-4000-8000-000000000102","from_status":null,"to_status":"saved","seq":2},
  {"id_num":2003,"application_id":"a0000000-0000-4000-8000-000000000102","from_status":"saved","to_status":"applied","seq":3},
  {"id_num":2004,"application_id":"a0000000-0000-4000-8000-000000000103","from_status":null,"to_status":"saved","seq":4},
  {"id_num":2005,"application_id":"a0000000-0000-4000-8000-000000000103","from_status":"saved","to_status":"applied","seq":5},
  {"id_num":2006,"application_id":"a0000000-0000-4000-8000-000000000103","from_status":"applied","to_status":"interview","seq":6}
]'::jsonb) as ev(item)
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set from_status = excluded.from_status,
    to_status = excluded.to_status,
    changed_at = excluded.changed_at;

insert into public.interviews (
  id, user_id, application_id, interview_type, scheduled_at,
  location_or_link, notes
)
select
  'a0000000-0000-4000-8000-000000000401',
  u.id,
  'a0000000-0000-4000-8000-000000000103',
  'Technical',
  now() + interval '3 days',
  'https://meet.example.com/maplecloud',
  'Two 45-minute rounds: coding + system design.'
from auth.users u
where u.email = 'demo@cooppilot.local'
on conflict (id) do update
set interview_type = excluded.interview_type,
    scheduled_at = excluded.scheduled_at,
    location_or_link = excluded.location_or_link,
    notes = excluded.notes,
    updated_at = now();
