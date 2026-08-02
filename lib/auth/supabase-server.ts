import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertServerEnv } from "@/lib/env";

/**
 * Server-side Supabase client that reads and writes the session cookie.
 * Pages and server actions must resolve the user from this client; relying
 * only on middleware is never an authorization boundary.
 */
export async function createServerSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = assertServerEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component; safe to ignore when middleware
          // already refreshed the session cookie.
        }
      },
    },
  });
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  return user;
}
