"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/features/profile/dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog built on the shared accessible Dialog. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      footer={
        <>
          <Button data-autofocus variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="mt-3 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      </div>
    </Dialog>
  );
}
