import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProtectedNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-card p-4">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist or is not yours.
      </p>
      <div className="flex gap-3">
        <Button href="/applications">Applications</Button>
        <Button variant="outline" href="/dashboard">
          Dashboard
        </Button>
      </div>
      <Link href="/applications/new" className="text-sm text-primary underline">
        Add a job
      </Link>
    </div>
  );
}
