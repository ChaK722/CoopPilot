import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/route-guards";
import { SettingsForm } from "@/features/shell/settings-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account identity, appearance, and session controls.
        </p>
      </header>
      <SettingsForm email={user.email ?? "Account"} />
    </div>
  );
}
