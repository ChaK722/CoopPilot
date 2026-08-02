import type { Metadata } from "next";
import Link from "next/link";
import { requireGuest } from "@/lib/auth/route-guards";
import { LoginForm } from "@/features/auth/login-form";
import { CoopPilotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage() {
  await requireGuest();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="CoopPilot home" className="rounded-md">
          <CoopPilotLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to continue your job search.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
