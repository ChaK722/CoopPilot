"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PlusCircle,
  UserRound,
} from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/auth/supabase-browser";
import { cn } from "@/lib/utils";
import { CoopPilotLogo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications/board", label: "Board", icon: KanbanSquare },
  { href: "/applications", label: "Applications", icon: ListChecks },
  { href: "/applications/new", label: "Add Job", icon: PlusCircle },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function SidebarContent({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <a href="/dashboard" className="rounded-md" aria-label="CoopPilot dashboard">
        <CoopPilotLogo />
      </a>

      <nav aria-label="Main navigation" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <ThemeToggle />
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="w-full">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
