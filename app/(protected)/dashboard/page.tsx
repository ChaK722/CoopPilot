import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, Rocket } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, preferred_name, onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboardingDone = profile?.onboarding_completed_at != null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Welcome{profile?.preferred_name ? `, ${profile.preferred_name}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here is what is happening with your job search.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" aria-hidden="true" />
            Your applications
          </CardTitle>
          <CardDescription>
            You have not saved any applications yet. Add your first job posting to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button href="/applications/new">
            Add Job
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {!onboardingDone ? (
            <Button variant="outline" href="/onboarding">
              <Rocket className="h-4 w-4" aria-hidden="true" />
              Complete onboarding
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a job</CardTitle>
            <CardDescription>
              Paste a job description to extract the details, or enter them manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/applications/new"
              className="text-sm font-medium text-primary hover:underline"
            >
              Add your first job
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Set up your profile</CardTitle>
            <CardDescription>
              A complete profile powers match analysis and cover letters later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className="text-sm font-medium text-primary hover:underline">
              {onboardingDone ? "Edit your profile" : "Complete onboarding"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
