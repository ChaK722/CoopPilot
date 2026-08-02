"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  id: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Visually hide the label while keeping the programmatic association. */
  srOnlyLabel?: boolean;
}

/**
 * Keyboard-usable tag list: type a value, press Enter (or comma) to add it;
 * remove with the per-tag button. Tags render as plain text chips.
 */
export function TagInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  invalid,
  srOnlyLabel = false,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const tag = draft.trim();
    if (!tag) return;
    if (!value.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft("");
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={srOnlyLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder={placeholder}
          invalid={invalid}
        />
        <button
          type="button"
          onClick={addTag}
          aria-label={`Add ${label.toLowerCase()}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {value.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={`${label} added`}>
          {value.map((tag, index) => (
            <li
              key={`${tag}-${index}`}
              className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(index)}
                aria-label={`Remove ${tag}`}
                className="rounded-full p-0.5 hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
