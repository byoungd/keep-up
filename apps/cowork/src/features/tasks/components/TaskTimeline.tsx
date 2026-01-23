import { useEffect, useRef, useState } from "react";
import { PendingApprovalCard } from "../../approvals/components/PendingApprovalCard";
import { RiskLevel, type TaskGraph } from "../../tasks/types";
import { TaskNodeDisplay } from "./TaskNode";

interface TaskTimelineProps {
  graph: TaskGraph;
  isConnected: boolean;
  approveTool: (approvalId: string) => void;
  rejectTool: (approvalId: string) => void;
}

const formatDuration = (ms: number) => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
};

export function TaskTimeline({ graph, isConnected, approveTool, rejectTool }: TaskTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Auto-scroll logic
  // biome-ignore lint/correctness/useExhaustiveDependencies: graph changes require scroll check
  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;

    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [graph.nodes.length, graph.pendingApprovalId]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  };

  // Find the pending node if any
  const pendingNode = graph.pendingApprovalId
    ? graph.nodes.find((n) => n.type === "tool_call" && n.approvalId === graph.pendingApprovalId)
    : undefined;

  return (
    <div className="flex flex-col h-full bg-surface-0/70 relative rounded-2xl border border-border/40 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/40 bg-surface-0/90 sticky top-0 z-20 flex justify-between items-center shadow-sm">
        <h2 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/20 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
          </div>
          Execution Flow
        </h2>
        <div className="flex items-center gap-2 bg-surface-1/70 rounded-full px-2.5 py-1 border border-border/30">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected
                ? "bg-accent-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                : "bg-muted-foreground"
            }`}
          />
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-[0.2em]">
            {graph.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* List */}
      <section
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-auto-hide p-5 space-y-5 scroll-smooth"
        aria-label="Task timeline"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          setShowScrollButton(scrollHeight - scrollTop - clientHeight > 150);
        }}
      >
        {graph.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50 animate-in fade-in duration-1000">
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center">
              <svg
                className="w-6 h-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Waiting</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">Waiting for Agent</p>
              <p className="text-micro text-muted-foreground uppercase tracking-widest mt-1">
                Standby for execution flow
              </p>
            </div>
          </div>
        ) : (
          <div className="relative pl-4 space-y-5 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[1px] before:bg-border/30">
            {graph.nodes.map((node, index) => {
              let durationStr: string | undefined;
              if (index < graph.nodes.length - 1) {
                const currentTs = new Date(node.timestamp).getTime();
                const nextTs = new Date(graph.nodes[index + 1].timestamp).getTime();
                const diff = nextTs - currentTs;
                if (diff > 0) {
                  durationStr = formatDuration(diff);
                }
              }

              return (
                <div key={String(node.id)} className="relative group">
                  <TaskNodeDisplay node={node} duration={durationStr} />
                </div>
              );
            })}
          </div>
        )}

        {/* Render Pending Approval Card at the bottom if active */}
        {pendingNode && pendingNode.type === "tool_call" && (
          <div className="sticky bottom-4 z-10 animate-in slide-in-from-bottom-6 fade-in duration-slow shadow-xl rounded-2xl border border-accent-indigo/20">
            <PendingApprovalCard
              toolName={pendingNode.toolName}
              args={pendingNode.args}
              riskLevel={pendingNode.riskLevel || RiskLevel.MEDIUM}
              onApprove={() => pendingNode.approvalId && approveTool(pendingNode.approvalId)}
              onReject={() => pendingNode.approvalId && rejectTool(pendingNode.approvalId)}
            />
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </section>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 bg-foreground text-background rounded-full p-2 shadow-lg hover:scale-105 active:scale-95 z-20 transition-transform duration-fast"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Scroll to bottom icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
