import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePublicEnv } from "@/lib/env";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

function setEnv(partial: Record<string, string | undefined>) {
  for (const key of KEYS) {
    if (key in partial) {
      if (partial[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = partial[key];
      }
    }
  }
}

describe("validatePublicEnv", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("reports missing required variables", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined });
    const result = validatePublicEnv();
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(KEYS);
    expect(result.message).toContain("Missing required environment variable");
  });

  it("rejects an invalid Supabase URL", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "abc",
    });
    const result = validatePublicEnv();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not a valid URL");
  });

  it("rejects a placeholder anon key", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "replace-with-your-supabase-anon-key",
    });
    const result = validatePublicEnv();
    expect(result.ok).toBe(false);
    expect(result.message).toContain("placeholder");
  });

  it("accepts a valid configuration", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.test",
    });
    expect(validatePublicEnv().ok).toBe(true);
  });
});
