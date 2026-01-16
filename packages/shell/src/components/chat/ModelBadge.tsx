"use client";

import { cn } from "@ku0/shared/utils";
import { AlertTriangle } from "lucide-react";
import { getModelCapability } from "../../lib/ai/models";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  claude: "Anthropic",
  gemini: "Google",
};

function formatProviderLabel(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }
  return (
    PROVIDER_LABELS[providerId] ?? `${providerId.slice(0, 1).toUpperCase()}${providerId.slice(1)}`
  );
}

export function ModelBadge({
  modelId,
  providerId,
  fallbackNotice,
  size = "sm",
  className,
}: {
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const resolved = getModelCapability(modelId);
  const providerLabel = formatProviderLabel(providerId ?? resolved?.provider);
  const modelLabel = resolved?.label ?? modelId;

  if (!providerLabel && !modelLabel) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-surface-1/70 text-muted-foreground",
        fallbackNotice ? "border-amber-500/40 text-amber-600/90" : "border-border/50",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        className
      )}
      title={fallbackNotice}
    >
      {providerLabel && <span className="font-medium">{providerLabel}</span>}
      {providerLabel && modelLabel && <span className="opacity-50">•</span>}
      {modelLabel && <span className="truncate max-w-[160px]">{modelLabel}</span>}
      {fallbackNotice && <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />}
    </span>
  );
}
