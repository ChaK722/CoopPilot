"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/dates";
import { generateMatchAnalysis } from "@/features/ai/ai-actions";

export interface MatchRow {
  id: string;
  overall_score: number;
  score_breakdown: {
    required_skills: { score: number; max: number; explanation: string };
    preferred_skills: { score: number; max: number; explanation: string };
    relevant_experience: { score: number; max: number; explanation: string };
    education: { score: number; max: number; explanation: string };
    location_availability: { score: number; max: number; explanation: string };
  };
  matching_skills: Array<{ name: string; evidence: string }>;
  missing_required_skills: string[];
  missing_preferred_skills: string[];
  matching_experience: Array<{ id: string; title: string; evidence: string }>;
  relevant_projects: Array<{ id: string; name: string; evidence: string }>;
  keywords: string[];
  suggestions: string[];
  generation_mode: string;
  generated_at: string;
}

export function MatchSection({
  applicationId,
  match,
  stale,
}: {
  applicationId: string;
  match: MatchRow | null;
  stale: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    const result = await generateMatchAnalysis(applicationId, crypto.randomUUID());
    setGenerating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Match analysis generated.", "success");
    router.refresh();
  }

  if (!match) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Generate a resume–job match analysis to see your score, skill gaps, and evidence.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={handleGenerate} loading={generating}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {generating ? "Analyzing…" : "Generate match analysis"}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">Demo AI Response</span>
        </div>
      </div>
    );
  }

  const breakdown = match.score_breakdown;
  const components: Array<{ label: string; score: number; max: number; explanation: string }> = [
    { label: "Required skills", ...breakdown.required_skills },
    { label: "Preferred skills", ...breakdown.preferred_skills },
    { label: "Relevant experience", ...breakdown.relevant_experience },
    { label: "Education", ...breakdown.education },
    { label: "Location & availability", ...breakdown.location_availability },
  ];

  return (
    <div className="flex flex-col gap-4">
      {stale ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Your profile or this job has changed since this analysis was generated. Regenerate for an
          updated result.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold">{match.overall_score}/100</p>
          <p className="text-xs text-muted-foreground">
            {match.generation_mode === "demo" ? "Demo AI Response" : "AI Response"} ·{" "}
            {formatDateTime(match.generated_at)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} loading={generating}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Regenerate
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {components.map((component) => (
          <div key={component.label}>
            <div className="flex justify-between text-xs">
              <span className="font-medium">{component.label}</span>
              <span className="text-muted-foreground">
                {component.score}/{component.max}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-secondary" aria-hidden="true">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.round((component.score / component.max) * 100)}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{component.explanation}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Matching skills
          </p>
          {match.matching_skills.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {match.matching_skills.map((skill) => (
                <li key={skill.name}>
                  <span className="font-medium">{skill.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">— {skill.evidence}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">None</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Missing required skills
            </p>
            {match.missing_required_skills.length > 0 ? (
              <p>{match.missing_required_skills.join(", ")}</p>
            ) : (
              <p className="text-muted-foreground">None</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Missing preferred skills
            </p>
            {match.missing_preferred_skills.length > 0 ? (
              <p>{match.missing_preferred_skills.join(", ")}</p>
            ) : (
              <p className="text-muted-foreground">None</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Matching experience
          </p>
          <ul className="flex flex-col gap-1">
            {match.matching_experience.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.title}</span>{" "}
                <span className="text-xs text-muted-foreground">— {item.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Relevant projects
          </p>
          <ul className="flex flex-col gap-1">
            {match.relevant_projects.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.name}</span>{" "}
                <span className="text-xs text-muted-foreground">— {item.evidence}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Keywords
          </p>
          <p className="text-muted-foreground">{match.keywords.join(", ") || "—"}</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggestions
          </p>
          <ul className="list-inside list-disc">
            {match.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
