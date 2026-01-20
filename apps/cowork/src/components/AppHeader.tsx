import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "../lib/cn";

const STATUS_BY_PATH: Record<string, string> = {
  "/settings": "Configuring",
  "/lessons": "Learning",
};

export function AppHeader() {
  const { location } = useRouterState();
  const status = STATUS_BY_PATH[location.pathname] ?? "Ready";

  return (
    <header className="glass-panel shell-header">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_top,var(--color-accent-emerald),transparent_60%)] shadow-sm" />
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            "bg-[color-mix(in_srgb,var(--color-accent-emerald)_25%,transparent)]",
            "text-foreground"
          )}
        >
          {status}
        </span>
        <Link to="/settings" className="header-link">
          Settings
        </Link>
      </div>
    </header>
  );
}
