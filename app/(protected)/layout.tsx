import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/supabase-server";
import { SidebarContent } from "@/features/shell/sidebar";
import { MobileNav } from "@/features/shell/mobile-nav";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const email = user.email ?? "Account";

  return (
    <div className="min-h-screen">
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <MobileNav email={email} />
        <span className="text-sm font-semibold">CoopPilot</span>
      </div>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
          <div className="sticky top-0 h-screen">
            <SidebarContent email={email} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
