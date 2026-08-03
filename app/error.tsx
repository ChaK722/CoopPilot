"use client";

import { AppErrorBoundary } from "@/components/app-error";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <AppErrorBoundary error={error} reset={reset} />
      </div>
    </div>
  );
}
