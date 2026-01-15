import type { ArtifactPayload } from "../../tasks/types";
import { DiffCard } from "./DiffCard";
import { PlanCard } from "./PlanCard";
import { ReportCard } from "./ReportCard";

interface ArtifactsListProps {
  artifacts: Record<string, ArtifactPayload>;
}

export function ArtifactsList({ artifacts }: ArtifactsListProps) {
  const list = Object.entries(artifacts);

  if (list.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">No artifacts created yet.</div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {list.map(([id, artifact]) => {
        switch (artifact.type) {
          case "diff":
            return <DiffCard key={id} file={artifact.file} diff={artifact.diff} />;
          case "plan":
            return <PlanCard key={id} steps={artifact.steps} />;
          case "markdown":
            return <ReportCard key={id} content={artifact.content} />;
          default:
            return (
              <div
                key={id}
                className="p-2 border border-destructive/20 bg-destructive/10 text-destructive text-xs rounded"
              >
                Unknown artifact type
              </div>
            );
        }
      })}
    </div>
  );
}
