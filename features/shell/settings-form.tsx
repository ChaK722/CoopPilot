"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function SettingsForm({ email }: { email: string }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="account-heading"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 id="account-heading" className="text-sm font-semibold">
          Account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{email}</span>. Your email is
          managed by your account provider and cannot be changed here.
        </p>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="theme-heading"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 id="theme-heading" className="text-sm font-semibold">
          Theme
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how CoopPilot looks. Your choice is saved on this device.
        </p>
        <div role="radiogroup" aria-label="Theme" className="mt-4 flex flex-wrap gap-2">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = (theme ?? "system") === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(option.value)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-accent"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
