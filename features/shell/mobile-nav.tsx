"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarContent } from "@/features/shell/sidebar";

export function MobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-navigation"
            className="relative z-10 h-full w-72 max-w-[85vw] bg-background shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent email={email} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
