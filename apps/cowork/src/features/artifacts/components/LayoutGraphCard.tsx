import type { CSSProperties } from "react";
import type { ArtifactPayload } from "../../tasks/types";

interface LayoutGraphCardProps {
  graph: Extract<ArtifactPayload, { type: "LayoutGraph" }>;
}

export function LayoutGraphCard({ graph }: LayoutGraphCardProps) {
  const { width, height } = resolveCanvasSize(graph.nodes);
  const typeCounts = countNodeTypes(graph.nodes);

  return (
    <div className="bg-surface-1 border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
        <div>
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-widest">
            Layout Graph
          </div>
          <div className="text-xs text-muted-foreground">
            {graph.nodes.length} nodes / {graph.edges.length} edges
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div
          className="relative w-full rounded-xl border border-border/40 bg-surface-1/60 overflow-hidden"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {graph.nodes.map((node) => {
            const style = boundsToStyle(node.bounds, width, height);
            return (
              <div
                key={node.id}
                className={`absolute border ${resolveNodeColor(node.type)} rounded-sm`}
                style={style}
                title={`${node.id} (${node.type})`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 rounded-full border border-border/40 bg-surface-2/60">
            Text {typeCounts.text}
          </span>
          <span className="px-2 py-1 rounded-full border border-border/40 bg-surface-2/60">
            Controls {typeCounts.control}
          </span>
          <span className="px-2 py-1 rounded-full border border-border/40 bg-surface-2/60">
            Images {typeCounts.image}
          </span>
          <span className="px-2 py-1 rounded-full border border-border/40 bg-surface-2/60">
            Containers {typeCounts.container}
          </span>
        </div>
      </div>
    </div>
  );
}

function resolveCanvasSize(nodes: LayoutGraphCardProps["graph"]["nodes"]): {
  width: number;
  height: number;
} {
  let width = 1;
  let height = 1;

  for (const node of nodes) {
    width = Math.max(width, node.bounds.x + node.bounds.width);
    height = Math.max(height, node.bounds.y + node.bounds.height);
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

function resolveNodeColor(type: string): string {
  switch (type) {
    case "text":
      return "border-sky-400/70";
    case "control":
      return "border-emerald-400/70";
    case "image":
      return "border-amber-400/70";
    default:
      return "border-muted-foreground/40";
  }
}

function countNodeTypes(
  nodes: LayoutGraphCardProps["graph"]["nodes"]
): Record<"text" | "control" | "image" | "container", number> {
  return nodes.reduce(
    (acc, node) => {
      if (node.type === "text") {
        acc.text += 1;
      } else if (node.type === "control") {
        acc.control += 1;
      } else if (node.type === "image") {
        acc.image += 1;
      } else {
        acc.container += 1;
      }
      return acc;
    },
    { text: 0, control: 0, image: 0, container: 0 }
  );
}
