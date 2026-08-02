import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createAnalyticsService } from "@/features/analytics/analytics-service";
import { SummaryCards } from "@/features/analytics/summary-cards";
import { StatusChart } from "@/features/analytics/status-chart";
import { SubmissionsChart } from "@/features/analytics/submissions-chart";
import { SkillsChart } from "@/features/analytics/skills-chart";
import { AnalyticsErrorCard } from "@/features/analytics/analytics-error-card";
import { AppError } from "@/lib/errors";
import { todayDateString } from "@/lib/deadline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  let snapshot;
  try {
    snapshot = await createAnalyticsService(supabase).getSnapshot(user.id, todayDateString());
  } catch (error) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detailed breakdowns of your job search.
          </p>
        </header>
        <AnalyticsErrorCard message={error instanceof AppError ? error.safeMessage : undefined} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every value below is calculated from your persisted application data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Button>
          <Button variant="outline" href="/applications">
            Applications
          </Button>
        </div>
      </header>

      <SummaryCards summary={snapshot.summary} />

      <Card>
        <CardContent className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
            How these numbers are calculated
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li>
              Rates use an applied denominator: applications that ever reached Applied, Interview,
              Offer, Rejected, or Withdrawn based on status history. Saved and Preparing never enter
              it. When there are no applied applications, rates show —.
            </li>
            <li>
              Interviews and Offers count unique applications that ever reached that stage, even if
              the current status later became Rejected or Withdrawn.
            </li>
            <li>
              Submission dates use the stored date applied when present; otherwise the earliest
              applied-stage status event, converted to America/Toronto. Created dates are never used
              as a fallback.
            </li>
            <li>
              Upcoming deadlines cover Saved/Preparing applications with a deadline from today
              through today + 7 calendar days. Applications requiring action use only persisted
              rules: an expired unapplied deadline, or a deadline within 3 days.
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusChart counts={snapshot.status_counts} />
        <SubmissionsChart months={snapshot.submissions_over_time} />
      </div>

      <SkillsChart skills={snapshot.top_skills} />

      <p className="text-sm text-muted-foreground">
        Back to{" "}
        <Link
          href="/dashboard"
          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Dashboard
        </Link>{" "}
        or{" "}
        <Link
          href="/applications"
          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Applications
        </Link>
        .
      </p>
    </div>
  );
}
