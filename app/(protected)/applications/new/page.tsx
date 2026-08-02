import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/route-guards";
import { AddJobFlow } from "@/features/applications/add-job-flow";

export const metadata: Metadata = {
  title: "Add Job",
};

export default async function AddJobPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Add a job</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste a description to analyze it, review every field, then save — or enter the details
          manually.
        </p>
      </header>
      <AddJobFlow />
    </div>
  );
}
