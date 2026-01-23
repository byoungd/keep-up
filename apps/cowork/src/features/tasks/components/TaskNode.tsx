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
    <div className="flex flex-col gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-slow">
      {/* 1. Ultra-Minimal Thinking Toggle */}
      {hasDetails && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => setIsDetailsOpen(!isDetailsOpen)}
            className="group flex items-center gap-2 text-fine font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-fast select-none"
          >
            <span className="flex items-center gap-1.5">
              {isRunning ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info/70 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-info" />
                </span>
              ) : (
                <span className="text-micro opacity-70">Model Process</span>
              )}
              <span>
                {isDetailsOpen ? "Hide process" : isRunning ? "Thinking..." : "View process chain"}
              </span>
            </span>
            <svg
              className={`w-3 h-3 opacity-40 transition-transform duration-normal ${isDetailsOpen ? "rotate-180" : ""}`}
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
                  className="font-mono text-micro text-muted-foreground/60 truncate"
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
              className="inline-flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary transition-colors duration-fast cursor-pointer hover:underline decoration-primary/30 underline-offset-4"
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

// --- Specialized Node Displays ---

const BASE_NODE_CLASSES =
  "relative animate-in fade-in slide-in-from-left-4 duration-500 fill-mode-both px-4 py-3 rounded-xl text-xs shadow-sm overflow-hidden border border-border/20";

function ThinkingNodeDisplay({ node }: { node: TaskNode & { type: "thinking" } }) {
  return (
    <div className={`${BASE_NODE_CLASSES} bg-surface-1 text-muted-foreground italic font-mono`}>
      <div
        className="ai-sheen-line pointer-events-none absolute inset-x-0 top-0"
        aria-hidden="true"
      />
      <div className="flex items-center gap-2 opacity-60 mb-1.5">
        <div className="flex space-x-0.5">
          <div className="w-1 h-1 bg-muted-foreground/60 rounded-full" />
          <div className="w-1 h-1 bg-muted-foreground/60 rounded-full" />
          <div className="w-1 h-1 bg-muted-foreground/60 rounded-full" />
        </div>
        <span className="text-micro uppercase font-bold tracking-widest">Internal Logic</span>
      </div>
      <div className="leading-relaxed whitespace-pre-wrap">{node.content}</div>
    </div>
  );
}

