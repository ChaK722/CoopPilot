import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { BasicInfoForm, type BasicProfileRow } from "@/features/profile/basic-info-form";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const basicRow: BasicProfileRow | null = profile
    ? {
        preferred_name: profile.preferred_name,
        phone: profile.phone,
        location: profile.location,
        linkedin_url: profile.linkedin_url,
        github_url: profile.github_url,
        website_url: profile.website_url,
        preferred_locations: profile.preferred_locations ?? [],
        remote_preference: profile.remote_preference,
        preferred_work_term_lengths: profile.preferred_work_term_lengths ?? [],
        target_roles: profile.target_roles ?? [],
        available_start_date: profile.available_start_date,
        onboarding_completed_at: profile.onboarding_completed_at,
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="text-sm text-muted-foreground">
          Only your preferred name is required. You can add education, skills, experience, and
          projects later from your profile.
        </p>
        {basicRow?.onboarding_completed_at ? (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            Onboarding complete
          </p>
        ) : null}
      </header>
      <BasicInfoForm initial={basicRow} mode="onboarding" />
      <p className="text-sm text-muted-foreground">
        Need more?{" "}
        <Link href="/profile" className="font-medium text-primary hover:underline">
          Manage your full profile
        </Link>{" "}
        anytime — or skip straight to{" "}
        <Link href="/applications/new" className="font-medium text-primary hover:underline">
          adding a job
        </Link>
        .
      </p>
    </div>
  );
}
