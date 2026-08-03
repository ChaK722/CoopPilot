"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorResultMessage } from "@/lib/errors";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toast";
import { UnsavedChangesNotice } from "@/features/profile/unsaved-changes";
import { createApplication, updateApplication } from "@/features/applications/application-actions";
import { applicationSchema, type ApplicationValues } from "@/lib/validation/applications";

export interface ReviewSkill {
  requirement_type: "required" | "preferred";
  name: string;
}

export interface ReviewInitial {
  values: ApplicationValues;
  skills?: ReviewSkill[];
  mode?: "demo" | "external" | null;
}

export function emptyApplicationValues(): ApplicationValues {
  return {
    company: "",
    job_title: "",
    location: "",
    country: "",
    work_arrangement: "",
    employment_type: "",
    work_term_duration: "",
    deadline: "",
    salary_text: "",
    education_requirements: [],
    years_of_experience: "",
    posting_url: "",
    original_description: "",
    responsibilities: [],
    qualifications: [],
  };
}

interface ReviewFormProps {
  initial: ReviewInitial;
  applicationId?: string;
  onSaved?: (applicationId: string) => void;
}

export function ReviewForm({ initial, applicationId, onSaved }: ReviewFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<ApplicationValues>(initial.values);
  const [requiredSkills, setRequiredSkills] = useState<string[]>(
    initial.skills
      ?.filter((skill) => skill.requirement_type === "required")
      .map((skill) => skill.name) ?? [],
  );
  const [preferredSkills, setPreferredSkills] = useState<string[]>(
    initial.skills
      ?.filter((skill) => skill.requirement_type === "preferred")
      .map((skill) => skill.name) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creationKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "00000000-0000-4000-8000-000000000000",
  );

  const dirty = applicationId === undefined;

  function set<K extends keyof ApplicationValues>(key: K, value: ApplicationValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = applicationSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    const skills: ReviewSkill[] = [
      ...requiredSkills.map((name) => ({ requirement_type: "required" as const, name })),
      ...preferredSkills.map((name) => ({ requirement_type: "preferred" as const, name })),
    ];

    const result = applicationId
      ? await updateApplication(applicationId, parsed.data)
      : await createApplication({ ...parsed.data, creation_key: creationKey, skills });
    setSaving(false);

    if (!result.ok) {
      setError(errorResultMessage(result));
      return;
    }

    toast(applicationId ? "Application updated." : "Application saved.", "success");
    if (applicationId) {
      router.replace(`/applications/${applicationId}`);
      router.refresh();
    } else {
      const newId = (result as { applicationId?: string }).applicationId;
      if (newId) {
        if (onSaved) {
          onSaved(newId);
        } else {
          router.replace(`/applications/${newId}`);
          router.refresh();
        }
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {initial.mode === "demo" ? (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Demo AI Response — review and correct every field before saving.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Job details</CardTitle>
          <CardDescription>
            Review or enter the posting details. Company, job title, and the original description
            are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Company" htmlFor="app-company" required>
            <Input
              id="app-company"
              value={values.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </FormField>
          <FormField label="Job title" htmlFor="app-title" required>
            <Input
              id="app-title"
              value={values.job_title}
              onChange={(e) => set("job_title", e.target.value)}
            />
          </FormField>
          <FormField label="Location" htmlFor="app-location" optional>
            <Input
              id="app-location"
              value={values.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Toronto, ON"
            />
          </FormField>
          <FormField label="Country" htmlFor="app-country" optional>
            <Input
              id="app-country"
              value={values.country ?? ""}
              onChange={(e) => set("country", e.target.value)}
            />
          </FormField>
          <FormField label="Work arrangement" htmlFor="app-arrangement" optional>
            <Input
              id="app-arrangement"
              value={values.work_arrangement ?? ""}
              onChange={(e) => set("work_arrangement", e.target.value)}
              placeholder="Remote, Hybrid, On-site"
            />
          </FormField>
          <FormField label="Employment type" htmlFor="app-employment" optional>
            <Input
              id="app-employment"
              value={values.employment_type ?? ""}
              onChange={(e) => set("employment_type", e.target.value)}
              placeholder="Co-op / Internship"
            />
          </FormField>
          <FormField label="Work term duration" htmlFor="app-duration" optional>
            <Input
              id="app-duration"
              value={values.work_term_duration ?? ""}
              onChange={(e) => set("work_term_duration", e.target.value)}
              placeholder="e.g. 4 months"
            />
          </FormField>
          <FormField label="Deadline" htmlFor="app-deadline" optional>
            <Input
              id="app-deadline"
              type="date"
              value={values.deadline ?? ""}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </FormField>
          <FormField label="Salary text" htmlFor="app-salary" optional>
            <Input
              id="app-salary"
              value={values.salary_text ?? ""}
              onChange={(e) => set("salary_text", e.target.value)}
              placeholder="Preserve source wording"
            />
          </FormField>
          <FormField label="Years of experience" htmlFor="app-years" optional>
            <Input
              id="app-years"
              value={values.years_of_experience ?? ""}
              onChange={(e) => set("years_of_experience", e.target.value)}
              placeholder="e.g. 2+ years"
            />
          </FormField>
          <FormField label="Posting URL" htmlFor="app-url" optional>
            <Input
              id="app-url"
              type="url"
              value={values.posting_url ?? ""}
              onChange={(e) => set("posting_url", e.target.value)}
              placeholder="https://…"
            />
          </FormField>
          <div className="sm:col-span-2">
            <TagInput
              id="app-education"
              label="Education requirements"
              value={values.education_requirements}
              onChange={(next) => set("education_requirements", next)}
              placeholder="e.g. Currently enrolled in a CS program"
            />
          </div>
          <div className="sm:col-span-2">
            <TagInput
              id="app-responsibilities"
              label="Responsibilities"
              value={values.responsibilities}
              onChange={(next) => set("responsibilities", next)}
              placeholder="e.g. Build and maintain web features"
            />
          </div>
          <div className="sm:col-span-2">
            <TagInput
              id="app-qualifications"
              label="Qualifications"
              value={values.qualifications}
              onChange={(next) => set("qualifications", next)}
              placeholder="e.g. Experience with TypeScript"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            Optional; required and preferred skills are tracked separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TagInput
            id="app-required-skills"
            label="Required skills"
            value={requiredSkills}
            onChange={setRequiredSkills}
            placeholder="e.g. TypeScript"
          />
          <TagInput
            id="app-preferred-skills"
            label="Preferred skills"
            value={preferredSkills}
            onChange={setPreferredSkills}
            placeholder="e.g. AWS"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Original description</CardTitle>
          <CardDescription>
            The full posting text is always preserved with the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="app-description"
            value={values.original_description}
            onChange={(e) => set("original_description", e.target.value)}
            className="min-h-40"
          />
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving}>
          {saving ? "Saving…" : applicationId ? "Save changes" : "Save application"}
        </Button>
        <UnsavedChangesNotice dirty={dirty} />
      </div>
    </form>
  );
}

function FormField({
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
