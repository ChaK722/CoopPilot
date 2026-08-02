"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootErrorPage({
  error,
}: {
  error: Error & { digest?: string; safeMessage?: string };
  reset: () => void;
}) {
  const isConfigError = typeof error.safeMessage === "string" && error.safeMessage.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <h1 className="text-xl font-semibold">
        {isConfigError ? "Configuration error" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {isConfigError ? error.safeMessage : "We could not load this page. Please try again."}
      </p>
      {!isConfigError ? (
        <div className="flex gap-3">
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
