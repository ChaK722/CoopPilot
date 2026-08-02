"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import {
  archiveApplication,
  deleteApplication,
  duplicateApplication,
} from "@/features/applications/application-actions";

export function JobDetailActions({
  applicationId,
  archived = false,
}: {
  applicationId: string;
  archived?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

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

  async function handleArchive() {
    setArchiving(true);
    const result = await archiveApplication(applicationId);
    setArchiving(false);
    setArchiveOpen(false);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Application archived.", "success");
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
        {!archived ? (
          <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            Archive
          </Button>
        ) : null}
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
      <ConfirmDialog
        open={archiveOpen}
        title="Archive application?"
        description="Archived applications are hidden from the board and table. You can restore them anytime from the Archive page."
        confirmLabel="Archive"
        busy={archiving}
        onConfirm={handleArchive}
        onCancel={() => setArchiveOpen(false)}
      />
    </>
  );
}
