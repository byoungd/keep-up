import type { ArtifactPayload } from "../../tasks/types";

type ReportCardArtifactPayload = Extract<ArtifactPayload, { type: "ReportCard" }>;

interface ReportCardArtifactProps {
  payload: ReportCardArtifactPayload;
}

export function ReportCardArtifact({ payload }: ReportCardArtifactProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
          Report
        </div>
        <p className="text-sm text-foreground mt-1">{payload.summary}</p>
      </div>

      {payload.sections && payload.sections.length > 0 && (
        <div className="space-y-3">
          {payload.sections.map((section) => (
            <div key={section.heading} className="space-y-1">
              <div className="text-xs font-semibold text-foreground">{section.heading}</div>
              <p className="text-xs text-muted-foreground whitespace-pre-line">{section.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
