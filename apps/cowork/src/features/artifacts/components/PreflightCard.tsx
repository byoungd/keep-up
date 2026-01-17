"use client";

import type { ArtifactPayload } from "../../tasks/types";

type PreflightPayload = Extract<ArtifactPayload, { type: "preflight" }>;

interface PreflightCardProps {
  payload: PreflightPayload;
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function statusTone(status: PreflightPayload["report"]["checks"][number]["status"]) {
  switch (status) {
    case "pass":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "fail":
      return "text-destructive bg-destructive/10 border-destructive/20";
    default:
      return "text-muted-foreground bg-muted border-border/60";
  }
}

export function PreflightCard({ payload }: PreflightCardProps) {
  const { report, selectionNotes, changedFiles } = payload;
  const createdAt = new Date(report.createdAt).toLocaleString();

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm my-4 overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border flex flex-wrap gap-3 justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-accent-blue"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <title>Preflight icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-7 8h8a2 2 0 002-2V8l-6-6H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="font-bold text-foreground text-sm tracking-tight">Preflight Report</span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full border border-border/60 bg-surface-2">
            {report.riskSummary}
          </span>
          <span>{createdAt}</span>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {selectionNotes.length > 0 ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {selectionNotes.map((note) => (
              <div key={note} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        ) : null}

        {changedFiles.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            {changedFiles.length} file{changedFiles.length === 1 ? "" : "s"} changed.
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No file changes detected.</div>
        )}

        <div className="space-y-2">
          {report.checks.length === 0 ? (
            <div className="text-xs text-muted-foreground">No checks were executed.</div>
          ) : (
            report.checks.map((check) => (
              <details
                key={check.id}
                className="rounded-lg border border-border/70 bg-surface-1/60"
              >
                <summary className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{check.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {check.command} {check.args.join(" ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusTone(
                        check.status
                      )}`}
                    >
                      {check.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDuration(check.durationMs)}
                    </span>
                  </div>
                </summary>
                <div className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {check.output ? check.output : "No output captured."}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
