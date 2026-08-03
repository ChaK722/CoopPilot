"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { errorResultMessage } from "@/lib/errors";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import { formatDateTime } from "@/lib/dates";
import { createInterview, deleteInterview } from "@/features/applications/application-actions";

export interface InterviewRow {
  id: string;
  interview_type: string;
  scheduled_at: string;
  location_or_link: string | null;
  notes: string | null;
}

export function InterviewSection({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: InterviewRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [interviewType, setInterviewType] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [locationOrLink, setLocationOrLink] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InterviewRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!interviewType.trim() || !scheduledAt) {
      setError("Interview type and a date/time are required.");
      return;
    }
    setBusy(true);
    const result = await createInterview(applicationId, {
      interview_type: interviewType,
      scheduled_at: new Date(scheduledAt).toISOString(),
      location_or_link: locationOrLink,
      notes,
    });
    setBusy(false);
    if (!result.ok) {
      setError(errorResultMessage(result));
      return;
    }
    toast("Interview added.", "success");
    setAdding(false);
    setInterviewType("");
    setScheduledAt("");
    setLocationOrLink("");
    setNotes("");
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteInterview(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast(errorResultMessage(result), "error");
      return;
    }
    toast("Interview removed.", "success");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {initial.length === 0 ? (
        <p className="text-sm text-muted-foreground">No interviews scheduled yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {initial.map((interview) => (
            <li
              key={interview.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {interview.interview_type} —{" "}
                  <time dateTime={interview.scheduled_at}>
                    {formatDateTime(interview.scheduled_at)}
                  </time>
                </p>
                {interview.location_or_link ? (
                  <p className="break-words text-xs text-muted-foreground">
                    {interview.location_or_link}
                  </p>
                ) : null}
                {interview.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground">{interview.notes}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingDelete(interview)}
                aria-label={`Delete ${interview.interview_type} interview`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="interview-type">Interview type</Label>
              <Input
                id="interview-type"
                value={interviewType}
                onChange={(event) => setInterviewType(event.target.value)}
                placeholder="e.g. Behavioural"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="interview-time">Date and time</Label>
              <Input
                id="interview-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-location">
              Location or link{" "}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="interview-location"
              value={locationOrLink}
              onChange={(event) => setLocationOrLink(event.target.value)}
              placeholder="e.g. Zoom link or office address"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interview-notes">
              Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="interview-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Add interview
            </Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Add interview date
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete interview?"
        description={
          pendingDelete
            ? `This will permanently remove the ${pendingDelete.interview_type} interview.`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
