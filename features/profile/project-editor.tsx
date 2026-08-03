"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorResultMessage } from "@/lib/errors";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/features/profile/confirm-dialog";
import { TagInput } from "@/components/ui/tag-input";
import { UnsavedChangesNotice } from "@/features/profile/unsaved-changes";
import {
  createProject,
  deleteProject,
  moveProject,
  updateProject,
} from "@/features/profile/profile-actions";
import { projectSchema, type ProjectValues } from "@/lib/validation/profile";

export interface ProjectRow {
  id: string;
  name: string;
  technologies: string[];
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  bullet_points: string[];
  github_url: string | null;
  demo_url: string | null;
  sort_order: number;
}

const emptyForm = (): ProjectValues => ({
  name: "",
  technologies: [],
  start_date: "",
  end_date: "",
  description: "",
  bullet_points: [],
  github_url: "",
  demo_url: "",
});

const fromRow = (row: ProjectRow): ProjectValues => ({
  name: row.name,
  technologies: row.technologies ?? [],
  start_date: row.start_date ?? "",
  end_date: row.end_date ?? "",
  description: row.description ?? "",
  bullet_points: row.bullet_points ?? [],
  github_url: row.github_url ?? "",
  demo_url: row.demo_url ?? "",
});

export function ProjectEditor({ initial }: { initial: ProjectRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectValues>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dirty = editingId !== null;

  function set<K extends keyof ProjectValues>(key: K, value: ProjectValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startAdd() {
    setForm(emptyForm());
    setFormError(null);
    setEditingId("new");
  }

  function startEdit(row: ProjectRow) {
    setForm(fromRow(row));
    setFormError(null);
    setEditingId(row.id);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = projectSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    const result =
      editingId === "new"
        ? await createProject(form)
        : editingId
          ? await updateProject(editingId, form)
          : null;
    setBusy(false);
    if (!result?.ok) {
      setFormError(result?.error ?? "Could not save.");
      return;
    }
    toast(editingId === "new" ? "Project added." : "Project updated.", "success");
    setEditingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteProject(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast(errorResultMessage(result), "error");
      return;
    }
    toast("Project deleted.", "success");
    router.refresh();
  }

  async function move(row: ProjectRow, direction: "up" | "down") {
    const result = await moveProject(row.id, direction);
    if (!result.ok) {
      toast(errorResultMessage(result), "error");
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Add, edit, reorder, or remove project entries.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {initial.length === 0 && editingId === null ? (
          <p className="text-sm text-muted-foreground">
            No projects added yet. Add your first project to get started.
          </p>
        ) : null}
        <UnsavedChangesNotice dirty={dirty} />

        {initial.map((row, index) => (
          <div key={row.id} className="flex items-start gap-3 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{row.name}</p>
              {row.technologies.length > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.technologies.join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "up")}
                disabled={index === 0}
                aria-label="Move project up"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(row, "down")}
                disabled={index === initial.length - 1}
                aria-label="Move project down"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => startEdit(row)}
                aria-label={`Edit ${row.name}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPendingDelete(row)}
                aria-label={`Delete ${row.name}`}
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
                {editingId === "new" ? "Add project" : "Edit project"}
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
              <FormField label="Name" htmlFor="proj-name">
                <Input
                  id="proj-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Job Application Tracker"
                />
              </FormField>
              <div className="sm:col-span-2">
                <TagInput
                  id="proj-tech"
                  label="Technologies"
                  value={form.technologies}
                  onChange={(next) => set("technologies", next)}
                  placeholder="e.g. TypeScript"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start date" htmlFor="proj-start">
                  <Input
                    id="proj-start"
                    type="date"
                    value={form.start_date ?? ""}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </FormField>
                <FormField label="End date" htmlFor="proj-end">
                  <Input
                    id="proj-end"
                    type="date"
                    value={form.end_date ?? ""}
                    onChange={(e) => set("end_date", e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label="GitHub URL" htmlFor="proj-github" optional>
                <Input
                  id="proj-github"
                  type="url"
                  value={form.github_url ?? ""}
                  onChange={(e) => set("github_url", e.target.value)}
                  placeholder="https://github.com/you/repo"
                />
              </FormField>
              <FormField label="Demo URL" htmlFor="proj-demo" optional>
                <Input
                  id="proj-demo"
                  type="url"
                  value={form.demo_url ?? ""}
                  onChange={(e) => set("demo_url", e.target.value)}
                  placeholder="https://demo.example.com"
                />
              </FormField>
              <FormField label="Description" htmlFor="proj-description" optional>
                <Textarea
                  id="proj-description"
                  value={form.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Optional project summary"
                />
              </FormField>
              <div className="sm:col-span-2">
                <TagInput
                  id="proj-bullets"
                  label="Bullet points"
                  value={form.bullet_points}
                  onChange={(next) => set("bullet_points", next)}
                  placeholder="e.g. Reduced page load time by 40%"
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
                {editingId === "new" ? "Add project" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" onClick={startAdd}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add project
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete project?"
        description={pendingDelete ? `This will permanently remove "${pendingDelete.name}".` : ""}
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
