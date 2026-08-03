"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorCard({
  title,
  message,
  reference,
}: {
  title: string;
  message?: string;
  reference?: string | null;
}) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-border bg-card p-4"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">
          {message ?? "Something went wrong. Please try again."}
        </p>
        {reference ? <p className="text-xs text-muted-foreground">Reference: {reference}</p> : null}
        <div>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
