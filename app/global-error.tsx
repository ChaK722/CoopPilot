"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground">
        <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We could not load this page. Please try again.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
