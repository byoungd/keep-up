"use client";

import type { ConsentDecision, ConsentOverride, ContextPayload } from "@/lib/ai/contextPrivacy";
import { cn } from "@keepup/shared/utils";
import { AlertTriangle, ChevronRight, Globe, Quote } from "lucide-react";
import * as React from "react";

export interface ContextStatusTranslations {
  contextSourceSelection: string;
  contextSourceVisible: string;
  contextSharingOn: string;
  contextSharingPending: string;
  contextSharingOff: string;
  contextPreviewHide: string;
  contextPreviewShow: string;
  contextGlobalLabel: string;
  contextToggleOn: string;
  contextToggleOff: string;
  contextDocLabel: string;
  contextDocInherit: string;
  contextDocAllow: string;
  contextDocDeny: string;
  contextSharingActive: string;
  contextSharingInactive: string;
  contextDisclosureTitle: string;
  contextDisclosureBody: string;
  contextDisclosureAcknowledge: string;
  contextPreviewTitle: string;
  contextRedactions: string;
  contextTruncated: string;
}

export interface ConsentState {
  globalAllow: boolean;
}

export interface ContextStatusPanelProps {
  contextPayload: ContextPayload;
  decision: ConsentDecision;
  consentState: ConsentState;
  docId?: string;
  docOverride?: ConsentOverride;
  providerLabel: string;
  contextPreviewOpen: boolean;
  onTogglePreview: () => void;
  onSetGlobalAllow: (value: boolean) => void;
  onSetDocOverride: (docId: string, override: ConsentOverride | "inherit") => void;
  onAcceptDisclosure: () => void;
  translations: ContextStatusTranslations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (extracted for complexity reduction)
// ─────────────────────────────────────────────────────────────────────────────

/** Header icon based on decision state */
function HeaderIcon({ decision }: { decision: ConsentDecision }) {
  if (decision.needsDisclosure) {
    return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
  }
  return (
    <Globe
      className={cn(
        "h-3.5 w-3.5",
        decision.allowContext ? "text-primary/70" : "text-muted-foreground/50"
      )}
    />
  );
}

function DisclosureWarning({
  providerLabel,
  onAcceptDisclosure,
  translations: t,
}: {
  providerLabel: string;
  onAcceptDisclosure: () => void;
  translations: ContextStatusTranslations;
}) {
  return (
    <div className="rounded-md border-l-2 border-amber-500/50 bg-amber-500/5 pl-3 pr-2 py-2 text-[10px]">
      <div className="font-medium text-amber-600 dark:text-amber-400 mb-0.5">
        {t.contextDisclosureTitle}
      </div>
      <div className="text-muted-foreground/80 mb-2 leading-relaxed">
        {t.contextDisclosureBody.replace("{provider}", providerLabel)}
      </div>
      <button
        type="button"
        onClick={onAcceptDisclosure}
        className="text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:underline underline-offset-2 transition-colors"
      >
        {t.contextDisclosureAcknowledge} →
      </button>
    </div>
  );
}

function ContextPreview({
  contextPayload,
  translations: t,
}: {
  contextPayload: ContextPayload;
  translations: ContextStatusTranslations;
}) {
  return (
    <div className="mt-1 border-l-2 border-border/30 pl-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] text-muted-foreground/70 font-medium">
          {t.contextPreviewTitle}
        </span>
        {contextPayload.redactions.total > 0 && (
          <span className="text-[9px] text-muted-foreground/50">
            {t.contextRedactions.replace("{count}", String(contextPayload.redactions.total))}
          </span>
        )}
      </div>
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[9px] font-mono text-muted-foreground/60 leading-relaxed">
        {contextPayload.text}
      </pre>
      {contextPayload.sections.some((section) => section.truncated) && (
        <div className="mt-1 text-[9px] text-muted-foreground/50">{t.contextTruncated}</div>
      )}
    </div>
  );
}

/**
 * ContextStatusPanel - Linear-style collapsible context indicator
 * Minimal by default, expands on click for controls.
 */
export const ContextStatusPanel = React.memo(function ContextStatusPanel({
  contextPayload,
  decision,
  consentState,
  docId,
  docOverride,
  providerLabel,
  contextPreviewOpen,
  onTogglePreview,
  onSetGlobalAllow,
  onSetDocOverride,
  onAcceptDisclosure,
  translations: t,
}: ContextStatusPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(decision.needsDisclosure);

  // Auto-expand if disclosure needed
  React.useEffect(() => {
    if (decision.needsDisclosure) {
      setIsExpanded(true);
    }
  }, [decision.needsDisclosure]);

  const summaryLabel = React.useMemo(() => {
    if (decision.needsDisclosure) {
      return t.contextSharingPending;
    }
    if (decision.allowContext) {
      return t.contextSharingOn;
    }
    return t.contextSharingOff;
  }, [decision, t]);

  const sourceCount = contextPayload.sections.length;
  const hasSelectedText = contextPayload.sections.some(
    (section) => section.label === "Selected Text"
  );

  return (
    <div className="transition-all duration-200">
      {/* Collapsed: Minimal Inline StatusBar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "group flex w-full items-center justify-between px-1 py-1.5 text-[10px] transition-colors duration-100 rounded-md",
          "text-muted-foreground/60 hover:text-muted-foreground hover:bg-surface-2/30",
          decision.needsDisclosure && "text-amber-500/80 hover:text-amber-500"
        )}
      >
        <div className="flex items-center gap-1.5">
          <HeaderIcon decision={decision} />
          <span
            className={cn(
              "font-medium",
              decision.needsDisclosure ? "text-amber-600" : "text-foreground"
            )}
          >
            {summaryLabel}
          </span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums text-foreground">
            {sourceCount} source{sourceCount !== 1 ? "s" : ""}
          </span>
          {hasSelectedText && <Quote className="h-2.5 w-2.5 opacity-40" />}
        </div>
        <ChevronRight
          className={cn(
            "h-3 w-3 opacity-40 group-hover:opacity-70 transition-all duration-100",
            isExpanded && "rotate-90"
          )}
        />
      </button>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="pl-5 pb-2 pt-1.5 space-y-2 border-l-2 border-border/20 ml-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Global & Doc Toggles */}
          <div className="flex items-center gap-3 text-[10px]">
            <button
              type="button"
              onClick={() => onSetGlobalAllow(!consentState.globalAllow)}
              className={cn(
                "font-medium transition-colors",
                consentState.globalAllow
                  ? "text-primary hover:text-primary/80"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {consentState.globalAllow ? t.contextToggleOn : t.contextToggleOff}
            </button>

            {docId && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <select
                  value={docOverride ?? "inherit"}
                  onChange={(e) => {
                    const val = e.target.value;
                    onSetDocOverride(
                      docId,
                      val === "inherit" ? "inherit" : (val as ConsentOverride)
                    );
                  }}
                  className="bg-transparent text-[10px] font-medium text-muted-foreground hover:text-foreground appearance-none cursor-pointer focus:outline-none pr-4"
                >
                  <option value="inherit">{t.contextDocInherit}</option>
                  <option value="allow">{t.contextDocAllow}</option>
                  <option value="deny">{t.contextDocDeny}</option>
                </select>
              </>
            )}

            <span className="text-muted-foreground/30">|</span>
            <button
              type="button"
              onClick={onTogglePreview}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {contextPreviewOpen ? t.contextPreviewHide : t.contextPreviewShow}
            </button>
          </div>

          {/* Disclosure Warning */}
          {decision.needsDisclosure && (
            <DisclosureWarning
              providerLabel={providerLabel}
              onAcceptDisclosure={onAcceptDisclosure}
              translations={t}
            />
          )}

          {/* Context Preview */}
          {contextPreviewOpen && (
            <ContextPreview contextPayload={contextPayload} translations={t} />
          )}
        </div>
      )}
    </div>
  );
});
