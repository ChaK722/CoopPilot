import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/route-guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Add Job",
};

export default async function AddJobPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Add a job</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a description to analyze it, or enter the details manually.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 3</CardTitle>
          <CardDescription>
            Job extraction, review, and manual entry arrive with the application management phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button href="/dashboard">Back to dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
