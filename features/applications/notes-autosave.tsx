"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { saveApplicationNotes } from "@/features/applications/application-actions";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NotesAutosave({
  applicationId,
  initialNotes,
}: {
  applicationId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setNotes(value);
    setStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const result = await saveApplicationNotes(applicationId, value);
      if (!result.ok) {
        setStatus("error");
        return;
      }
      lastSavedRef.current = value;
      setStatus(value === lastSavedRef.current ? "saved" : "saving");
    }, 800);
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="application-notes"
        aria-label="Notes"
        value={notes}
        onChange={(event) => handleChange(event.target.value)}
        className="min-h-28"
        placeholder="Jot down anything about this application…"
        aria-describedby="notes-status"
      />
      <p id="notes-status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {status === "saving" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : status === "saved" ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            Saved
          </>
        ) : status === "error" ? (
          <>
            <TriangleAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            Could not save — check your connection and try again
          </>
        ) : null}
      </p>
    </div>
  );
}
