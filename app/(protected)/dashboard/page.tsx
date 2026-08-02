import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Briefcase, KanbanSquare, PlusCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { createAnalyticsService } from "@/features/analytics/analytics-service";
import { SummaryCards } from "@/features/analytics/summary-cards";
import { StatusChart } from "@/features/analytics/status-chart";
import { SubmissionsChart } from "@/features/analytics/submissions-chart";
import { ActionLists } from "@/features/analytics/action-lists";
import { AnalyticsErrorCard } from "@/features/analytics/analytics-error-card";
import { AppError } from "@/lib/errors";
import { todayDateString } from "@/lib/deadline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();

  let snapshot;
  try {
    snapshot = await createAnalyticsService(supabase).getSnapshot(user.id, todayDateString());
  } catch (error) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Summary metrics and action lists for your job search.
          </p>
        </header>
        <AnalyticsErrorCard message={error instanceof AppError ? error.safeMessage : undefined} />
      </div>
    );
  }

  const empty = snapshot.summary.total === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is what is happening with your job search.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href="/applications/new">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Add Job
          </Button>
          <Button variant="outline" href="/applications/board">
            <KanbanSquare className="h-4 w-4" aria-hidden="true" />
            Board
          </Button>
          <Button variant="outline" href="/applications">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
            Applications
          </Button>
          <Button variant="outline" href="/analytics">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            View analytics
          </Button>
        </div>
      </header>

      <SummaryCards summary={snapshot.summary} />

      {empty ? (
        <Card>
          <CardHeader>
            <CardTitle>Add your first job</CardTitle>
            <CardDescription>
              Paste a job description to extract the details, or enter them manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button href="/applications/new">
              Add your first job
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusChart counts={snapshot.status_counts} />
        <SubmissionsChart months={snapshot.submissions_over_time} />
      </div>

      <ActionLists
        upcoming={snapshot.upcoming_deadlines}
        recent={snapshot.recently_updated}
        action={snapshot.requiring_action}
      />

      <p className="text-sm text-muted-foreground">
        Interviews and Offers count applications that ever reached that stage, based on saved status
        history. See{" "}
        <Link
          href="/analytics"
          className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          detailed analytics
        </Link>{" "}
        for the full breakdown.
      </p>
    </div>
  );
}
