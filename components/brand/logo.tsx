import { Compass } from "lucide-react";

export function CoopPilotLogo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-base font-semibold ${className ?? ""}`}>
      <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
      CoopPilot
    </span>
  );
}
