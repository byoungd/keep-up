import type { CSSProperties } from "react";
import type { ArtifactPayload } from "../../tasks/types";

interface VisualDiffCardProps {
  report: Extract<ArtifactPayload, { type: "VisualDiffReport" }>;
}

export function VisualDiffCard({ report }: VisualDiffCardProps) {
  const { width, height } = resolveCanvasSize(report.regions);
  const topRegions = [...report.regions].sort((a, b) => b.score - a.score).slice(0, 5);

  return (
    <div className="bg-surface-1 border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
        <div>
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-widest">
            Visual Diff
          </div>
          <div className="text-xs text-muted-foreground">
            {report.summary.changedRegions} regions / max score {report.summary.maxScore.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div
          className="relative w-full rounded-xl border border-border/40 bg-surface-1/60 overflow-hidden"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {report.regions.map((region) => {
            const style = boundsToStyle(region.bounds, width, height);
            return (
              <div
                key={region.id}
                className={`absolute border ${resolveDiffColor(region.changeType)} rounded-sm`}
                style={style}
                title={`${region.changeType} - ${region.score.toFixed(2)}`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded-full border border-border/40 bg-emerald-500/10 text-emerald-400">
            Added
          </span>
          <span className="px-2 py-1 rounded-full border border-border/40 bg-amber-500/10 text-amber-400">
            Modified
          </span>
          <span className="px-2 py-1 rounded-full border border-border/40 bg-rose-500/10 text-rose-400">
            Removed
          </span>
        </div>
        {topRegions.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {topRegions.map((region) => (
              <div key={`${region.id}-summary`} className="flex items-center justify-between">
                <span className="uppercase tracking-wide">{region.changeType}</span>
                <span>{region.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function resolveCanvasSize(regions: VisualDiffCardProps["report"]["regions"]): {
  width: number;
  height: number;
} {
  let width = 1;
  let height = 1;

  for (const region of regions) {
    width = Math.max(width, region.bounds.x + region.bounds.width);
    height = Math.max(height, region.bounds.y + region.bounds.height);
  }

  return { width, height };
}

function boundsToStyle(
  bounds: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): CSSProperties {
  return {
    left: `${(bounds.x / canvasWidth) * 100}%`,
    top: `${(bounds.y / canvasHeight) * 100}%`,
    width: `${(bounds.width / canvasWidth) * 100}%`,
    height: `${(bounds.height / canvasHeight) * 100}%`,
  };
}

function resolveDiffColor(type: string): string {
  switch (type) {
    case "added":
      return "border-emerald-400/70";
    case "removed":
      return "border-rose-400/70";
    default:
      return "border-amber-400/70";
  }
}
