import type { TokenUsageStats } from "@ku0/agent-runtime";
import { MODEL_CATALOG, type ModelCapability } from "@ku0/ai-core";
import { useMemo } from "react";

interface CostMeterProps {
  usage?: TokenUsageStats;
  modelId: string;
}

export function CostMeter({ usage, modelId }: CostMeterProps) {
  const cost = useMemo(() => {
    if (!usage) {
      return null;
    }
    const model = MODEL_CATALOG.find((m) => m.id === modelId) as ModelCapability | undefined;
    const pricing = model?.pricing;

    return {
      value: pricing
        ? (usage.inputTokens / 1_000_000) * pricing.inputTokensPer1M +
          (usage.outputTokens / 1_000_000) * pricing.outputTokensPer1M
        : null,
      contextWindow: model?.contextWindow,
    };
  }, [usage, modelId]);

  if (!usage) {
    return null;
  }

  const utilization = cost?.contextWindow ? (usage.totalTokens / cost.contextWindow) * 100 : 0;

  const isWarning = utilization > 80;
  const isCritical = utilization > 95;

  return (
    <div className="flex items-center gap-3 text-micro text-muted-foreground mr-2">
      <div className="flex items-center gap-1" title="Input Tokens">
        <svg
          className="w-3 h-3 text-muted-foreground/70"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Input Tokens</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
        <span>{(usage.inputTokens / 1000).toFixed(1)}k</span>
      </div>
      <div className="flex items-center gap-1" title="Output Tokens">
        <svg
          className="w-3 h-3 text-muted-foreground/70"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <title>Output Tokens</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 10l7-7m0 0l7 7m-7-7v18"
          />
        </svg>
        <span>{(usage.outputTokens / 1000).toFixed(1)}k</span>
      </div>
      {(isWarning || isCritical) && (
        <div
          className={`flex items-center gap-1 font-medium ${
            isCritical ? "text-destructive" : "text-warning"
          }`}
          title={`Context Usage: ${utilization.toFixed(1)}%`}
        >
          <span className="i-lucide-alert-triangle w-3 h-3" />
          <span>{utilization.toFixed(0)}%</span>
        </div>
      )}
      {cost && (
        <div
          className="flex items-center gap-1 font-medium text-foreground/80 pl-1 border-l border-border/50"
          title="Estimated Cost"
        >
          <span>{cost.value === null ? "N/A" : `$${cost.value.toFixed(4)}`}</span>
        </div>
      )}
    </div>
  );
}
