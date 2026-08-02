"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        We could not load this page. Please try again, or log in to continue.
      </p>
      <div className="flex gap-3">
        <Button href="/login">Log in</Button>
        <Button variant="outline" href="/">
          Back to home
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Having trouble?{" "}
        <Link href="/signup" className="underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
