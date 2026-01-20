import type { ArtifactPayload } from "../../tasks/types";

type TestReportPayload = Extract<ArtifactPayload, { type: "TestReport" }>;

interface TestReportCardProps {
  payload: TestReportPayload;
}

const STATUS_STYLES: Record<TestReportPayload["status"], string> = {
  passed: "bg-success/10 text-success border-success/30",
  failed: "bg-error/10 text-error border-error/30",
  skipped: "bg-warning/10 text-warning border-warning/30",
};

export function TestReportCard({ payload }: TestReportCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
            Test Report
          </div>
          <h3 className="text-sm font-semibold text-foreground mt-1">{payload.command}</h3>
        </div>
        <span
          className={`text-xs font-semibold uppercase px-2 py-1 rounded-full border ${STATUS_STYLES[payload.status]}`}
        >
          {payload.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>Duration: {(payload.durationMs / 1000).toFixed(2)}s</span>
        {payload.summary && <span className="truncate">{payload.summary}</span>}
      </div>
    </div>
  );
}
