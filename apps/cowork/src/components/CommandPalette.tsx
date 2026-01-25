"use client";

import { Dialog, Input, List, ListRow, type ListRowProps } from "@ku0/shell";
import { useRouter } from "@tanstack/react-router";
import { BookText, Command, FileText, Plus, Search, Settings, Sparkles } from "lucide-react";
import * as React from "react";
import { useWorkspace } from "../app/providers/WorkspaceProvider";
import { cn } from "../lib/cn";

interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: ListRowProps["icon"];
  shortcut?: string[];
  keywords?: string[];
  onSelect: () => void;
  group: "Actions" | "Sessions";
}

const ACTION_GROUP_LABEL = "Actions" as const;
const SESSION_GROUP_LABEL = "Sessions" as const;

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

function matchesQuery(item: CommandPaletteItem, query: string) {
  if (!query) {
    return true;
  }
  const haystack = [item.label, item.description ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function shouldOpenPalette(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") {
    return false;
  }
  return true;
}

export function CommandPalette() {
  const router = useRouter();
  const { sessions, getWorkspace } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const actionItems = React.useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "action-new-session",
        label: "New Session",
        description: "Start a new workspace session",
        icon: Plus,
        shortcut: ["\u2318", "N"],
        onSelect: () => router.navigate({ to: "/new-session" }),
        group: ACTION_GROUP_LABEL,
      },
      {
        id: "action-search",
        label: "Search",
        description: "Find sessions, tasks, or artifacts",
        icon: Search,
        shortcut: ["\u2318", "K"],
        onSelect: () => router.navigate({ to: "/search" }),
        group: ACTION_GROUP_LABEL,
      },
      {
        id: "action-library",
        label: "Library",
        description: "Browse generated artifacts",
        icon: BookText,
        onSelect: () => router.navigate({ to: "/library" }),
        group: ACTION_GROUP_LABEL,
      },
      {
        id: "action-settings",
        label: "Settings",
        description: "Configure preferences and integrations",
        icon: Settings,
        onSelect: () => router.navigate({ to: "/settings" }),
        group: ACTION_GROUP_LABEL,
      },
      {
        id: "action-home",
        label: "Workspace Overview",
        description: "Return to the workspace home",
        icon: Sparkles,
        onSelect: () => router.navigate({ to: "/" }),
        group: ACTION_GROUP_LABEL,
      },
    ],
    [router]
  );

  const sessionItems = React.useMemo<CommandPaletteItem[]>(() => {
    const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.map((session) => {
      const workspace = getWorkspace(session.workspaceId ?? "");
      const workspaceLabel = workspace ? workspace.name : "Workspace";
      return {
        id: `session-${session.id}`,
        label: session.title,
        description: workspaceLabel,
        icon: FileText,
        keywords: [workspaceLabel],
        onSelect: () => router.navigate({ to: `/sessions/${session.id}` }),
        group: SESSION_GROUP_LABEL,
      };
    });
  }, [getWorkspace, router, sessions]);

  const filteredItems = React.useMemo(() => {
    const normalized = normalizeText(query);
    const items = [...actionItems, ...sessionItems].filter((item) =>
      matchesQuery(item, normalized)
    );

    if (!normalized) {
      const actionList = items.filter((item) => item.group === ACTION_GROUP_LABEL);
      const sessionList = items.filter((item) => item.group === SESSION_GROUP_LABEL).slice(0, 6);
      return [...actionList, ...sessionList];
    }

    return items;
  }, [actionItems, query, sessionItems]);

  const groupedRows = React.useMemo(() => {
    const rows: Array<
      { type: "heading"; label: string } | { type: "item"; item: CommandPaletteItem }
    > = [];
    const actions = filteredItems.filter((item) => item.group === ACTION_GROUP_LABEL);
    const sessions = filteredItems.filter((item) => item.group === SESSION_GROUP_LABEL);

    if (actions.length > 0) {
      rows.push({ type: "heading", label: ACTION_GROUP_LABEL });
      for (const item of actions) {
        rows.push({ type: "item", item });
      }
    }
    if (sessions.length > 0) {
      rows.push({ type: "heading", label: SESSION_GROUP_LABEL });
      for (const item of sessions) {
        rows.push({ type: "item", item });
      }
    }

    return rows;
  }, [filteredItems]);

  const handleSelect = React.useCallback(
    (value: string) => {
      const selected = filteredItems.find((item) => item.id === value);
      if (!selected) {
        return;
      }
      setOpen(false);
      setQuery("");
      selected.onSelect();
    },
    [filteredItems]
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldOpenPalette(event)) {
        return;
      }
      event.preventDefault();
      setOpen((prev) => !prev);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        listRef.current?.focus();
        return;
      }
      if (event.key === "Enter" && filteredItems.length > 0) {
        event.preventDefault();
        handleSelect(filteredItems[0].id);
      }
    },
    [filteredItems, handleSelect]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search actions and sessions"
      size="md"
      className="rounded-2xl border-border/30 bg-surface-1/95"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface-2/70 px-3 py-2">
          <Command className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search commands or sessions..."
            aria-label="Search commands or sessions"
            className="h-8 border-transparent bg-transparent px-0 text-sm focus-visible:ring-0"
          />
        </div>

        {groupedRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No matching commands.</div>
        ) : (
          <List
            ref={listRef}
            className="max-h-72 overflow-y-auto rounded-xl border border-border/30 bg-background/40 p-1"
            onSelect={handleSelect}
          >
            {groupedRows.map((row) => {
              if (row.type === "heading") {
                return (
                  <ListRow
                    key={`heading-${row.label}`}
                    value={`heading-${row.label}`}
                    label={row.label}
                    disabled
                    className={cn(
                      "uppercase tracking-[0.2em] text-muted-foreground/70 text-[10px]",
                      "cursor-default hover:bg-transparent focus-visible:bg-transparent"
                    )}
                  />
                );
              }

              const item = row.item;
              return (
                <ListRow
                  key={item.id}
                  value={item.id}
                  label={item.label}
                  description={item.description}
                  icon={item.icon}
                  shortcut={item.shortcut}
                  className="text-sm"
                />
              );
            })}
          </List>
        )}
      </div>
    </Dialog>
  );
}
