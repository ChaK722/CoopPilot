"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateInterviewPrep } from "@/features/ai/ai-actions";

export interface PrepQuestion {
  question: string;
  why: string;
  relevant_experience: string;
  outline?: string;
}

export interface PrepRow {
  id: string;
  version: number;
  content_json: { questions?: PrepQuestion[]; items?: string[] } | null;
  generation_mode: string;
  created_at: string;
}

export function InterviewPrepSection({
  applicationId,
  behavioural,
  technical,
  research,
}: {
  applicationId: string;
  behavioural: PrepRow | null;
  technical: PrepRow | null;
  research: PrepRow | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    const result = await generateInterviewPrep(applicationId, crypto.randomUUID());
    setGenerating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Interview preparation generated.", "success");
    router.refresh();
  }

  if (!behavioural && !technical && !research) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Generate behavioural questions, technical questions, and a research checklist for this
          application.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={handleGenerate} loading={generating}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {generating ? "Generating…" : "Generate interview prep"}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">Demo AI Response</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {behavioural?.generation_mode === "demo" ? "Demo AI Response" : "AI Response"} ·{" "}
          {behavioural?.created_at ? new Date(behavioural.created_at).toLocaleString() : ""}
        </p>
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

      <QuestionBlock
        title="Behavioural questions"
        questions={behavioural?.content_json?.questions ?? []}
      />
      <QuestionBlock
        title="Technical questions"
        questions={technical?.content_json?.questions ?? []}
      />
      <div>
        <p className="mb-2 text-sm font-semibold">Research checklist</p>
        <ul className="list-inside list-disc text-sm">
          {(research?.content_json?.items ?? []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function QuestionBlock({ title, questions }: { title: string; questions: PrepQuestion[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not generated.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {questions.map((question, index) => (
            <li
              key={`${question.question}-${index}`}
              className="rounded-md border border-border p-3 text-sm"
            >
              <p className="font-medium">{question.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">Why: {question.why}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Example: {question.relevant_experience}
              </p>
              {question.outline ? (
                <p className="mt-1 text-xs text-muted-foreground">Outline: {question.outline}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
