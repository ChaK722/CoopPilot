import { Skeleton } from "@/components/ui/skeleton";

export function ShellLoading() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border p-4 lg:block">
        <Skeleton className="h-8 w-32" />
        <div className="mt-8 flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </aside>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </main>
    </div>
  );
}
