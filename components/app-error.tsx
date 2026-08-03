"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The boundary renders a safe message only; technical details go to the
    // server log through Next.js, never to the user.
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            We could not load this page. Please try again.
          </p>
          {error.digest ? (
            <p className="mt-1 text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
