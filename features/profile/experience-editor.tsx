"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import { TagInput } from "@/features/profile/tag-input";
import {
  createExperience,
  deleteExperience,
  moveExperience,
  updateExperience,
} from "@/features/profile/profile-actions";
import { experienceSchema, type ExperienceValues } from "@/lib/validation/profile";

export interface ExperienceRow {
  id: string;
  title: string;
  organization: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  bullet_points: string[];
  sort_order: number;
}

const emptyForm = (): ExperienceValues => ({
  title: "",
  organization: "",
  location: "",
  start_date: "",
  end_date: "",
  description: "",
  bullet_points: [],
});

const fromRow = (row: ExperienceRow): ExperienceValues => ({
  title: row.title,
  organization: row.organization,
  location: row.location ?? "",
  start_date: row.start_date ?? "",
  end_date: row.end_date ?? "",
  description: row.description ?? "",
  bullet_points: row.bullet_points ?? [],
});

export function ExperienceEditor({ initial }: { initial: ExperienceRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExperienceValues>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExperienceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function set<K extends keyof ExperienceValues>(key: K, value: ExperienceValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startAdd() {
    setForm(emptyForm());
    setFormError(null);
    setEditingId("new");
  }

  function startEdit(row: ExperienceRow) {
    setForm(fromRow(row));
    setFormError(null);
    setEditingId(row.id);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = experienceSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    const result =
      editingId === "new"
        ? await createExperience(form)
        : editingId
          ? await updateExperience(editingId, form)
          : null;
    setBusy(false);
    if (!result?.ok) {
      setFormError(result?.error ?? "Could not save.");
      return;
    }
    toast(editingId === "new" ? "Experience added." : "Experience updated.", "success");
    setEditingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteExperience(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    toast("Experience deleted.", "success");
    router.refresh();
  }

  async function move(row: ExperienceRow, direction: "up" | "down") {
    const result = await moveExperience(row.id, direction);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work experience</CardTitle>
        <CardDescription>Add, edit, reorder, or remove work experience entries.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {initial.length === 0 && editingId === null ? (
          <p className="text-sm text-muted-foreground">
            No experience added yet. Add your first role to get started.
          </p>
        ) : null}

        {initial.map((row, index) => (
          <div key={row.id} className="flex items-start gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.organization}</p>
              {row.start_date || row.end_date ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.start_date ?? "?"} → {row.end_date ?? "present"}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "up")}
                disabled={index === 0}
                aria-label="Move experience up"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "down")}
                disabled={index === initial.length - 1}
                aria-label="Move experience down"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => startEdit(row)}
                aria-label={`Edit ${row.title}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingDelete(row)}
                aria-label={`Delete ${row.title}`}
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
                {editingId === "new" ? "Add experience" : "Edit experience"}
              </h3>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                aria-label="Cancel editing"
                className="rounded p-1 hover:bg-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Title" htmlFor="exp-title">
                <Input
                  id="exp-title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Software Developer Intern"
                />
              </FormField>
              <FormField label="Organization" htmlFor="exp-org">
                <Input
                  id="exp-org"
                  value={form.organization}
                  onChange={(e) => set("organization", e.target.value)}
                  placeholder="e.g. Acme Inc."
                />
              </FormField>
              <FormField label="Location" htmlFor="exp-location" optional>
                <Input
                  id="exp-location"
                  value={form.location ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. Toronto, ON"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start date" htmlFor="exp-start">
                  <Input
                    id="exp-start"
                    type="date"
                    value={form.start_date ?? ""}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </FormField>
                <FormField label="End date" htmlFor="exp-end">
                  <Input
                    id="exp-end"
                    type="date"
                    value={form.end_date ?? ""}
                    onChange={(e) => set("end_date", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="Description" htmlFor="exp-description" optional>
                <Textarea
                  id="exp-description"
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Optional summary of the role"
                />
              </FormField>
              <div className="sm:col-span-2">
                <TagInput
                  id="exp-bullets"
                  label="Bullet points"
                  value={form.bullet_points}
                  onChange={(next) => set("bullet_points", next)}
                  placeholder="e.g. Built a REST API used by 2,000 users"
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
                {editingId === "new" ? "Add experience" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={startAdd}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add experience
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete experience?"
        description={pendingDelete ? `This will permanently remove "${pendingDelete.title}".` : ""}
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
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}
