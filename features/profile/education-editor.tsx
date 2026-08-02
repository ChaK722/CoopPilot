"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import { TagInput } from "@/features/profile/tag-input";
import { UnsavedChangesNotice } from "@/features/profile/unsaved-changes";
import {
  createEducation,
  deleteEducation,
  moveEducation,
  updateEducation,
} from "@/features/profile/profile-actions";
import { educationSchema, type EducationValues } from "@/lib/validation/profile";

export interface EducationRow {
  id: string;
  school: string;
  degree: string;
  program: string;
  start_date: string | null;
  expected_graduation_date: string | null;
  relevant_coursework: string[];
  sort_order: number;
}

const emptyForm = (): EducationValues => ({
  school: "",
  degree: "",
  program: "",
  start_date: "",
  expected_graduation_date: "",
  relevant_coursework: [],
});

const fromRow = (row: EducationRow): EducationValues => ({
  school: row.school,
  degree: row.degree,
  program: row.program,
  start_date: row.start_date ?? "",
  expected_graduation_date: row.expected_graduation_date ?? "",
  relevant_coursework: row.relevant_coursework ?? [],
});

export function EducationEditor({ initial }: { initial: EducationRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EducationValues>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EducationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dirty = editingId !== null;

  function set<K extends keyof EducationValues>(key: K, value: EducationValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startAdd() {
    setForm(emptyForm());
    setFormError(null);
    setEditingId("new");
  }

  function startEdit(row: EducationRow) {
    setForm(fromRow(row));
    setFormError(null);
    setEditingId(row.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setFormError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = educationSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    const result =
      editingId === "new"
        ? await createEducation(form)
        : editingId
          ? await updateEducation(editingId, form)
          : null;
    setBusy(false);
    if (!result?.ok) {
      setFormError(result?.error ?? "Could not save.");
      return;
    }
    toast(editingId === "new" ? "Education added." : "Education updated.", "success");
    setEditingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteEducation(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Education deleted.", "success");
    router.refresh();
  }

  async function move(row: EducationRow, direction: "up" | "down") {
    const result = await moveEducation(row.id, direction);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Education</CardTitle>
        <CardDescription>Add, edit, reorder, or remove education entries.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {initial.length === 0 && editingId === null ? (
          <p className="text-sm text-muted-foreground">
            No education added yet. Add your school to get started.
          </p>
        ) : null}
        <UnsavedChangesNotice dirty={dirty} />

        {initial.map((row, index) => (
          <div key={row.id} className="flex items-start gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {row.degree} — {row.school}
              </p>
              <p className="text-sm text-muted-foreground">{row.program}</p>
              {row.start_date || row.expected_graduation_date ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.start_date ?? "?"} → {row.expected_graduation_date ?? "present"}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "up")}
                disabled={index === 0}
                aria-label="Move education up"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "down")}
                disabled={index === initial.length - 1}
                aria-label="Move education down"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => startEdit(row)}
                aria-label={`Edit ${row.school}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingDelete(row)}
                aria-label={`Delete ${row.school}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}

        {editingId !== null ? (
          <form
            onSubmit={submit}
            noValidate
            className="flex flex-col gap-4 rounded-md border border-border bg-muted/30 p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {editingId === "new" ? "Add education" : "Edit education"}
              </h3>
              <button
                type="button"
                onClick={cancelEdit}
                aria-label="Cancel editing"
                className="rounded p-1 hover:bg-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="School" htmlFor="edu-school">
                <Input
                  id="edu-school"
                  value={form.school}
                  onChange={(e) => set("school", e.target.value)}
                />
              </FormField>
              <FormField label="Degree" htmlFor="edu-degree">
                <Input
                  id="edu-degree"
                  value={form.degree}
                  onChange={(e) => set("degree", e.target.value)}
                  placeholder="e.g. Bachelor of Computer Science"
                />
              </FormField>
              <FormField label="Program" htmlFor="edu-program">
                <Input
                  id="edu-program"
                  value={form.program}
                  onChange={(e) => set("program", e.target.value)}
                  placeholder="e.g. Computer Science"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start date" htmlFor="edu-start">
                  <Input
                    id="edu-start"
                    type="date"
                    value={form.start_date ?? ""}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </FormField>
                <FormField label="Graduation" htmlFor="edu-grad">
                  <Input
                    id="edu-grad"
                    type="date"
                    value={form.expected_graduation_date ?? ""}
                    onChange={(e) => set("expected_graduation_date", e.target.value)}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <TagInput
                  id="edu-coursework"
                  label="Relevant coursework"
                  value={form.relevant_coursework}
                  onChange={(next) => set("relevant_coursework", next)}
                  placeholder="e.g. Data Structures"
                />
              </div>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>
                {editingId === "new" ? "Add education" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={startAdd}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add education
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete education?"
        description={
          pendingDelete
            ? `This will permanently remove "${pendingDelete.degree} — ${pendingDelete.school}".`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
