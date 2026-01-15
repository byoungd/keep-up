import { useState } from "react";
import { PlanCard } from "../../artifacts/components/PlanCard";
import type { TaskNode } from "../types";

// --- Sub-components ---

function ThinkingNodeDisplay({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="my-2 group">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <svg
            className="w-3 h-3 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Thinking indicator icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex-1">
          Thinking Process
        </span>
        <svg
          className={`w-3.5 h-3.5 transform transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Expand/Collapse icon</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="ml-3 pl-5 border-l-2 border-border mt-2 py-1">
          <div className="text-sm text-muted-foreground italic leading-relaxed whitespace-pre-wrap font-serif">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallNodeDisplay({ node }: { node: import("../types").ToolCallNode }) {
  if (node.requiresApproval && !node.approvalId) {
    return <div className="text-destructive">Error: Missing Approval ID</div>;
  }

  // Note: Pending approval state is handled by the parent timeline rendering a dedicated card.
  // This component renders the historical record of the tool call.

  if (node.requiresApproval && node.approvalId) {
    return (
      <div className="my-2 pl-4 border-l-2 border-info/30">
        <div className="text-xs font-mono text-info mb-1">Use Tool: {node.toolName}</div>
        <pre className="text-xs text-muted-foreground overflow-x-auto">
          {JSON.stringify(node.args)}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 pl-4 relative group">
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-indigo/30 group-hover:bg-accent-indigo/50 transition-colors" />

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold text-white bg-accent-indigo px-1.5 py-0.5 rounded shadow-sm">
          TOOL
        </span>
        <code className="text-xs font-bold text-foreground font-mono">{node.toolName}</code>
      </div>

      <div className="bg-muted/50 border border-border rounded p-2.5 font-mono text-xs text-muted-foreground overflow-x-auto shadow-sm">
        <pre>{JSON.stringify(node.args, null, 2)}</pre>
      </div>
    </div>
  );
}

function ToolOutputNodeDisplay({ node }: { node: import("../types").ToolOutputNode }) {
  return (
    <div className="my-2 ml-4 relative">
      <div className="absolute -left-4 top-0 bottom-0 w-0.5 bg-success/30" />
      <div className="bg-success/5 border border-success/20 rounded-lg p-3 text-xs font-mono text-muted-foreground shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 mb-2 text-success font-semibold border-b border-success/20 pb-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Success icon</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Output
        </div>
        <div className="whitespace-pre-wrap break-words opacity-90 max-h-60 overflow-y-auto custom-scrollbar">
          {typeof node.output === "string" ? node.output : JSON.stringify(node.output, null, 2)}
        </div>
      </div>
    </div>
  );
}

function ErrorNodeDisplay({ message }: { message: string }) {
  return (
    <div className="my-2 p-3 bg-destructive/10 text-destructive text-sm rounded border border-destructive/20">
      <strong>Error:</strong> {message}
    </div>
  );
}

// --- Main Component ---

interface TaskNodeProps {
  node: TaskNode;
}

export function TaskNodeDisplay({ node }: TaskNodeProps) {
  switch (node.type) {
    case "thinking":
      return <ThinkingNodeDisplay content={node.content} />;
    case "tool_call":
      return <ToolCallNodeDisplay node={node} />;
    case "tool_output":
      return <ToolOutputNodeDisplay node={node} />;
    case "plan_update":
      // Only render if it's a full plan update for now
      return node.plan.type === "plan" ? <PlanCard steps={node.plan.steps} /> : null;
    case "error":
      return <ErrorNodeDisplay message={node.message} />;
    default:
      return null;
  }
}
