"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorResultMessage } from "@/lib/errors";
import { Bot, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { analyzeJob } from "@/features/applications/application-actions";
import {
  emptyApplicationValues,
  ReviewForm,
  type ReviewInitial,
} from "@/features/applications/review-form";
import type { JobExtractionResult } from "@/features/ai/extraction-schema";
import type { ApplicationValues } from "@/lib/validation/applications";

function resultToValues(result: JobExtractionResult): ApplicationValues {
  return {
    company: result.company ?? "",
    job_title: result.job_title ?? "",
    location: result.location ?? "",
    country: result.country ?? "",
    work_arrangement: result.work_arrangement ?? "",
    employment_type: result.employment_type ?? "",
    work_term_duration: result.work_term_duration ?? "",
    deadline: result.deadline ?? "",
    salary_text: result.salary_text ?? "",
    education_requirements: result.education_requirements,
    years_of_experience: result.years_of_experience ?? "",
    posting_url: result.posting_url ?? "",
    original_description: result.original_description,
    responsibilities: result.responsibilities,
    qualifications: result.qualifications,
  };
}

export function AddJobFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<"analyze" | "review">("analyze");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewInitial, setReviewInitial] = useState<ReviewInitial | null>(null);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analyzing) return;
    setError(null);

    if (!description.trim()) {
      setError("Please paste a job description first.");
      return;
    }

    setAnalyzing(true);
    const result = await analyzeJob({ description, url }, crypto.randomUUID());
    setAnalyzing(false);

    if (!result.ok) {
      setError(errorResultMessage(result));
      return;
    }
    setReviewInitial({
      values: resultToValues(result.result),
      mode: result.result.mode,
    });
    setPhase("review");
  }

  function startManual() {
    setError(null);
    setReviewInitial({
      values: { ...emptyApplicationValues(), original_description: description.trim() },
    });
    setPhase("review");
  }

  if (phase === "review" && reviewInitial) {
    return (
      <ReviewForm
        initial={reviewInitial}
        onSaved={(id) => {
          router.replace(`/applications/${id}`);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            Analyze a job posting
          </CardTitle>
          <CardDescription>
            Paste the full posting text. Analysis runs in Demo Mode unless an AI key is configured,
            and never creates an application — you review before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAnalyze} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-description">Job description</Label>
              <Textarea
                id="job-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-44"
                placeholder="Paste the full job posting text here…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-url">
                Posting URL{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="job-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={analyzing}>
                {analyzing ? "Analyzing…" : "Analyze"}
              </Button>
              <Button type="button" variant="outline" onClick={startManual} disabled={analyzing}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Skip analysis, enter manually
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
