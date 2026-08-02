import { describe, expect, it } from "vitest";
import { createDemoAIProvider } from "@/features/ai/demo-provider";
import { matchAnalysisResultSchema } from "@/features/ai/schemas";
import type { MatchInput } from "@/features/ai/schemas";

const provider = createDemoAIProvider();

function matchInput(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    profileSkills: [
      {
        id: "11111111-1111-4111-8111-111111111101",
        name: "TypeScript",
        normalized_name: "typescript",
        category: "programming_languages",
      },
      {
        id: "11111111-1111-4111-8111-111111111102",
        name: "React",
        normalized_name: "react",
        category: "frameworks",
      },
      {
        id: "11111111-1111-4111-8111-111111111103",
        name: "PostgreSQL",
        normalized_name: "postgresql",
        category: "tools",
      },
    ],
    experiences: [
      {
        id: "11111111-1111-4111-8111-111111111201",
        title: "Software Developer Intern",
        organization: "Acme",
        bullet_points: ["Built a REST API"],
      },
    ],
    projects: [
      {
        id: "11111111-1111-4111-8111-111111111301",
        name: "Portfolio",
        description: "A personal site",
        technologies: ["React"],
      },
    ],
    educations: [
      {
        id: "11111111-1111-4111-8111-111111111401",
        school: "Waterloo",
        degree: "BSc",
        program: "CS",
      },
    ],
    location: "Toronto",
    availableStartDate: null,
    application: {
      company: "Acme",
      job_title: "Software Developer Co-op",
      responsibilities: ["Build features"],
      qualifications: ["TypeScript"],
      requiredSkills: [{ name: "TypeScript", normalized_name: "typescript" }],
      preferredSkills: [{ name: "AWS", normalized_name: "aws" }],
    },
    profileSourceHash: "hash-profile",
    applicationSourceHash: "hash-app",
    ...overrides,
  };
}

describe("Demo AI provider determinism", () => {
  it("produces identical output for identical match inputs", async () => {
    const input = matchInput();
    const first = await provider.analyzeMatch(input);
    const second = await provider.analyzeMatch(input);
    expect(second).toEqual(first);
  });

  it("produces identical output for identical cover letter inputs", async () => {
    const input = {
      profile: {
        preferredName: "Alex",
        location: "Toronto",
        experiences: [
          {
            id: "11111111-1111-4111-8111-111111111201",
            title: "Intern",
            organization: "Acme",
            bullet_points: ["Built a REST API"],
          },
        ],
        projects: [],
        educations: [
          {
            id: "11111111-1111-4111-8111-111111111401",
            school: "Waterloo",
            degree: "BSc",
            program: "CS",
          },
        ],
      },
      application: {
        company: "Acme",
        job_title: "Developer Co-op",
        responsibilities: ["Build features"],
        qualifications: ["TypeScript"],
      },
    };
    const first = await provider.generateCoverLetter(input);
    const second = await provider.generateCoverLetter(input);
    expect(second).toEqual(first);
  });
});

describe("Demo match analysis scoring", () => {
  it("sums component scores to the overall score within weights", async () => {
    const result = await provider.analyzeMatch(matchInput());
    const breakdown = result.score_breakdown;
    const total =
      breakdown.required_skills.score +
      breakdown.preferred_skills.score +
      breakdown.relevant_experience.score +
      breakdown.education.score +
      breakdown.location_availability.score;
    expect(total).toBe(result.overall_score);
    expect(breakdown.required_skills.max).toBe(40);
    expect(breakdown.preferred_skills.max).toBe(20);
    expect(breakdown.relevant_experience.max).toBe(20);
    expect(breakdown.education.max).toBe(10);
    expect(breakdown.location_availability.max).toBe(10);
  });

  it("never lists a skill as matched unless it exists in the profile", async () => {
    const result = await provider.analyzeMatch(matchInput());
    const profileNames = new Set(matchInput().profileSkills.map((skill) => skill.name));
    for (const skill of result.matching_skills) {
      expect(profileNames.has(skill.name)).toBe(true);
    }
    expect(result.missing_required_skills).toEqual([]);
    expect(result.missing_preferred_skills).toEqual(["AWS"]);
  });

  it("returns schema-valid output with evidence references", async () => {
    const result = await provider.analyzeMatch(matchInput());
    const parsed = matchAnalysisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.matching_experience[0].id).toBe("11111111-1111-4111-8111-111111111201");
    expect(result.relevant_projects[0].id).toBe("11111111-1111-4111-8111-111111111301");
  });

  it("never suggests fabricating experience", async () => {
    const result = await provider.analyzeMatch(matchInput());
    const text = result.suggestions.join(" ").toLowerCase();
    expect(text).not.toContain("fake");
    expect(text).not.toContain("invent");
    expect(text).not.toContain("lie");
    expect(text).not.toContain("pretend");
  });
});

