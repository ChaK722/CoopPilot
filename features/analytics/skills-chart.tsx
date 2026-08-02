"use client";

import type { TopSkill } from "@/features/analytics/analytics-types";

export function SkillsChart({ skills }: { skills: TopSkill[] }) {
  const max = skills.reduce((highest, skill) => Math.max(highest, skill.total_count), 0);

  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 text-sm font-semibold">Most requested skills</figcaption>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No skills found yet</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((skill) => (
            <li
              key={skill.normalized_name}
              className="flex items-center gap-3"
              aria-label={`${skill.name}: ${skill.total_count} applications, ${skill.required_count} required, ${skill.preferred_count} preferred`}
            >
              <span className="w-32 shrink-0 truncate text-sm">{skill.name}</span>
              <span className="h-3 flex-1 overflow-hidden rounded bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded bg-primary"
                  style={{ width: `${max > 0 ? (skill.total_count / max) * 100 : 0}%` }}
                />
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {skill.total_count} app{skill.total_count === 1 ? "" : "s"} · {skill.required_count}{" "}
                req · {skill.preferred_count} pref
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
