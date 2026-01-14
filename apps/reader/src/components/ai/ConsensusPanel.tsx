/**
 * ConsensusPanel - Multi-LLM comparison display
 *
 * Shows parallel responses from multiple LLMs with:
 * - Side-by-side response comparison
 * - Agreement highlighting
 * - Confidence indicator
 * - Model latency badges
 */

"use client";

import { cn } from "@ku0/shared/utils";
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface ModelResponseDisplay {
  providerId: string;
  modelId: string;
  content: string;
  success: boolean;
  error?: string;
  latencyMs: number;
}

export interface ConsensusPanelProps {
  /** Final consensus answer */
  finalAnswer?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Agreement ratio (0-1) */
  agreement?: number;
  /** Whether consensus was reached */
  hasConsensus?: boolean;
  /** Voting strategy used */
  votingStrategy?: "majority" | "unanimous" | "weighted";
  /** All model responses */
  modelResponses: ModelResponseDisplay[];
  /** Total execution time */
  totalDurationMs?: number;
  /** Loading state */
  isLoading?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

function ConfidenceBar({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  const color = value >= 0.8 ? "bg-green-500" : value >= 0.5 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground tabular-nums">{percentage}%</span>
    </div>
  );
}

function ModelBadge({
  providerId,
  modelId,
  success,
  latencyMs,
}: {
  providerId: string;
  modelId: string;
  success: boolean;
  latencyMs: number;
}) {
  const providerColors: Record<string, string> = {
    openai: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    claude: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    gemini: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    anthropic: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    google: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    deepseek: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
    moonshot: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  };

  const colorClass = providerColors[providerId] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="flex items-center gap-2">
      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", colorClass)}>
        {modelId}
      </span>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {success ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <XCircle className="h-3 w-3 text-red-500" />
        )}
        <Clock className="h-3 w-3" />
        {(latencyMs / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ConsensusPanel({
  finalAnswer,
  confidence = 0,
  agreement = 0,
  hasConsensus = false,
  votingStrategy = "majority",
  modelResponses,
  totalDurationMs,
  isLoading = false,
  className,
}: ConsensusPanelProps) {
  const [showResponses, setShowResponses] = React.useState(false);

  const successCount = modelResponses.filter((r) => r.success).length;
  const totalCount = modelResponses.length;

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border/50 bg-surface-1/50 p-4", className)}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Querying {totalCount} models...</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {modelResponses.map((r) => (
            <div
              key={`${r.providerId}-${r.modelId}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
              {r.modelId}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-1/50 backdrop-blur-sm overflow-hidden",
        hasConsensus ? "border-green-500/30" : "border-yellow-500/30",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 bg-surface-2/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasConsensus ? (
              <CheckCheck className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            )}
            <span className="text-sm font-medium">
              {hasConsensus ? "Consensus Reached" : "No Consensus"}
            </span>
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {votingStrategy}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              {successCount}/{totalCount} models
            </span>
            {totalDurationMs && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {(totalDurationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        {/* Confidence & Agreement */}
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Confidence
            </div>
            <ConfidenceBar value={confidence} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Agreement
            </div>
            <ConfidenceBar value={agreement} />
          </div>
        </div>
      </div>

      {/* Final Answer */}
      {finalAnswer && (
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Final Answer</span>
          </div>
          <div className="text-sm text-foreground whitespace-pre-wrap">{finalAnswer}</div>
        </div>
      )}

      {/* Model Responses Toggle */}
      <button
        type="button"
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
        onClick={() => setShowResponses(!showResponses)}
      >
        <span className="text-xs font-medium text-muted-foreground">Individual Responses</span>
        {showResponses ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Model Responses */}
      {showResponses && (
        <div className="divide-y divide-border/30">
          {modelResponses.map((response) => (
            <div
              key={`${response.providerId}-${response.modelId}`}
              className={cn("px-4 py-3", !response.success && "bg-red-500/5")}
            >
              <ModelBadge
                providerId={response.providerId}
                modelId={response.modelId}
                success={response.success}
                latencyMs={response.latencyMs}
              />
              {response.success ? (
                <div className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">
                  {response.content}
                </div>
              ) : (
                <div className="mt-2 text-sm text-red-500">Error: {response.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConsensusPanel;
