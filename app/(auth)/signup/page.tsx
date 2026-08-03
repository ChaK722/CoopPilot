import type { Metadata } from "next";
import Link from "next/link";
import { requireGuest } from "@/lib/auth/route-guards";
import { SignUpForm } from "@/features/auth/signup-form";
import { CoopPilotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SkipLink } from "@/components/skip-link";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignUpPage() {
  await requireGuest();

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="CoopPilot home" className="rounded-md">
          <CoopPilotLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-8 outline-none focus:outline-none"
      >
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start tracking your job search in minutes.
          </p>
          <div className="mt-6">
            <SignUpForm />
          </div>
        </div>
      </main>
    </div>
  );
}
