import { ArrowRight, KanbanSquare, LayoutDashboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/supabase-server";

const features = [
  {
    icon: KanbanSquare,
    title: "Track every application",
    description:
      "Move jobs through a seven-stage lifecycle on a board you can use without drag-and-drop.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted, demo-first",
    description:
      "Extract job details, match analysis, cover letters, and interview prep — all without an API key.",
  },
  {
    icon: LayoutDashboard,
    title: "See progress",
    description: "Dashboards and analytics turn your application history into clear next steps.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  const primaryHref = user ? "/dashboard" : "/signup";
  const primaryLabel = user ? "Go to dashboard" : "Get started free";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <section className="flex flex-col items-start gap-6 py-16 sm:py-24">
        <p className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          For co-op and internship job seekers
        </p>
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
          Your job search, organized from first save to final offer.
        </h1>
        <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
          CoopPilot keeps your applications, deadlines, and preparation in one private place — and
          works fully in Demo Mode without an AI key.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button href={primaryHref}>
            {primaryLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" href="/login">
            Log in
          </Button>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3" aria-label="Features">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <feature.icon className="h-6 w-6 text-primary" aria-hidden="true" />
              <CardTitle className="mt-2">{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>
    </div>
  );
}
