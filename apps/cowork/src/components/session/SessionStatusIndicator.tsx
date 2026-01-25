"use client";

import { FileText, Globe, Terminal } from "lucide-react";
import { useMemo } from "react";
import { useTaskStream } from "../../features/tasks/hooks/useTaskStream";
import type { TaskGraph } from "../../features/tasks/types";
import { cn } from "../../lib/cn";
import { StatusDot } from "../ui/StatusDot";

const STATUS_TONE: Record<string, "success" | "warning" | "info" | "muted"> = {
  active: "success",
  paused: "warning",
  created: "info",
  closed: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  created: "Created",
  closed: "Closed",
};

const KIND_ICON = {
  terminal: Terminal,
  browser: Globe,
  file: FileText,
};

const KIND_LABEL: Record<string, string> = {
  terminal: "Terminal",
  browser: "Browser",
  file: "Files",
};

function getLatestSequence(graph: TaskGraph, workspaceSessionId: string): number | null {
  const events = graph.workspaceEvents?.[workspaceSessionId] ?? [];
  if (events.length === 0) {
    return null;
  }
  return events[events.length - 1]?.sequence ?? null;
}

export function SessionStatusIndicator({
  sessionId,
  className,
}: {
  sessionId: string;
  className?: string;
}) {
  const { graph } = useTaskStream(sessionId);

  const sessions = useMemo(() => {
    const values = Object.values(graph.workspaceSessions ?? {});
    return values.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [graph.workspaceSessions]);

  if (sessions.length === 0) {
    return null;
  }

  const visible = sessions.slice(0, 3);
  const overflow = sessions.length - visible.length;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {visible.map((session) => {
        const Icon = KIND_ICON[session.kind as keyof typeof KIND_ICON] ?? Terminal;
        const kindLabel = KIND_LABEL[session.kind] ?? "Session";
        const statusLabel = STATUS_LABEL[session.status] ?? session.status;
        const tone = STATUS_TONE[session.status] ?? "info";
        const sequence = getLatestSequence(graph, session.workspaceSessionId);
        const titleParts = [
          `${kindLabel} session`,
          statusLabel,
          sequence !== null ? `event #${sequence}` : "no events",
        ];

        return (
          <div
            key={session.workspaceSessionId}
            className="flex items-center gap-1.5 rounded-md border border-border/40 bg-surface-1/70 px-2 py-1 text-[11px] text-foreground/90"
            title={titleParts.join(" · ")}
          >
            <StatusDot tone={tone} size="sm" aria-label={statusLabel} />
            <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{kindLabel}</span>
            {sequence !== null ? (
              <span className="text-micro text-muted-foreground">#{sequence}</span>
            ) : null}
          </div>
        );
      })}
      {overflow > 0 ? (
        <span className="text-micro text-muted-foreground px-1.5">+{overflow}</span>
      ) : null}
    </div>
  );
}
