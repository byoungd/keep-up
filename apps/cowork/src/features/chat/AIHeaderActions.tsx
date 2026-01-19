"use client";

import { useAIControl } from "./AIControlContext";

/**
 * Header action buttons for AI Panel context panels.
 * Uses AIControlContext to control which context panel is displayed.
 */
export function AIHeaderActions() {
  const { setContextPanel } = useAIControl();
  const actionClassName =
    "text-fine leading-[1.3] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-surface-2 transition-colors duration-fast";

  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => setContextPanel("project")} className={actionClassName}>
        Context
      </button>
      <button type="button" onClick={() => setContextPanel("packs")} className={actionClassName}>
        Packs
      </button>
      <button
        type="button"
        onClick={() => setContextPanel("workflows")}
        className={actionClassName}
      >
        Workflows
      </button>
      <button
        type="button"
        onClick={() => setContextPanel("preflight")}
        className={actionClassName}
      >
        Preflight
      </button>
    </div>
  );
}
