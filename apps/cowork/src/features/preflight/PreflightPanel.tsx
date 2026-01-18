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

export function PreflightPanel({ onClose }: { onClose: () => void }) {
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
    } catch (error) {
      setErrorMessage("Failed to load preflight checks.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load preflight checks", error);
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
    } catch (error) {
      setErrorMessage("Failed to load preflight history.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to load preflight history", error);
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
    } catch (error) {
      setErrorMessage("Preflight run failed.");
      // biome-ignore lint/suspicious/noConsole: Expected error logging
      console.error("Failed to run preflight", error);
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
    <div className="flex flex-col h-full bg-surface-0 border-l border-border shadow-xl w-[520px] animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-50/50 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Preflight QA</h2>
          <p className="text-xs text-muted-foreground">
            Run targeted lint, typecheck, and test validation.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-surface-100 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close preflight panel"
        >
          X
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {errorMessage ? (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/10 px-3 py-2 rounded-md">
            {errorMessage}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Run preflight</p>
              <p className="text-xs text-muted-foreground">{checksSummary}</p>
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              className={cn(
                "px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm",
                isRunning ? "opacity-70 cursor-wait" : ""
              )}
            >
              {isRunning ? "Running..." : "Run now"}
            </button>
          </div>

          {allowlist.length > 0 ? (
            <div className="rounded-lg border border-border/40 bg-surface-50/70 p-3 space-y-2">
              {allowlist.map((check) => (
                <div key={check.id} className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{check.name}</span>
                  {check.description ? ` · ${check.description}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Latest report</p>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading preflight report...</div>
          ) : latest ? (
            <div className="rounded-lg border border-border/40 bg-surface-50/70 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Preflight Report</p>
                <span className="text-xs text-muted-foreground">
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
                          "px-2 py-0.5 rounded-full border text-micro uppercase tracking-wider",
                          check.status === "pass"
                            ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
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
