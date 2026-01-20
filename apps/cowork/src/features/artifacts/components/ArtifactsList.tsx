import type { ArtifactPayload } from "../../tasks/types";
import { DiffCard } from "./DiffCard";
import { LayoutGraphCard } from "./LayoutGraphCard";
import { PlanCard } from "./PlanCard";
import { PreflightCard } from "./PreflightCard";
import { ReportCard } from "./ReportCard";
import { VisualDiffCard } from "./VisualDiffCard";

interface ArtifactsListProps {
  artifacts: Record<
    string,
    ArtifactPayload & {
      status?: "pending" | "applied" | "reverted";
      appliedAt?: number;
    }
  >;
  onApply?: (artifactId: string) => void;
  onRevert?: (artifactId: string) => void;
}

export function ArtifactsList({ artifacts, onApply, onRevert }: ArtifactsListProps) {
  const list = Object.entries(artifacts);

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4 animate-in fade-in duration-700">
        <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-border/40 flex items-center justify-center text-muted-foreground/20">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Empty artifacts icon</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-tight">No artifacts yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">
            Generated files, plans and reports will appear here as the agent works.
          </p>
        </div>
      </div>
    );
  }

  const plans = list.filter(([_, a]) => a.type === "plan");
  const diffs = list.filter(([_, a]) => a.type === "diff");
  const visuals = list.filter(
    ([_, a]) => a.type === "LayoutGraph" || a.type === "VisualDiffReport"
  );
  const reports = list.filter(([_, a]) => a.type === "markdown" || a.type === "preflight");

  interface SectionProps {
    title: string;
    icon: React.ReactNode;
    items: typeof list;
  }

  const Section = ({ title, icon, items }: SectionProps) => {
    if (items.length === 0) {
      return null;
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          {icon}
          <h3 className="text-micro font-black uppercase tracking-[0.2em] text-muted-foreground/60">
            {title} ({items.length})
          </h3>
        </div>
        <div className="space-y-4">
          {items.map(([id, artifact]) => {
            switch (artifact.type) {
              case "diff":
                return (
                  <DiffCard
                    key={id}
                    file={artifact.file}
                    diff={artifact.diff}
                    status={artifact.status}
                    appliedAt={artifact.appliedAt}
                    onApply={onApply ? () => onApply(id) : undefined}
                    onRevert={onRevert ? () => onRevert(id) : undefined}
                  />
                );
              case "plan":
                return <PlanCard key={id} steps={artifact.steps} />;
              case "markdown":
                return (
                  <ReportCard
                    key={id}
                    title={
                      artifact.content.split("\n")[0].replace(/^#+\s*/, "") || "Markdown Artifact"
                    }
                    content={artifact.content}
                  />
                );
              case "preflight":
                return <PreflightCard key={id} payload={artifact} />;
              case "LayoutGraph":
                return <LayoutGraphCard key={id} graph={artifact} />;
              case "VisualDiffReport":
                return <VisualDiffCard key={id} report={artifact} />;
              default:
                return null;
            }
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 p-4">
      <Section
        title="Plans"
        icon={<div className="w-1.5 h-1.5 rounded-full bg-accent-indigo" />}
        items={plans}
      />
      <Section
        title="File Changes"
        icon={<div className="w-1.5 h-1.5 rounded-full bg-accent-amber" />}
        items={diffs}
      />
      <Section
        title="Visuals"
        icon={<div className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />}
        items={visuals}
      />
      <Section
        title="Reports"
        icon={<div className="w-1.5 h-1.5 rounded-full bg-accent-indigo" />}
        items={reports}
      />
    </div>
  );
}
