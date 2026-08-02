"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { TagInput } from "@/features/profile/tag-input";
import { completeOnboarding, saveBasicInfo } from "@/features/profile/profile-actions";
import { profileBasicSchema, type ProfileBasicValues } from "@/lib/validation/profile";

export interface BasicProfileRow {
  preferred_name: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  preferred_locations: string[];
  remote_preference: string | null;
  preferred_work_term_lengths: string[];
  target_roles: string[];
  available_start_date: string | null;
  onboarding_completed_at: string | null;
}

interface BasicInfoFormProps {
  initial: BasicProfileRow | null;
  mode: "onboarding" | "profile";
}

const empty = (row: BasicProfileRow | null): ProfileBasicValues => ({
  preferred_name: row?.preferred_name ?? "",
  phone: row?.phone ?? "",
  location: row?.location ?? "",
  linkedin_url: row?.linkedin_url ?? "",
  github_url: row?.github_url ?? "",
  website_url: row?.website_url ?? "",
  preferred_locations: row?.preferred_locations ?? [],
  remote_preference: row?.remote_preference ?? "",
  preferred_work_term_lengths: row?.preferred_work_term_lengths ?? [],
  target_roles: row?.target_roles ?? [],
  available_start_date: row?.available_start_date ?? "",
});

const REMOTE_OPTIONS = ["", "On-site", "Hybrid", "Remote", "Any"];

export function BasicInfoForm({ initial, mode }: BasicInfoFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<ProfileBasicValues>(() => empty(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ProfileBasicValues>(key: K, value: ProfileBasicValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = profileBasicSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    const result =
      mode === "onboarding" ? await completeOnboarding(values) : await saveBasicInfo(values);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast(mode === "onboarding" ? "Profile set up. Welcome aboard!" : "Profile saved.", "success");
    router.refresh();
    if (mode === "onboarding") {
      router.replace("/dashboard");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
          <CardDescription>
            {mode === "onboarding"
              ? "Your name is required. Everything else can be completed later."
              : "Only your preferred name is required; the rest is optional."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred name" htmlFor="preferred-name" required>
            <Input
              id="preferred-name"
              autoComplete="name"
              value={values.preferred_name}
              onChange={(event) => set("preferred_name", event.target.value)}
              invalid={error !== null && values.preferred_name.trim() === ""}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" optional>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={values.phone ?? ""}
              onChange={(event) => set("phone", event.target.value)}
            />
          </Field>
          <Field label="Location" htmlFor="location" optional>
            <Input
              id="location"
              autoComplete="address-level2"
              value={values.location ?? ""}
              onChange={(event) => set("location", event.target.value)}
              placeholder="e.g. Waterloo, ON"
            />
          </Field>
          <Field label="LinkedIn URL" htmlFor="linkedin-url" optional>
            <Input
              id="linkedin-url"
              type="url"
              value={values.linkedin_url ?? ""}
              onChange={(event) => set("linkedin_url", event.target.value)}
              placeholder="https://linkedin.com/in/you"
            />
          </Field>
          <Field label="GitHub URL" htmlFor="github-url" optional>
            <Input
              id="github-url"
              type="url"
              value={values.github_url ?? ""}
              onChange={(event) => set("github_url", event.target.value)}
              placeholder="https://github.com/you"
            />
          </Field>
          <Field label="Website URL" htmlFor="website-url" optional>
            <Input
              id="website-url"
              type="url"
              value={values.website_url ?? ""}
              onChange={(event) => set("website_url", event.target.value)}
              placeholder="https://yoursite.dev"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job search preferences</CardTitle>
          <CardDescription>All preferences are optional.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remote-preference">Remote preference</Label>
            <select
              id="remote-preference"
              value={values.remote_preference ?? ""}
              onChange={(event) => set("remote_preference", event.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REMOTE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "" ? "No preference" : option}
                </option>
              ))}
            </select>
          </div>
          <Field label="Available start date" htmlFor="available-start-date" optional>
            <Input
              id="available-start-date"
              type="date"
              value={values.available_start_date ?? ""}
              onChange={(event) => set("available_start_date", event.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <TagInput
              id="preferred-locations"
              label="Preferred locations"
              value={values.preferred_locations}
              onChange={(next) => set("preferred_locations", next)}
              placeholder="e.g. Toronto, ON"
            />
          </div>
          <div className="sm:col-span-2">
            <TagInput
              id="work-term-lengths"
              label="Preferred work term lengths"
              value={values.preferred_work_term_lengths}
              onChange={(next) => set("preferred_work_term_lengths", next)}
              placeholder="e.g. 4 months"
            />
          </div>
          <div className="sm:col-span-2">
            <TagInput
              id="target-roles"
              label="Target roles"
              value={values.target_roles}
              onChange={(next) => set("target_roles", next)}
              placeholder="e.g. Software Developer Intern"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving}>
          {saving ? "Saving…" : mode === "onboarding" ? "Finish onboarding" : "Save profile"}
        </Button>
        {mode === "onboarding" && initial?.onboarding_completed_at ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Onboarding already complete
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : optional ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
