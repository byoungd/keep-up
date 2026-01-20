import type { ArtifactPayload } from "../../tasks/types";

type ReviewReportPayload = Extract<ArtifactPayload, { type: "ReviewReport" }>;

interface ReviewReportCardProps {
  payload: ReviewReportPayload;
}

export function ReviewReportCard({ payload }: ReviewReportCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
          Review Report
        </div>
        <p className="text-sm text-foreground mt-1">{payload.summary}</p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-foreground">Risks</div>
        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
          {payload.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </div>

      {payload.recommendations && payload.recommendations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">Recommendations</div>
          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
            {payload.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
