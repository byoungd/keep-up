"use client";

import { useAIControl } from "./AIControlContext";

/**
 * Header action buttons for AI Panel context panels.
 * Uses AIControlContext to control which context panel is displayed.
 */
export function AIHeaderActions() {
  const { setContextPanel } = useAIControl();

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setContextPanel("project")}
        className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-foreground/[0.05] transition-colors"
      >
        Context
      </button>
      <button
        type="button"
        onClick={() => setContextPanel("packs")}
        className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-foreground/[0.05] transition-colors"
      >
        Packs
      </button>
      <button
        type="button"
        onClick={() => setContextPanel("workflows")}
        className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-foreground/[0.05] transition-colors"
      >
        Workflows
      </button>
      <button
        type="button"
        onClick={() => setContextPanel("preflight")}
        className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-foreground/[0.05] transition-colors"
      >
        Preflight
      </button>
    </div>
  );
}
