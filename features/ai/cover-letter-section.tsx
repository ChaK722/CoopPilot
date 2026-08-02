"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import {
  generateCoverLetter,
  restoreCoverLetterVersion,
  saveCoverLetterEdit,
} from "@/features/ai/ai-actions";

export interface CoverLetterRow {
  id: string;
  version: number;
  content_text: string | null;
  generation_mode: string;
  user_edited: boolean;
  created_at: string;
}

export function CoverLetterSection({
  applicationId,
  current,
  versions,
}: {
  applicationId: string;
  current: CoverLetterRow | null;
  versions: CoverLetterRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [content, setContent] = useState(current?.content_text ?? "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    const result = await generateCoverLetter(applicationId, crypto.randomUUID());
    setGenerating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Cover letter generated.", "success");
    router.refresh();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveCoverLetterEdit(applicationId, { content });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Cover letter saved as a new version.", "success");
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast("Copied to clipboard.", "success");
    } catch {
      toast("Could not copy to clipboard.", "error");
    }
  }

  async function handleRestore(version: number) {
    const result = await restoreCoverLetterVersion(applicationId, version);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast(`Restored version ${version}.`, "success");
    router.refresh();
  }

  if (!current) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Generate a cover letter from your profile and this job posting.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={handleGenerate} loading={generating}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {generating ? "Generating…" : "Generate cover letter"}
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">Demo AI Response</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Version {current.version} ·{" "}
          {current.generation_mode === "demo" ? "Demo AI Response" : "AI Response"} ·{" "}
          {current.user_edited ? "edited" : "generated"} ·{" "}
          {new Date(current.created_at).toLocaleString()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save edits
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (current.user_edited ? setRegenerateOpen(true) : void handleGenerate())}
            loading={generating}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Textarea
        aria-label="Cover letter"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="min-h-72 font-mono text-xs"
      />

      {versions.length > 1 ? (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Version history
          </p>
          <ul className="flex flex-wrap gap-2">
            {versions.map((version) => (
              <li key={version.id}>
                <Button
                  variant={version.version === current.version ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleRestore(version.version)}
                >
                  v{version.version}
                  {version.user_edited ? " (edited)" : ""}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={regenerateOpen}
        title="Regenerate cover letter?"
        description="You have edited the current version. Regenerating creates a new version and keeps your edited one."
        confirmLabel="Regenerate"
        busy={generating}
        onConfirm={() => {
          setRegenerateOpen(false);
          void handleGenerate();
        }}
        onCancel={() => setRegenerateOpen(false)}
      />
    </div>
  );
}
