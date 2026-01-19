"use client";

import type { PreflightCheckDefinition } from "@ku0/agent-runtime";
import { cn } from "@ku0/shared/utils";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CoworkArtifact,
  listPreflightChecks,
  listSessionArtifacts,
  type PreflightArtifact,
  runPreflight,
} from "../../api/coworkApi";
import { ArtifactPayloadSchema } from "../tasks/types";

type PreflightRecord = {
  record: CoworkArtifact;
  payload: PreflightArtifact;
};

function toPreflightRecord(record: CoworkArtifact): PreflightRecord | null {
  const parsed = ArtifactPayloadSchema.safeParse(record.artifact);
  if (!parsed.success || parsed.data.type !== "preflight") {
    return null;
  }
  return { record, payload: parsed.data };
}

/**
 * Content-only version of PreflightPanel for embedding in ContextPanel tabs.
 */
export function PreflightPanelContent() {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const resolvedSessionId = sessionId && sessionId !== "undefined" ? sessionId : null;

  const [allowlist, setAllowlist] = useState<PreflightCheckDefinition[]>([]);
  const [latest, setLatest] = useState<PreflightRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAllowlist = useCallback(async () => {
    setErrorMessage(null);
    try {
      const checks = await listPreflightChecks();
      setAllowlist(checks);
    } catch {
      setErrorMessage("Failed to load preflight checks.");
    }
  }, []);

  const loadLatest = useCallback(async () => {
    if (!resolvedSessionId) {
      setLatest(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const artifacts = await listSessionArtifacts(resolvedSessionId);
      const preflights = artifacts
        .map(toPreflightRecord)
        .filter((record): record is PreflightRecord => Boolean(record))
        .sort((a, b) => b.record.updatedAt - a.record.updatedAt);
      setLatest(preflights[0] ?? null);
    } catch {
      setErrorMessage("Failed to load preflight history.");
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId]);

  useEffect(() => {
    void loadAllowlist();
  }, [loadAllowlist]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleRun = useCallback(async () => {
    if (!resolvedSessionId) {
      setErrorMessage("Start a session to run preflight checks.");
      return;
    }
    setIsRunning(true);
    setErrorMessage(null);
    try {
      const result = await runPreflight({ sessionId: resolvedSessionId });
      const preflight = toPreflightRecord(result.artifact);
      if (preflight) {
        setLatest(preflight);
      } else {
        await loadLatest();
      }
    } catch {
      setErrorMessage("Preflight run failed.");
    } finally {
      setIsRunning(false);
    }
  }, [resolvedSessionId, loadLatest]);

  const checksSummary = useMemo(() => {
    if (allowlist.length === 0) {
      return "No preflight checks configured.";
    }
    return `${allowlist.length} checks available.`;
  }, [allowlist.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-4 space-y-4">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}

        {/* Run Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Run Preflight</p>
              <p className="text-xs text-muted-foreground">{checksSummary}</p>
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              className={cn(
                "px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors",
                isRunning ? "opacity-70 cursor-wait" : ""
              )}
            >
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>

          {allowlist.length > 0 ? (
            <div className="rounded-lg border border-border/40 bg-surface-1/70 p-2 space-y-1">
              {allowlist.map((check) => (
                <div key={check.id} className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{check.name}</span>
                  {check.description ? ` · ${check.description}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Latest Report */}
        <section className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Latest Report</p>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : latest ? (
            <div className="rounded-lg border border-border/40 bg-surface-1/70 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Preflight Report</p>
                <span className="text-micro text-muted-foreground">
                  {new Date(latest.payload.report.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{latest.payload.report.riskSummary}</p>
              {latest.payload.report.checks.length > 0 ? (
                <div className="space-y-1">
                  {latest.payload.report.checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{check.name}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-full border text-micro uppercase",
                          check.status === "pass"
                            ? "border-success/30 text-success bg-success/10"
                            : check.status === "fail"
                              ? "border-destructive/30 text-destructive bg-destructive/10"
                              : "border-border/60 text-muted-foreground bg-muted"
                        )}
                      >
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No checks executed.</p>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No preflight reports yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