function ToolCallNodeDisplay({ node }: { node: TaskNode & { type: "tool_call" } }) {
  return (
    <div className={`${BASE_NODE_CLASSES} bg-info/5 border-info/20 text-info`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-info/10 rounded-lg">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <title>Tool</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <span className="font-black font-mono tracking-tight uppercase">
            {node.activityLabel ? `${node.activityLabel}...` : `call:${node.toolName}`}
          </span>
        </div>
        {node.riskLevel && (
          <div className="flex items-center gap-1.5">
            <span
              className={`text-nano px-2 py-0.5 rounded-full font-black uppercase tracking-tighter ${
                node.riskLevel === "high"
                  ? "bg-error text-error-foreground"
                  : "bg-warning/20 text-warning"
              }`}
            >
              {node.riskLevel} Risk
            </span>
          </div>
        )}
      </div>
      <div className="font-mono text-micro bg-surface-2/50 rounded-lg p-2 overflow-x-auto border border-border/40">
        <pre>{JSON.stringify(node.args, null, 2)}</pre>
      </div>
    </div>
  );
}

function ToolOutputDisplay({ node }: { node: TaskNode & { type: "tool_output" } }) {
  return (
    <div
      className={`${BASE_NODE_CLASSES} ${
        node.isError
          ? "bg-error/5 border-error/20 text-error"
          : "bg-success/5 border-success/20 text-success"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1 rounded-lg ${node.isError ? "bg-error/10" : "bg-success/10"}`}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Output</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span className="font-black text-micro uppercase tracking-widest">
          {node.activityLabel
            ? node.activityLabel
            : node.isError
              ? "Failure Response"
              : "Success Execution"}
          {node.activityLabel && (node.isError ? " Failed" : " Complete")}
        </span>
      </div>
      <div className="opacity-90 font-mono text-micro bg-surface-2/50 p-2 rounded-lg border border-border/40 overflow-hidden">
        <div className="break-all line-clamp-6">
          {typeof node.output === "string" ? node.output : JSON.stringify(node.output)}
        </div>
      </div>
    </div>
  );
}

function StatusNodeDisplay({
  node,
  duration,
}: {
  node: TaskNode & { type: "task_status" };
  duration?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-3 px-2 animate-in fade-in slide-in-from-left-2 duration-slow">
      <div className="relative">
        <div
          className={`w-3 h-3 rounded-full shrink-0 shadow-sm ${
            node.status === "completed"
              ? "bg-success"
              : node.status === "failed"
                ? "bg-error"
                : "bg-info animate-pulse"
          }`}
        />
        {node.status === "running" && (
          <div className="absolute inset-0 bg-info rounded-full animate-ping opacity-20" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span className="font-black text-foreground text-sm tracking-tighter truncate">
            {node.title}
          </span>
          {duration && (
            <span className="text-micro font-mono text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded-md border border-border/40">
              {duration}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-micro text-muted-foreground uppercase font-black tracking-widest opacity-50">
            {node.status}
          </span>
          {node.modelId && (
            <>
              <span className="w-1 h-1 bg-border rounded-full" />
              <span className="text-tiny font-mono text-muted-foreground/40 italic">
                {node.modelId}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorNodeDisplay({ node }: { node: TaskNode & { type: "error" } }) {
  return (
    <div
      className={`${BASE_NODE_CLASSES} bg-error border-error/30 text-error-foreground font-bold shadow-error/20`}
    >
      <div className="flex items-center gap-2 mb-1.5 uppercase font-black tracking-tighter text-tiny">
        <div className="p-1 bg-white/20 rounded-lg">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <title>Error icon</title>
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        System Halt
      </div>
      <div className="leading-tight">{node.message}</div>
    </div>
  );
}

function TurnMarkerDisplay({ node }: { node: TaskNode & { type: "turn_marker" } }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-micro font-black uppercase tracking-widest">
        Turn {node.turn} {node.phase === "start" ? "Start" : "End"}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

function PolicyDecisionDisplay({ node }: { node: TaskNode & { type: "policy_decision" } }) {
  const decisionLabel =
    node.decision === "allow"
      ? "Allowed"
      : node.decision === "allow_with_confirm"
        ? "Allow w/ Confirm"
        : node.decision === "deny"
          ? "Denied"
          : "Decision";
  const tone =
    node.decision === "deny"
      ? "bg-error/5 border-error/30 text-error"
      : node.decision === "allow_with_confirm"
        ? "bg-warning/10 border-warning/30 text-warning"
        : "bg-success/5 border-success/30 text-success";

  return (
    <div className={`${BASE_NODE_CLASSES} ${tone}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-black uppercase tracking-widest text-micro">
          Policy {decisionLabel}
        </span>
        {node.riskScore !== undefined ? (
          <span className="text-nano font-mono opacity-70">risk {node.riskScore}</span>
        ) : null}
      </div>
      <div className="text-micro opacity-80">
        {node.toolName ? `Tool: ${node.toolName}` : "Tool: —"}
        {node.policyRuleId ? ` · Rule ${node.policyRuleId}` : ""}
      </div>
      {node.reason ? <div className="text-micro mt-1">{node.reason}</div> : null}
      {node.riskTags && node.riskTags.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.riskTags.map((tag) => (
            <span
              key={tag}
              className="text-nano px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground uppercase font-semibold"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckpointNodeDisplay({ node }: { node: TaskNode & { type: "checkpoint" } }) {
  const label = node.action === "restored" ? "Checkpoint Restored" : "Checkpoint Saved";

  return (
    <div
      className={`${BASE_NODE_CLASSES} bg-accent-indigo/10 border-accent-indigo/30 text-accent-indigo`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-black uppercase tracking-widest text-micro">{label}</span>
        <span className="text-nano font-mono opacity-70">step {node.currentStep}</span>
      </div>
      <div className="text-micro opacity-80">
        {node.checkpointId.slice(0, 8)}
        {node.status ? ` · ${node.status}` : ""}
      </div>
    </div>
  );
}

// --- Main Entry ---

export function TaskNodeDisplay({ node, duration }: { node: TaskNode; duration?: string }) {
  switch (node.type) {
    case "thinking":
      return <ThinkingNodeDisplay node={node} />;
    case "tool_call":
      return <ToolCallNodeDisplay node={node} />;
    case "tool_output":
      return <ToolOutputDisplay node={node} />;
    case "task_status":
      return <StatusNodeDisplay node={node} duration={duration} />;
    case "error":
      return <ErrorNodeDisplay node={node} />;
    case "turn_marker":
      return <TurnMarkerDisplay node={node} />;
    case "policy_decision":
      return <PolicyDecisionDisplay node={node} />;
    case "checkpoint":
      return <CheckpointNodeDisplay node={node} />;
    default:
      return null;
  }
}
