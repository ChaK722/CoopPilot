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

  console.log("Seed complete. Log in with:");
  console.log(`  email:    ${demoEmail}`);
  console.log("  password: <SEED_DEMO_PASSWORD value>");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
