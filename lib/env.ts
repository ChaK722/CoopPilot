/**
 * Environment validation. Server code calls `assertServerEnv()` once at
 * startup so a misconfigured deployment fails fast with a clear message.
 */

/** Startup/configuration failure with a safe, user-displayable message. */
export class ConfigError extends Error {
  readonly safeMessage: string;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
    this.safeMessage = message;
  }
}

/**
 * Required public variables. Each reference is a STATIC process.env read so
 * Next.js replaces it at build time for the browser bundle; dynamic indexing
 * (process.env[name]) would be undefined in the browser and break validation.
 */
function missing(): string[] {
  const absent: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    absent.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    absent.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return absent;
}

export function validatePublicEnv(): {
  ok: boolean;
  missing: string[];
  message?: string;
} {
  const absent = missing();
  if (absent.length > 0) {
    return {
      ok: false,
      missing: absent,
      message:
        `Missing required environment variable${absent.length > 1 ? "s" : ""}: ` +
        `${absent.join(", ")}. ` +
        "Copy .env.example to .env.local and fill in your Supabase project URL and anon key.",
    };
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        ok: false,
        missing: [],
        message: "NEXT_PUBLIC_SUPABASE_URL must be an http:// or https:// URL.",
      };
    }
  } catch {
    return {
      ok: false,
      missing: [],
      message: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.",
    };
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  if (anonKey === "replace-with-your-supabase-anon-key") {
    return {
      ok: false,
      missing: [],
      message:
        "NEXT_PUBLIC_SUPABASE_ANON_KEY still contains the .env.example placeholder. " +
        "Replace it with a real anon key in .env.local.",
    };
  }

  return { ok: true, missing: [] };
}

export function assertServerEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey?: string;
  appUrl: string;
} {
  const publicCheck = validatePublicEnv();
  if (!publicCheck.ok) {
    throw new ConfigError(publicCheck.message ?? "Invalid environment configuration.");
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "http://localhost:3000",
  };
}
