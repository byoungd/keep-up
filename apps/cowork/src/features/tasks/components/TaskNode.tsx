import type { AgentTask } from "@ku0/shell";
import { useState } from "react";
import type { TaskNode } from "../types";

// --- Minimalist View ---

export function MinimalTaskView({ task, content }: { task: AgentTask; content?: string }) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Minimalist: Hide "Report" and "Plan" artifacts from the chips since they are usually the content itself
  const visibleArtifacts = task.artifacts.filter((a) => a.type !== "report" && a.type !== "plan");

  const isRunning = task.status === "running";
  // const isCompleted = task.status === 'completed';
  const hasDetails = (task.thoughts?.length ?? 0) > 0 || task.steps.length > 0;

  return (
    <div className="flex flex-col gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 1. Ultra-Minimal Thinking Toggle */}
      {hasDetails && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="group flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none"
          >
            <span className="flex items-center gap-1.5">
              {isRunning ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                </span>
              ) : (
                <span className="text-[10px] opacity-70">Model Process</span>
              )}
              <span>
                {isDetailsOpen ? "Hide process" : isRunning ? "Thinking..." : "View process chain"}
              </span>
            </span>
            <svg
              className={`w-3 h-3 opacity-40 transition-transform duration-200 ${isDetailsOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label={isDetailsOpen ? "Collapse details" : "Expand details"}
            >
              <title>{isDetailsOpen ? "Collapse" : "Expand"}</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Details Stream */}
          {isDetailsOpen && (
            <div className="w-full pl-2 ml-0.5 border-l border-border/40 my-1 space-y-1">
              {task.thoughts?.map((thought, idx) => (
                <div
                  key={`th-${thought.slice(0, 16)}-${idx}`}
                  className="font-mono text-[10px] text-muted-foreground/60 truncate"
                >
                  {thought}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Main Content - Pure Text, No Containers */}
      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed break-words">
        {content ||
          (isRunning ? (
            <span className="italic text-muted-foreground">Working on task...</span>
          ) : null)}
      </div>

      {/* 3. Artifact Links (Not Cards) */}
      {visibleArtifacts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1 py-1">
          {visibleArtifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors cursor-pointer hover:underline decoration-primary/30 underline-offset-4"
            >
              {artifact.type === "diff" ? (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  role="img"
                  aria-label="Diff file"
                >
                  <title>Diff</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  role="img"
                  aria-label="Artifact link"
                >
                  <title>Link</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              )}
              <span className="font-medium">{artifact.title || "Attached File"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Minimal Legacy Fallback
export function TaskNodeDisplay({ node }: { node: TaskNode }) {
  if (node.type === "thinking") {
    return (
      <div className="text-[10px] text-muted-foreground/30 font-mono italic">{node.content}</div>
    );
  }
  return null;
}
