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
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   SEED_DEMO_PASSWORD, SEED_DEMO_EMAIL (default demo@cooppilot.local)
 */

import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SEED_DEMO_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
      "Copy .env.example values into .env.local and set SEED_DEMO_PASSWORD.",
  );
  process.exit(1);
}

const demoEmail = process.env.SEED_DEMO_EMAIL ?? "demo@cooppilot.local";
const demoPassword = process.env.SEED_DEMO_PASSWORD;

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
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

  console.log("Seed complete. Log in with:");
  console.log(`  email:    ${demoEmail}`);
  console.log("  password: <SEED_DEMO_PASSWORD value>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
