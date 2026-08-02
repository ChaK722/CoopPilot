import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";

/** Redirects unauthenticated visitors to /login. Used by protected layouts. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Redirects authenticated visitors away from /login and /signup. */
export async function requireGuest() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }
}
