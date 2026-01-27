import type { ArtifactPayload } from "../../tasks/types";

type DiffCardArtifactPayload = Extract<ArtifactPayload, { type: "DiffCard" }>;

interface DiffCardArtifactProps {
  payload: DiffCardArtifactPayload;
}

export function DiffCardArtifact({ payload }: DiffCardArtifactProps) {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-micro text-muted-foreground/60 font-black uppercase tracking-[0.2em]">
            Diff Summary
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {payload.summary ?? "Code changes detected"}
          </h3>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-surface-2 px-2 py-1 rounded-full">
          {payload.files.length} files
        </span>
      </div>

      <div className="space-y-3">
        {payload.files.map((file) => (
          <details
            key={file.path}
            className="rounded-lg border border-border/50 bg-surface-1/70 overflow-hidden"
          >
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-between">
              <span className="truncate">{file.path}</span>
              <span className="text-micro text-muted-foreground uppercase tracking-[0.2em]">
                view diff
              </span>
            </summary>
            <div className="border-t border-border/40">
              <DiffPreview diff={file.diff} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <div
      className="overflow-x-auto bg-surface-1/80 text-fine font-mono leading-relaxed"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
      tabIndex={0}
    >
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => {
            const isAdd = line.startsWith("+");
            const isDel = line.startsWith("-");
            return (
              <tr
                key={`${index}-${line.substring(0, 12)}`}
                className={`${isAdd ? "bg-success/10" : isDel ? "bg-destructive/10" : ""}`}
              >
                <td className="w-8 sticky left-0 bg-inherit text-right pr-2 text-muted-foreground/50 select-none border-r border-border user-select-none">
                  {index + 1}
                </td>
                <td
                  className={`whitespace-pre px-2 ${isAdd ? "text-success" : isDel ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {line}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
