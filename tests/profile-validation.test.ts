import { describe, expect, it } from "vitest";
import {
  educationSchema,
  experienceSchema,
  normalizeSkillName,
  profileBasicSchema,
  projectSchema,
} from "@/lib/validation/profile";

describe("profileBasicSchema", () => {
  it("rejects an empty or whitespace-only preferred name", () => {
    expect(profileBasicSchema.safeParse({ preferred_name: "" }).success).toBe(false);
    expect(profileBasicSchema.safeParse({ preferred_name: "   " }).success).toBe(false);
  });

  it("accepts a valid preferred name with optional fields omitted", () => {
    const result = profileBasicSchema.safeParse({ preferred_name: " Alex " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferred_name).toBe("Alex");
    }
  });

  it("only accepts http/https URLs for LinkedIn, GitHub, and website", () => {
    const base = { preferred_name: "Alex" };
    for (const field of ["linkedin_url", "github_url", "website_url"]) {
      expect(
        profileBasicSchema.safeParse({ ...base, [field]: "javascript:alert(1)" }).success,
      ).toBe(false);
      expect(profileBasicSchema.safeParse({ ...base, [field]: "ftp://example.com" }).success).toBe(
        false,
      );
      expect(
        profileBasicSchema.safeParse({ ...base, [field]: "https://example.com" }).success,
      ).toBe(true);
      expect(profileBasicSchema.safeParse({ ...base, [field]: "" }).success).toBe(true);
    }
  });

  it("normalizes empty optional text fields to null", () => {
    const result = profileBasicSchema.safeParse({
      preferred_name: "Alex",
      phone: "  ",
      location: "",
      remote_preference: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.location).toBeNull();
      expect(result.data.remote_preference).toBeNull();
    }
  });
});

describe("date order validation", () => {
  it("rejects an expected graduation date before the start date", () => {
    const result = educationSchema.safeParse({
      school: "U",
      degree: "BSc",
      program: "CS",
      start_date: "2025-09-01",
      expected_graduation_date: "2025-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("expected_graduation_date");
    }
  });

  it("rejects an experience end date before the start date", () => {
    const result = experienceSchema.safeParse({
      title: "Intern",
      organization: "Acme",
      start_date: "2025-05-01",
      end_date: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a project end date before the start date", () => {
    const result = projectSchema.safeParse({
      name: "App",
      start_date: "2025-05-01",
      end_date: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts equal start and end dates", () => {
    const result = experienceSchema.safeParse({
      title: "Intern",
      organization: "Acme",
      start_date: "2025-01-01",
      end_date: "2025-01-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("skill normalization", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeSkillName("  React  JS ")).toBe("react js");
    expect(normalizeSkillName("TypeScript")).toBe("typescript");
  });
});
