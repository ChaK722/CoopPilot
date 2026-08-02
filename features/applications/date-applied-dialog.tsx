"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/features/profile/dialog";

export function DatePromptDialog({
  app,
  onConfirm,
  onSkip,
  onCancel,
}: {
  app: { id: string; company: string } | null;
  onConfirm: (date: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  // Board remounts this component per application id (key={app?.id}), so the
  // date state always starts empty and never leaks between applications.
  const [date, setDate] = useState("");

  return (
    <Dialog
      open={app !== null}
      title="When did you apply?"
      description={
        app
          ? `Optionally record the date you applied for ${app.company}. You can skip this.`
          : undefined
      }
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button onClick={() => onConfirm(date)} disabled={!date}>
            Save date
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="date-applied-prompt">Date applied</Label>
        <Input
          id="date-applied-prompt"
          data-autofocus
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
    </Dialog>
  );
}
