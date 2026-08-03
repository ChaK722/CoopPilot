"use client";

import { AppErrorBoundary } from "@/components/app-error";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorBoundary error={error} reset={reset} />;
}
