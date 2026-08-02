#!/usr/bin/env node
/**
 * Repeatable demo seed for Phase 1.
 *
 * Creates (or updates) a Demo user with a realistic profile. The password is
 * read from SEED_DEMO_PASSWORD; the script refuses to run without it so a
 * fixed credential is never shipped in a committed file.
 *
 * Usage:
 *   SEED_DEMO_PASSWORD=<password> node scripts/seed.mjs
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   (or SUPABASE_ANON_KEY), SUPABASE_SERVICE_ROLE_KEY
 *   SEED_DEMO_PASSWORD, SEED_DEMO_EMAIL (default demo@cooppilot.local)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const demoPassword = process.env.SEED_DEMO_PASSWORD?.trim();

const required = {
  "NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)": supabaseUrl,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)": supabaseAnonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  SEED_DEMO_PASSWORD: demoPassword,
};
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(
    `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      "Copy .env.example values into .env.local and set SEED_DEMO_PASSWORD.",
  );
  process.exit(1);
}

const placeholderValues = [supabaseUrl, supabaseAnonKey, serviceRoleKey, demoPassword].filter(
  (value) => value?.startsWith("replace-with-"),
);
if (placeholderValues.length > 0) {
  console.error(
    "Environment still contains .env.example placeholder values (replace-with-...). " +
      "Fill in real values in .env.local before seeding.",
  );
  process.exit(1);
}

const demoEmail = process.env.SEED_DEMO_EMAIL ?? "demo@cooppilot.local";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const { data: existing, error: lookupError } = await admin.auth.admin.listUsers();
  if (lookupError) {
    throw new Error(`Could not list users: ${lookupError.message}`);
  }

  const existingUser = existing.users.find((user) => user.email === demoEmail);
  let userId = existingUser?.id;

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { preferred_name: "Demo User" },
    });
    if (createError) {
      throw new Error(`Could not create demo user: ${createError.message}`);
    }
    userId = created.user.id;
    console.log(`Created demo user ${demoEmail} (${userId})`);
  } else {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: demoPassword,
    });
    if (updateError) {
      throw new Error(`Could not update demo password: ${updateError.message}`);
    }
    console.log(`Demo user ${demoEmail} already exists; password updated.`);
  }

  const profileData = {
    preferred_name: "Demo User",
    location: "Waterloo, ON",
    github_url: "https://github.com/cooppilot-demo",
    preferred_locations: ["Toronto, ON", "Remote (Canada)"],
    remote_preference: "Remote or hybrid",
    preferred_work_term_lengths: ["4 months", "8 months"],
    target_roles: ["Software Developer Intern", "QA Engineer Co-op"],
    onboarding_completed_at: new Date().toISOString(),
  };

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const { error: profileError } = existingProfile
    ? await admin.from("user_profiles").update(profileData).eq("id", existingProfile.id)
    : await admin.from("user_profiles").insert({ user_id: userId, ...profileData });

  if (profileError) {
    throw new Error(`Could not write demo profile: ${profileError.message}`);
  }
  console.log(`Demo profile ${existingProfile ? "updated" : "created"}.`);

  const education = await admin.from("educations").upsert(
    {
      id: "a0000000-0000-4000-8000-000000000001",
      user_id: userId,
      school: "University of Waterloo",
      degree: "Bachelor of Computer Science",
      program: "Computer Science (Co-op)",
      start_date: "2022-09-01",
      expected_graduation_date: "2027-04-30",
      relevant_coursework: ["Data Structures & Algorithms", "Databases", "Operating Systems"],
      sort_order: 0,
    },
    { onConflict: "id" },
  );
  if (education.error) throw new Error(`Could not seed education: ${education.error.message}`);

  const demoSkills = [
    ["programming_languages", "TypeScript", "typescript"],
    ["programming_languages", "Python", "python"],
    ["frameworks", "React", "react"],
    ["frameworks", "Next.js", "next.js"],
    ["cloud_platforms", "AWS", "aws"],
    ["tools", "Git", "git"],
    ["tools", "PostgreSQL", "postgresql"],
    ["concepts", "REST APIs", "rest apis"],
    ["concepts", "Data Structures & Algorithms", "data structures & algorithms"],
    ["spoken_languages", "English", "english"],
    ["spoken_languages", "Mandarin", "mandarin"],
  ];
  const skillsError = await admin.from("profile_skills").upsert(
    demoSkills.map(([category, name, normalized_name], index) => ({
      id: `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      user_id: userId,
      category,
      name,
      normalized_name,
    })),
    { onConflict: "id" },
  );
  if (skillsError.error) throw new Error(`Could not seed skills: ${skillsError.error.message}`);

  const experience = await admin.from("experiences").upsert(
    {
      id: "a0000000-0000-4000-8000-000000000002",
      user_id: userId,
      title: "Software Developer Intern",
      organization: "Demo Corp",
      location: "Remote",
      start_date: "2025-01-06",
      end_date: "2025-04-25",
      description: "Worked on web application features end-to-end.",
      bullet_points: [
        "Built a REST API used by 2,000+ users",
        "Shipped responsive UI improvements with React",
      ],
      sort_order: 0,
    },
    { onConflict: "id" },
  );
  if (experience.error) throw new Error(`Could not seed experience: ${experience.error.message}`);

  const project = await admin.from("projects").upsert(
    {
      id: "a0000000-0000-4000-8000-000000000003",
      user_id: userId,
      name: "CoopPilot",
      technologies: ["Next.js", "TypeScript", "Supabase"],
      start_date: "2026-05-01",
      end_date: null,
      description: "Personal job application companion.",
      bullet_points: ["Full RLS-backed multi-user data isolation"],
      github_url: "https://github.com/ChaK722/CoopPilot",
      demo_url: null,
      sort_order: 0,
    },
    { onConflict: "id" },
  );
  if (project.error) throw new Error(`Could not seed project: ${project.error.message}`);

  console.log("Demo education, skills, experience, and projects written.");

  const applications = [
    {
      id: "a0000000-0000-4000-8000-000000000101",
      creation_key: "b0000000-0000-4000-8000-000000000101",
      company: "Example Tech Inc.",
      job_title: "Software Developer Co-op",
      location: "Toronto, ON",
      country: "Canada",
      work_arrangement: "Hybrid",
      employment_type: "Co-op / Internship",
      work_term_duration: "4 months",
      deadline: "2026-09-15",
      salary_text: "Competitive hourly rate",
      education_requirements: ["Currently enrolled in a CS program"],
      years_of_experience: "0-2 years",
      posting_url: "https://example.com/careers/coop",
      original_description:
        "Example Tech Inc. is hiring a Software Developer Co-op for the fall term. You will build web features, collaborate with the team, and ship to production.",
      responsibilities: ["Build and maintain web application features"],
      qualifications: ["Experience with TypeScript or JavaScript"],
      status: "saved",
      skills: [
        ["required", "TypeScript"],
        ["required", "React"],
        ["preferred", "AWS"],
      ],
    },
    {
      id: "a0000000-0000-4000-8000-000000000102",
      creation_key: "b0000000-0000-4000-8000-000000000102",
      company: "Northwind Labs",
      job_title: "QA Automation Intern",
      location: "Remote (Canada)",
      country: "Canada",
      work_arrangement: "Remote",
      employment_type: "Internship",
      work_term_duration: "8 months",
      deadline: "2026-08-30",
      salary_text: "CAD 30/hr",
      education_requirements: [],
      years_of_experience: "0-1 years",
      posting_url: null,
      original_description:
        "Northwind Labs is looking for a QA Automation Intern to write and maintain end-to-end tests for our web platform.",
      responsibilities: ["Write and maintain end-to-end tests"],
      qualifications: ["Familiarity with Playwright or Cypress"],
      status: "applied",
      skills: [
        ["required", "Playwright"],
        ["preferred", "Python"],
      ],
    },
    {
      id: "a0000000-0000-4000-8000-000000000103",
      creation_key: "b0000000-0000-4000-8000-000000000103",
      company: "Maple Cloud Systems",
      job_title: "Backend Developer Co-op",
      location: "Waterloo, ON",
      country: "Canada",
      work_arrangement: "On-site",
      employment_type: "Co-op",
      work_term_duration: "4 months",
      deadline: "2026-08-20",
      salary_text: "Competitive",
      education_requirements: ["Second-year CS or related program"],
      years_of_experience: null,
      posting_url: "https://maplecloud.example.com/careers",
      original_description:
        "Maple Cloud Systems is hiring a Backend Developer Co-op to work on PostgreSQL-backed services and REST APIs.",
      responsibilities: ["Build REST APIs", "Optimize database queries"],
      qualifications: ["Experience with PostgreSQL", "Experience with Node.js"],
      status: "interview",
      skills: [
        ["required", "PostgreSQL"],
        ["required", "Node.js"],
        ["preferred", "Docker"],
      ],
    },
    {
      id: "a0000000-0000-4000-8000-000000000104",
      creation_key: "b0000000-0000-4000-8000-000000000104",
      company: "Stellar Robotics",
      job_title: "Full Stack Developer Co-op",
      location: "Ottawa, ON",
      country: "Canada",
      work_arrangement: "Hybrid",
      employment_type: "Co-op",
      work_term_duration: "4 months",
      deadline: "2026-07-01",
      salary_text: "CAD 32/hr",
      education_requirements: [],
      years_of_experience: "0-2 years",
      posting_url: null,
      original_description:
        "Stellar Robotics is hiring a Full Stack Developer Co-op to work on robotics dashboard tooling.",
      responsibilities: ["Build dashboard features"],
      qualifications: ["Experience with React"],
      status: "offer",
      skills: [],
    },
    {
      id: "a0000000-0000-4000-8000-000000000105",
      creation_key: "b0000000-0000-4000-8000-000000000105",
      company: "Cedar Bank",
      job_title: "Software Engineer Intern",
      location: "Vancouver, BC",
      country: "Canada",
      work_arrangement: "On-site",
      employment_type: "Internship",
      work_term_duration: "8 months",
      deadline: "2026-06-15",
      salary_text: null,
      education_requirements: [],
      years_of_experience: null,
      posting_url: "https://cedarbank.example.com/careers",
      original_description:
        "Cedar Bank is hiring a Software Engineer Intern for its payments platform team.",
      responsibilities: ["Support payments platform features"],
      qualifications: ["Java or TypeScript"],
      status: "rejected",
      skills: [],
    },
    {
      id: "a0000000-0000-4000-8000-000000000106",
      creation_key: "b0000000-0000-4000-8000-000000000106",
      company: "Lakeside Media",
      job_title: "Frontend Developer Co-op",
      location: "Remote (Canada)",
      country: "Canada",
      work_arrangement: "Remote",
      employment_type: "Co-op",
      work_term_duration: "4 months",
      deadline: "2026-08-01",
      salary_text: "CAD 28/hr",
      education_requirements: [],
      years_of_experience: "0-2 years",
      posting_url: null,
      original_description:
        "Lakeside Media is hiring a Frontend Developer Co-op to build streaming web experiences.",
      responsibilities: ["Build streaming UI components"],
      qualifications: ["Experience with TypeScript"],
      status: "withdrawn",
      skills: [],
    },
  ];

  let skillCounter = 0;
  let eventCounter = 0;

  for (const app of applications) {
    const { error: appError } = await admin.from("applications").upsert(
      {
        id: app.id,
        user_id: userId,
        creation_key: app.creation_key,
        company: app.company,
        job_title: app.job_title,
        location: app.location,
        country: app.country,
        work_arrangement: app.work_arrangement,
        employment_type: app.employment_type,
        work_term_duration: app.work_term_duration,
        deadline: app.deadline,
        salary_text: app.salary_text,
        education_requirements: app.education_requirements,
        years_of_experience: app.years_of_experience,
        posting_url: app.posting_url,
        original_description: app.original_description,
        responsibilities: app.responsibilities,
        qualifications: app.qualifications,
        status: app.status,
      },
      { onConflict: "id" },
    );
    if (appError) throw new Error(`Could not seed application: ${appError.message}`);

    for (const [skillIndex, [requirementType, name]] of app.skills.entries()) {
      skillCounter += 1;
      const { error: skillError } = await admin.from("application_skills").upsert(
        {
          id: `a0000000-0000-4000-8000-${String(1000 + skillCounter).padStart(12, "0")}`,
          user_id: userId,
          application_id: app.id,
          requirement_type: requirementType,
          name,
          normalized_name: name.toLowerCase(),
          sort_order: skillIndex,
        },
        { onConflict: "id" },
      );
      if (skillError) throw new Error(`Could not seed application skill: ${skillError.message}`);
    }

    const events = eventsForStatus(app.status);
    for (const [eventIndex, event] of events.entries()) {
      eventCounter += 1;
      const { error: eventError } = await admin.from("application_status_events").upsert(
        {
          id: `a0000000-0000-4000-8000-${String(2000 + eventCounter).padStart(12, "0")}`,
          user_id: userId,
          application_id: app.id,
          from_status: event.from_status,
          to_status: event.to_status,
          changed_at: new Date(Date.now() - (events.length - eventIndex) * 86400000).toISOString(),
        },
        { onConflict: "id" },
      );
      if (eventError) throw new Error(`Could not seed status event: ${eventError.message}`);
    }
  }

  const { error: interviewError } = await admin.from("interviews").upsert(
    {
      id: "a0000000-0000-4000-8000-000000000401",
      user_id: userId,
      application_id: "a0000000-0000-4000-8000-000000000103",
      interview_type: "Technical",
      scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      location_or_link: "https://meet.example.com/maplecloud",
      notes: "Two 45-minute rounds: coding + system design.",
    },
    { onConflict: "id" },
  );
  if (interviewError) throw new Error(`Could not seed interview: ${interviewError.message}`);

  console.log("Demo applications, skills, status history, and interviews written.");

  console.log("Seed complete. Log in with:");
  console.log(`  email:    ${demoEmail}`);
  console.log("  password: <SEED_DEMO_PASSWORD value>");
}

function eventsForStatus(status) {
  switch (status) {
    case "saved":
      return [{ from_status: null, to_status: "saved" }];
    case "preparing":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "preparing" },
      ];
    case "applied":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "applied" },
      ];
    case "interview":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "applied" },
        { from_status: "applied", to_status: "interview" },
      ];
    case "offer":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "applied" },
        { from_status: "applied", to_status: "interview" },
        { from_status: "interview", to_status: "offer" },
      ];
    case "rejected":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "applied" },
        { from_status: "applied", to_status: "rejected" },
      ];
    case "withdrawn":
      return [
        { from_status: null, to_status: "saved" },
        { from_status: "saved", to_status: "applied" },
        { from_status: "applied", to_status: "withdrawn" },
      ];
    default:
      return [{ from_status: null, to_status: "saved" }];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
