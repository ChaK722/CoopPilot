"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/lib/validation/applications";
import type { ApplicationSortField } from "@/features/applications/application-service";

const SORT_FIELDS: Array<{ value: ApplicationSortField; label: string }> = [
  { value: "updated_at", label: "Last updated" },
  { value: "created_at", label: "Date added" },
  { value: "company", label: "Company" },
  { value: "job_title", label: "Job title" },
  { value: "location", label: "Location" },
  { value: "deadline", label: "Deadline" },
  { value: "date_applied", label: "Date applied" },
  { value: "status", label: "Status" },
];

function buildQuery(updates: Record<string, string | null>): string {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/applications?${qs}` : "/applications";
}

export function FiltersBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = new URLSearchParams(window.location.search).get("search") ?? "";
      if (search !== current) {
        router.push(buildQuery({ search: search || null }));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, router]);

  const statuses = (searchParams.get("status") ?? "").split(",").filter(Boolean);
  const company = searchParams.get("company") ?? "";
  const location = searchParams.get("location") ?? "";
  const workArrangement = searchParams.get("arrangement") ?? "";
  const requiredSkill = searchParams.get("skill") ?? "";
  const deadlineFrom = searchParams.get("deadlineFrom") ?? "";
  const deadlineTo = searchParams.get("deadlineTo") ?? "";
  const archive = searchParams.get("archive") ?? "active";
  const sortBy = searchParams.get("sort") ?? "updated_at";
  const sortAsc = searchParams.get("dir") === "asc";

  function toggleStatus(status: string) {
    const next = statuses.includes(status)
      ? statuses.filter((item) => item !== status)
      : [...statuses, status];
    router.push(buildQuery({ status: next.length > 0 ? next.join(",") : null }));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="filter-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="filter-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Company, title, notes, or skill"
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-company">Company</Label>
          <Input
            id="filter-company"
            value={company}
            onChange={(event) => router.push(buildQuery({ company: event.target.value || null }))}
            placeholder="Any company"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-location">Location</Label>
          <Input
            id="filter-location"
            value={location}
            onChange={(event) => router.push(buildQuery({ location: event.target.value || null }))}
            placeholder="Any location"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-arrangement">Arrangement</Label>
          <Input
            id="filter-arrangement"
            value={workArrangement}
            onChange={(event) =>
              router.push(buildQuery({ arrangement: event.target.value || null }))
            }
            placeholder="Remote, Hybrid…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-skill">Required skill</Label>
          <Input
            id="filter-skill"
            value={requiredSkill}
            onChange={(event) => router.push(buildQuery({ skill: event.target.value || null }))}
            placeholder="e.g. TypeScript"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-2">
            {APPLICATION_STATUSES.map((status) => {
              const checked = statuses.includes(status);
              return (
                <label
                  key={status}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    checked ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleStatus(status)}
                  />
                  {APPLICATION_STATUS_LABELS[status]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-deadline-from">Deadline from</Label>
          <Input
            id="filter-deadline-from"
            type="date"
            value={deadlineFrom}
            onChange={(event) =>
              router.push(buildQuery({ deadlineFrom: event.target.value || null }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-deadline-to">Deadline to</Label>
          <Input
            id="filter-deadline-to"
            type="date"
            value={deadlineTo}
            onChange={(event) =>
              router.push(buildQuery({ deadlineTo: event.target.value || null }))
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-archive">Archive state</Label>
          <select
            id="filter-archive"
            value={archive}
            onChange={(event) => router.push(buildQuery({ archive: event.target.value || null }))}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
          >
            <option value="active">Active only</option>
            <option value="archived">Archived only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-sort">Sort by</Label>
          <div className="flex gap-2">
            <select
              id="filter-sort"
              value={sortBy}
              onChange={(event) => router.push(buildQuery({ sort: event.target.value }))}
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
            >
              {SORT_FIELDS.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => router.push(buildQuery({ dir: sortAsc ? "desc" : "asc" }))}
              aria-label={sortAsc ? "Sort descending" : "Sort ascending"}
            >
              {sortAsc ? "↑" : "↓"}
            </Button>
          </div>
        </div>
        <Button variant="ghost" onClick={() => router.push("/applications")} className="sm:ml-auto">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset filters
        </Button>
      </div>
    </div>
  );
}
