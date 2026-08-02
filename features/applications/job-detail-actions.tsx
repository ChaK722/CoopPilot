"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import {
  deleteApplication,
  duplicateApplication,
} from "@/features/applications/application-actions";

export function JobDetailActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDuplicate() {
    setDuplicating(true);
    const result = await duplicateApplication(applicationId);
    setDuplicating(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Application duplicated.", "success");
    router.replace(`/applications/${result.applicationId}`);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteApplication(applicationId);
    setDeleting(false);
    setConfirmOpen(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Application deleted.", "success");
    router.replace("/applications");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" href={`/applications/${applicationId}/edit`}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={handleDuplicate} loading={duplicating}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Duplicate
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete application?"
        description="This permanently deletes the application, its skills, status history, and interviews. This cannot be undone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
