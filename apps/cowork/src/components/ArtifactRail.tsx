import { ArtifactsList } from "../features/artifacts/components/ArtifactsList";
import { ClarificationPanel } from "../features/clarifications/components/ClarificationPanel";
import type { TaskGraph } from "../features/tasks/types";
import { SkillsPanel } from "./session/SkillsPanel";

interface ArtifactRailProps {
  sessionId: string;
  graph: TaskGraph;
  onApplyArtifact?: (artifactId: string) => void;
  onRevertArtifact?: (artifactId: string) => void;
  onAnswerClarification?: (input: {
    requestId: string;
    answer: string;
    selectedOption?: number;
  }) => Promise<void>;
}

export function ArtifactRail({
  sessionId,
  graph,
  onApplyArtifact,
  onRevertArtifact,
  onAnswerClarification,
}: ArtifactRailProps) {
  return (
    <aside className="artifact-rail" aria-label="Artifact rail">
      <div className="card-panel h-full flex flex-col p-0 overflow-hidden">
        <div className="p-3 border-b border-border/40 bg-surface-0">
          <p className="text-sm font-semibold text-foreground">Artifact Rail</p>
          <p className="text-xs text-muted-foreground">Session {sessionId.slice(0, 8)}...</p>
        </div>
        <section
          className="flex-1 overflow-y-auto scrollbar-auto-hide"
          aria-label="Artifacts list"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
          tabIndex={0}
        >
          <SkillsPanel
            skills={graph.skills}
            activeSkills={graph.activeSkills}
            errors={graph.skillErrors}
          />
          {graph.clarifications.length > 0 && onAnswerClarification && (
            <ClarificationPanel
              clarifications={graph.clarifications}
              onAnswer={onAnswerClarification}
            />
          )}
          <ArtifactsList
            artifacts={graph.artifacts}
            onApply={onApplyArtifact}
            onRevert={onRevertArtifact}
          />
        </section>
      </div>
    </aside>
  );
}
