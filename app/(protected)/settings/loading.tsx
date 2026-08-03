import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading settings">
      <header>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </header>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
