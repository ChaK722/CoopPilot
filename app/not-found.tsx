import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or is not yours.
      </p>
      <div className="flex gap-3">
        <Button href="/dashboard">Go to Dashboard</Button>
        <Button variant="outline" href="/">
          Back to home
        </Button>
      </div>
      <Link href="/login" className="text-sm text-primary underline">
        Log in
      </Link>
    </div>
  );
}
