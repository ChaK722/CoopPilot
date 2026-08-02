"use client";

import { createBrowserClient } from "@supabase/ssr";
import { validatePublicEnv } from "@/lib/env";

function browserConfig() {
  const check = validatePublicEnv();
  if (!check.ok) {
    // Only reached when the app is misconfigured; surfaces immediately.
    throw new Error(check.message);
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function createBrowserSupabaseClient() {
  const { url, anonKey } = browserConfig();
  return createBrowserClient(url, anonKey);
}
