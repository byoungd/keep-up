import { ArtifactsList } from "../features/artifacts/components/ArtifactsList";
import type { TaskGraph } from "../features/tasks/types";

interface ArtifactRailProps {
  sessionId: string;
  graph: TaskGraph;
  onApplyArtifact?: (artifactId: string) => void;
  onRevertArtifact?: (artifactId: string) => void;
}

export function ArtifactRail({
  sessionId,
  graph,
  onApplyArtifact,
  onRevertArtifact,
}: ArtifactRailProps) {
  return (
    <aside className="artifact-rail" aria-label="Artifact rail">
      <div className="card-panel h-full flex flex-col p-0 overflow-hidden">
        <div className="p-3 border-b border-border/40 bg-surface-0/90 backdrop-blur-md">
          <p className="text-sm font-semibold text-foreground">Artifact Rail</p>
          <p className="text-xs text-muted-foreground">Session {sessionId.slice(0, 8)}...</p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
          <ArtifactsList
            artifacts={graph.artifacts}
            onApply={onApplyArtifact}
            onRevert={onRevertArtifact}
          />
        </div>
      </div>
    </aside>
  );
}