describe("Demo cover letter", () => {
  it("is insufficient with an actionable prompt when profile data is missing", async () => {
    const result = await provider.generateCoverLetter({
      profile: {
        preferredName: "",
        location: null,
        experiences: [],
        projects: [],
        educations: [],
      },
      application: {
        company: "Acme",
        job_title: "Intern",
        responsibilities: [],
        qualifications: [],
      },
    });
    expect(result.sufficient).toBe(false);
    expect(result.prompt).toContain("preferred name");
    expect(result.content).toBeUndefined();
  });

  it("produces a 250-400 word letter targeting the company and role from real facts", async () => {
    const result = await provider.generateCoverLetter({
      profile: {
        preferredName: "Alex",
        location: "Toronto",
        experiences: [
          {
            id: "11111111-1111-4111-8111-111111111201",
            title: "Software Developer Intern",
            organization: "Acme",
            bullet_points: [
              "Built a REST API used by 2,000 users",
              "Shipped responsive UI with React",
            ],
          },
          {
            id: "11111111-1111-4111-8111-111111111202",
            title: "QA Co-op",
            organization: "Beta",
            bullet_points: ["Wrote end-to-end tests"],
          },
        ],
        projects: [
          {
            id: "11111111-1111-4111-8111-111111111301",
            name: "CoopPilot",
            technologies: ["Next.js", "TypeScript"],
            description: "Job tracker",
          },
        ],
        educations: [
          {
            id: "11111111-1111-4111-8111-111111111401",
            school: "Waterloo",
            degree: "BSc",
            program: "CS",
          },
        ],
      },
      application: {
        company: "Stellar Robotics",
        job_title: "Full Stack Developer Co-op",
        responsibilities: ["Build dashboard features"],
        qualifications: ["React"],
      },
    });
    expect(result.sufficient).toBe(true);
    expect(result.content).toContain("Stellar Robotics");
    expect(result.content).toContain("Full Stack Developer Co-op");
    expect(result.content).toContain("Alex");
    const words = (result.content ?? "").split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(250);
    expect(words).toBeLessThanOrEqual(400);
  });
});

describe("Demo interview preparation", () => {
  it("binds technical questions to stored job skills", async () => {
    const result = await provider.generateInterviewPrep({
      profileSkills: [
        {
          id: "11111111-1111-4111-8111-111111111101",
          name: "TypeScript",
          normalized_name: "typescript",
        },
      ],
      experiences: [],
      projects: [],
      application: {
        company: "Acme",
        job_title: "Developer Co-op",
        requiredSkills: [{ name: "TypeScript", normalized_name: "typescript" }],
        preferredSkills: [{ name: "AWS", normalized_name: "aws" }],
      },
    });
    expect(result.technical_questions.length).toBeGreaterThan(0);
    expect(result.technical_questions[0].question).toContain("TypeScript");
    expect(result.behavioural_questions[0].relevant_experience).toContain("No relevant example");
    expect(result.research_checklist.some((item) => item.includes("Acme"))).toBe(true);
  });

  it("references only stored experience when available", async () => {
    const result = await provider.generateInterviewPrep({
      profileSkills: [],
      experiences: [
        {
          id: "11111111-1111-4111-8111-111111111201",
          title: "Software Developer Intern",
          organization: "Acme",
          bullet_points: ["Built a REST API"],
        },
      ],
      projects: [],
      application: {
        company: "Acme",
        job_title: "Developer Co-op",
        requiredSkills: [],
        preferredSkills: [],
      },
    });
    expect(result.behavioural_questions[0].relevant_experience).toContain(
      "Software Developer Intern",
    );
  });
});
