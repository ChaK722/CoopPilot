import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, item) => (item === undefined ? null : item));
}

/** Deterministic profile source hash used for stale-match detection. */
export function profileSourceHash(source: {
  profile?: {
    preferred_name?: string | null;
    location?: string | null;
    available_start_date?: string | null;
  } | null;
  skills: Array<{ name: string; normalized_name: string }>;
  experiences: Array<{ title: string; organization: string; bullet_points: string[] }>;
  projects: Array<{ name: string; technologies: string[]; description: string | null }>;
  educations: Array<{ school: string; degree: string; program: string }>;
}): string {
  const { profile, skills, experiences, projects, educations } = source;
  const payload = {
    preferred_name: profile?.preferred_name ?? null,
    location: profile?.location ?? null,
    available_start_date: profile?.available_start_date ?? null,
    skills: skills.map((skill) => skill.normalized_name).sort(),
    experiences: experiences.map((experience) => ({
      title: experience.title,
      organization: experience.organization,
      bullets: experience.bullet_points,
    })),
    projects: projects.map((project) => ({
      name: project.name,
      technologies: project.technologies,
      description: project.description,
    })),
    educations: educations.map((education) => ({
      school: education.school,
      degree: education.degree,
      program: education.program,
    })),
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

/** Deterministic application source hash for stale-match detection. */
export function applicationSourceHash(application: {
  company?: string;
  job_title?: string;
  location?: string | null;
  work_arrangement?: string | null;
  responsibilities?: string[];
  qualifications?: string[];
  requiredSkills: Array<{ normalized_name: string }>;
  preferredSkills: Array<{ normalized_name: string }>;
}): string {
  const payload = {
    company: application.company ?? null,
    job_title: application.job_title ?? null,
    location: application.location ?? null,
    work_arrangement: application.work_arrangement ?? null,
    responsibilities: application.responsibilities ?? [],
    qualifications: application.qualifications ?? [],
    requiredSkills: application.requiredSkills.map((skill) => skill.normalized_name).sort(),
    preferredSkills: application.preferredSkills.map((skill) => skill.normalized_name).sort(),
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}
