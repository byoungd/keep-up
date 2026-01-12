"use client";

import { Button } from "@/components/ui/Button";
import { Trash2 } from "lucide-react";

export interface MetricsBarProps {
  ttft: number | null;
  totalLatency: number | null;
  chunkCount: number;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  onJumpToLatest: () => void;
  onReset: () => void;
  translations: {
    ttft: string;
    latency: string;
    chunks: string;
    jumpToLatest: string;
    autoScrollOn: string;
    autoScrollOff: string;
    reset: string;
  };
}

function formatLatency(ms?: number | null) {
  if (ms === null || ms === undefined) {
    return null;
  }
  return `${ms.toFixed(0)}ms`;
}

export function MetricsBar({
  ttft,
  totalLatency,
  chunkCount,
  autoScroll,
  onAutoScrollToggle,
  onJumpToLatest,
  onReset,
  translations,
}: MetricsBarProps) {
  return (
    <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/40 bg-surface-1/50 flex flex-wrap items-center gap-2">
      <MetricPill label={translations.ttft} value={formatLatency(ttft)} />
      <MetricPill label={translations.latency} value={formatLatency(totalLatency)} />
      {chunkCount > 0 ? <MetricPill label={translations.chunks} value={chunkCount} /> : null}
      <div className="ml-auto flex items-center gap-2">
        {!autoScroll ? (
          <Button variant="ghost" size="compact" className="text-[11px]" onClick={onJumpToLatest}>
            {translations.jumpToLatest}
          </Button>
        ) : null}
        <Button variant="ghost" size="compact" className="text-[11px]" onClick={onAutoScrollToggle}>
          {autoScroll ? translations.autoScrollOn : translations.autoScrollOff}
        </Button>
        <Button variant="ghost" size="compact" className="text-[11px]" onClick={onReset}>
          <Trash2 className="h-3.5 w-3.5" />
          <span className="ml-1">{translations.reset}</span>
        </Button>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number | null }) {
  if (!value) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-surface-2/70 px-2.5 py-1 text-[11px] text-foreground/80">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}
