import Link from "next/link";

/** Visually hidden until focused; lets keyboard users jump to the content. */
export function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </Link>
  );
}
