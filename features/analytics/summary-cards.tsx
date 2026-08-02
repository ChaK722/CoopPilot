"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Handshake,
  ListChecks,
  Percent,
  Target,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsSummary } from "@/features/analytics/analytics-types";

function RateValue({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <>
        <p className="text-3xl font-semibold">—</p>
        <CardDescription>No applied applications yet</CardDescription>
      </>
    );
  }
  return (
    <>
      <p className="text-3xl font-semibold">{value}%</p>
      <CardDescription>{label}</CardDescription>
    </>
  );
}

export function SummaryCards({ summary }: { summary: AnalyticsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Total applications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{summary.total}</p>
          <CardDescription>Not archived</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Active applications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{summary.active}</p>
          <CardDescription>Saved through Interview</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Handshake className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Interviews</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{summary.interviews}</p>
          <CardDescription>Applications that ever reached Interview</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Offers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{summary.offers}</p>
          <CardDescription>Applications that ever reached Offer</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Upcoming deadlines</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{summary.upcoming_deadlines}</p>
          <CardDescription>Next 7 days</CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Percent className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Interview rate</CardTitle>
        </CardHeader>
        <CardContent>
          <RateValue value={summary.interview_rate} label="Of applied applications" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <Target className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-medium">Offer rate</CardTitle>
        </CardHeader>
        <CardContent>
          <RateValue value={summary.offer_rate} label="Of applied applications" />
        </CardContent>
      </Card>
    </div>
  );
}
