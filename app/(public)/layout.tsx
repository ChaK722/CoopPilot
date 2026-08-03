import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CoopPilotLogo } from "@/components/brand/logo";
import { SkipLink } from "@/components/skip-link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md" aria-label="CoopPilot home">
          <CoopPilotLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col outline-none focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
