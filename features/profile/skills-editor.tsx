"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { TagInput } from "@/components/ui/tag-input";
import { UnsavedChangesNotice } from "@/features/profile/unsaved-changes";
import { replaceSkills } from "@/features/profile/profile-actions";
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type SkillCategory,
} from "@/lib/validation/profile";

export interface SkillRow {
  id: string;
  category: SkillCategory;
  name: string;
  normalized_name: string;
}

export function SkillsEditor({ initial }: { initial: SkillRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<SkillCategory, string[]>>(() => {
    return groupSkills(initial);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<Record<SkillCategory, string[]>>(() =>
    groupSkills(initial),
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedSnapshot);

  function setCategory(category: SkillCategory, next: string[]) {
    setDraft((current) => ({ ...current, [category]: next }));
  }

  async function save() {
    setError(null);
    setSaving(true);
    const skills = SKILL_CATEGORIES.flatMap((category) =>
      draft[category].map((name) => ({ category, name })),
    );
    const result = await replaceSkills(skills);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast("Skills saved.", "success");
    setSavedSnapshot(JSON.parse(JSON.stringify(draft)) as Record<SkillCategory, string[]>);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
        <CardDescription>
          Add a skill, press Enter to confirm it, and remove it with its × button. Duplicates are
          added once per category.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {SKILL_CATEGORIES.map((category) => (
          <section key={category} aria-labelledby={`skill-category-${category}`}>
            <h3
              id={`skill-category-${category}`}
              className="mb-1.5 text-sm font-semibold text-foreground"
            >
              {SKILL_CATEGORY_LABELS[category]}
            </h3>
            <TagInput
              id={`skill-${category}`}
              label={SKILL_CATEGORY_LABELS[category]}
              srOnlyLabel
              value={draft[category]}
              onChange={(next) => setCategory(category, next)}
              placeholder={`Add a ${SKILL_CATEGORY_LABELS[category].toLowerCase()} skill`}
            />
          </section>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={save} loading={saving}>
            {saving ? "Saving…" : "Save skills"}
          </Button>
        </div>
        <UnsavedChangesNotice dirty={dirty} />
      </CardContent>
    </Card>
  );
}

function groupSkills(initial: SkillRow[]): Record<SkillCategory, string[]> {
  const grouped = Object.fromEntries(
    SKILL_CATEGORIES.map((category) => [category, [] as string[]]),
  ) as Record<SkillCategory, string[]>;
  for (const skill of initial) {
    grouped[skill.category]?.push(skill.name);
  }
  return grouped;
}
