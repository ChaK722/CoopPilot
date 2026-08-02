import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/route-guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your basic information, preferences, and experiences.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 2</CardTitle>
          <CardDescription>
            The profile editor is part of the next implementation phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button href="/dashboard">Back to dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
