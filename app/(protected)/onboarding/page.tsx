import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/route-guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Set up your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Basic information, preferences, education, skills, experience, and projects.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 2</CardTitle>
          <CardDescription>
            The full profile editor is part of the next implementation phase. You can start adding
            jobs right away in the meantime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button href="/applications/new">Add your first job</Button>
        </CardContent>
      </Card>
    </div>
  );
}
