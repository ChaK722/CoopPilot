import { z } from "zod";

/** Normalizes a skill name for deduplication: lowercase, trimmed, collapsed spaces. */
export function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A valid http(s) URL, empty string, null, or undefined (all meaning "not set"). */
export const optionalHttpUrl = z
  .string()
  .trim()
  .nullish()
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must start with http:// or https://." },
  )
  .transform((value) => (value ? value : null));

/** A YYYY-MM-DD calendar date, empty string, null, or undefined (meaning "not set"). */
export const optionalDate = z
  .string()
  .trim()
  .nullish()
  .refine(
    (value) => {
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    { message: "Enter a valid date (YYYY-MM-DD)." },
  )
  .transform((value) => (value ? value : null));

export const tagList = z
  .array(z.string().trim())
  .default([])
  .transform((items) => items.filter((item) => item.length > 0));

export const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null));

export const requiredText = (message: string) => z.string().trim().min(1, message);

export const idSchema = z.string().uuid("Invalid identifier.");

export const directionSchema = z.enum(["up", "down"], {
  error: "Invalid direction.",
});
