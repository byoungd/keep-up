import { type ArtifactItem, ArtifactPreviewPane } from "@ku0/shell";
import { useEffect, useMemo, useState } from "react";
import { type CoworkArtifact, listLibraryArtifacts } from "../../api/coworkApi";
import { type ArtifactPayload, ArtifactPayloadSchema } from "../../features/tasks/types";

type LibraryItem = {
  record: CoworkArtifact;
  payload: ArtifactPayload;
  item: ArtifactItem;
  snippet: string;
};

export function LibraryRoute() {
  const [artifacts, setArtifacts] = useState<CoworkArtifact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError(null);
    listLibraryArtifacts()
      .then((data) => {
        if (!isActive) {
          return;
        }
        setArtifacts(data);
      })
      .catch((_error) => {
        if (!isActive) {
          return;
        }
        setError("Failed to load library artifacts.");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const items = useMemo(() => buildLibraryItems(artifacts), [artifacts]);
  const selected = items.find((item) => item.record.artifactId === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    setSelectedId((current) => {
      if (!selected) {
        return null;
      }
      if (selected.record.artifactId === current) {
        return current;
      }
      return selected.record.artifactId;
    });
  }, [selected]);

  return (
    <div className="page-grid">
      <section className="card-panel grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Library</p>
            <p className="text-xs text-muted-foreground">
              Deliverables from all sessions appear here.
            </p>
          </div>

          <LibraryListPanel
            isLoading={isLoading}
            error={error}
            items={items}
            activeId={selected?.record.artifactId ?? null}
            onSelect={setSelectedId}
          />
        </div>

        <div className="rounded-2xl border border-border/40 bg-surface-1/70 min-h-[360px] overflow-hidden">
          {selected ? (
            <ArtifactPreviewPane
              item={selected.item}
              onClose={() => setSelectedId(null)}
              className="h-full"
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Select an artifact to preview.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function buildLibraryItems(records: CoworkArtifact[]): LibraryItem[] {
  const items: LibraryItem[] = [];
  for (const record of records) {
    const parsed = ArtifactPayloadSchema.safeParse(record.artifact);
    if (!parsed.success) {
      continue;
    }
    const payload = parsed.data;
    const item = toArtifactItem(record, payload);
    items.push({
      record,
      payload,
      item,
      snippet: buildSnippet(payload),
    });
  }
  return items;
}

type LibraryListPanelProps = {
  isLoading: boolean;
  error: string | null;
  items: LibraryItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

function LibraryListPanel({ isLoading, error, items, activeId, onSelect }: LibraryListPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface-1/70 p-6 text-sm text-muted-foreground">
        Loading artifacts...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-surface-1/70 p-6 text-sm text-muted-foreground">
        No deliverables yet. Run a task to generate artifacts.
      </div>
    );
  }

  return <LibraryList items={items} activeId={activeId} onSelect={onSelect} />;
}

type LibraryListProps = {
  items: LibraryItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

function LibraryList({ items, activeId, onSelect }: LibraryListProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isActive = item.record.artifactId === activeId;
        return (
          <button
            key={item.record.artifactId}
            type="button"
            onClick={() => onSelect(item.record.artifactId)}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
              isActive
                ? "border-foreground/40 bg-surface-2"
                : "border-border/40 bg-surface-1/60 hover:border-foreground/30 hover:bg-surface-2/60"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{item.item.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.record.taskTitle ?? "Untitled task"}
                  {item.record.sessionTitle ? ` · ${item.record.sessionTitle}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-micro uppercase tracking-wider text-muted-foreground">
                  {item.payload.type}
                </span>
                {item.record.status !== "pending" && (
                  <span
                    className={`text-micro uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      item.record.status === "applied"
                        ? "border-success/30 text-success bg-success/10"
                        : "border-warning/30 text-warning bg-warning/10"
                    }`}
                  >
                    {item.record.status}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{item.snippet}</p>
            <p className="mt-2 text-micro text-muted-foreground">
              {new Date(item.record.createdAt).toLocaleString()}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function toArtifactItem(record: CoworkArtifact, payload: ArtifactPayload): ArtifactItem {
  switch (payload.type) {
    case "diff":
      return { id: record.artifactId, type: "diff", title: record.title, content: payload.diff };
    case "plan":
      return {
        id: record.artifactId,
        type: "plan",
        title: record.title,
        content: JSON.stringify(payload.steps, null, 2),
      };
    case "markdown":
      return {
        id: record.artifactId,
        type: "report",
        title: record.title,
        content: payload.content,
      };
    case "preflight":
      return {
        id: record.artifactId,
        type: "report",
        title: record.title,
        content: formatPreflightMarkdown(payload),
      };
    default:
      return { id: record.artifactId, type: "doc", title: record.title, content: "" };
  }
}

function buildSnippet(payload: ArtifactPayload): string {
  switch (payload.type) {
    case "diff":
      return truncate(payload.diff);
    case "plan":
      return truncate(payload.steps.map((step) => step.label).join(" · "));
    case "markdown":
      return truncate(payload.content);
    case "preflight":
      return truncate(payload.report.riskSummary);
    default:
      return "No preview available.";
  }
}

function formatPreflightMarkdown(payload: Extract<ArtifactPayload, { type: "preflight" }>): string {
  const lines = ["# Preflight Report", "", `Summary: ${payload.report.riskSummary}`];
  if (payload.selectionNotes.length > 0) {
    lines.push("", "## Selection Notes");
    for (const note of payload.selectionNotes) {
      lines.push(`- ${note}`);
    }
  }
  if (payload.changedFiles.length > 0) {
    lines.push("", "## Changed Files");
    for (const file of payload.changedFiles) {
      lines.push(`- ${file}`);
    }
  }
  if (payload.report.checks.length > 0) {
    lines.push("", "## Checks");
    for (const check of payload.report.checks) {
      lines.push(`- ${check.name}: ${check.status}`);
    }
  }
  return lines.join("\n");
}

function truncate(input: string, max = 160): string {
  const compact = input.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max).trim()}...`;
}
