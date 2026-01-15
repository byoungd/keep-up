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
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setShowScrollButton(true);
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
    <div className="flex flex-col h-full bg-surface-0/70 relative rounded-2xl border border-border/40 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 bg-surface-0/90 backdrop-blur-md sticky top-0 z-20 flex justify-between items-center">
        <h2 className="font-semibold text-foreground text-sm tracking-tight flex items-center gap-2">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Timeline icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Timeline
        </h2>
        <div className="flex items-center gap-2 bg-surface-2 rounded-full px-2 py-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-accent-emerald animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {graph.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
        }}
      >
        {graph.nodes.map((node) => (
          <TaskNodeDisplay key={String(node.id)} node={node} />
        ))}

        {/* Render Pending Approval Card at the bottom if active */}
        {pendingNode && pendingNode.type === "tool_call" && (
          <div className="sticky bottom-4 z-10 animate-in slide-in-from-bottom-4 fade-in duration-300 shadow-xl rounded-xl">
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
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 bg-foreground text-background rounded-full p-2 shadow-lg hover:scale-105 active:scale-95 z-20 transition-transform"
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
