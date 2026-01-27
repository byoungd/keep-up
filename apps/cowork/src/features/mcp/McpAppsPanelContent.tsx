"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import {
  type CoworkMcpServerSummary,
  type CoworkMcpTool,
  listMcpServers,
  listMcpTools,
} from "../../api/coworkApi";
import { McpAppRenderer } from "./McpAppRenderer";

function resolveToolLabel(tool: CoworkMcpTool): string {
  return tool.ui?.label ?? tool.description ?? tool.name;
}

function resolveToolResourceUri(tool: CoworkMcpTool): string | undefined {
  if (tool.ui?.resourceUri) {
    return tool.ui.resourceUri;
  }
  const meta = tool.metadata;
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const direct = (meta as Record<string, unknown>)["ui/resourceUri"];
  if (typeof direct === "string") {
    return direct;
  }
  const ui = (meta as Record<string, unknown>).ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    const resourceUri = (ui as Record<string, unknown>).resourceUri;
    if (typeof resourceUri === "string") {
      return resourceUri;
    }
  }
  return undefined;
}

function shouldShowTool(tool: CoworkMcpTool): boolean {
  if (tool.ui?.visibility === "hidden") {
    return false;
  }
  return Boolean(resolveToolResourceUri(tool));
}

function useMcpServers() {
  const [servers, setServers] = React.useState<CoworkMcpServerSummary[]>([]);
  const [activeServer, setActiveServer] = React.useState<string | null>(null);
  const [loadingServers, setLoadingServers] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoadingServers(true);
    setErrorMessage(null);
    listMcpServers()
      .then((data) => {
        if (!active) {
          return;
        }
        setServers(data);
        setActiveServer((current) => current ?? data[0]?.name ?? null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to load MCP servers.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoadingServers(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    servers,
    activeServer,
    setActiveServer,
    loadingServers,
    errorMessage,
  };
}

function useMcpTools(activeServer: string | null) {
  const [tools, setTools] = React.useState<CoworkMcpTool[]>([]);
  const [activeTool, setActiveTool] = React.useState<CoworkMcpTool | null>(null);
  const [loadingTools, setLoadingTools] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeServer) {
      setTools([]);
      setActiveTool(null);
      return;
    }
    let active = true;
    setLoadingTools(true);
    setErrorMessage(null);
    listMcpTools(activeServer)
      .then((data) => {
        if (!active) {
          return;
        }
        const visibleTools = data.filter(shouldShowTool);
        setTools(visibleTools);
        setActiveTool((current) => {
          if (current && visibleTools.some((tool) => tool.name === current.name)) {
            return current;
          }
          return visibleTools[0] ?? null;
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setTools([]);
        setActiveTool(null);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load MCP tools.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLoadingTools(false);
      });

    return () => {
      active = false;
    };
  }, [activeServer]);

  return {
    tools,
    activeTool,
    setActiveTool,
    loadingTools,
    errorMessage,
  };
}

function ServerStatus({ summary }: { summary: CoworkMcpServerSummary | null }) {
  if (!summary) {
    return null;
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        {summary.description} · <span className="capitalize">{summary.status.state}</span>
        {summary.status.authRequired ? " · Auth required" : ""}
      </p>
      {summary.status.lastError ? (
        <p className="text-xs text-destructive">{summary.status.lastError}</p>
      ) : null}
    </>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      {message}
    </div>
  );
}

function ServersState({ loading, count }: { loading: boolean; count: number }) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading MCP servers…</p>;
  }
  if (count === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-surface-2/40 p-4 text-sm text-muted-foreground">
        No MCP servers configured. Add entries to your MCP settings file to enable apps.
      </div>
    );
  }
  return null;
}

function AppsList({
  tools,
  activeTool,
  onSelect,
}: {
  tools: CoworkMcpTool[];
  activeTool: CoworkMcpTool | null;
  onSelect: (tool: CoworkMcpTool) => void;
}) {
  return (
    <div className="grid gap-2">
      {tools.map((tool) => {
        const isActive = activeTool?.name === tool.name;
        return (
          <button
            type="button"
            key={tool.name}
            onClick={() => onSelect(tool)}
            className={cn(
              "w-full text-left rounded-lg border px-3 py-2 transition-colors",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border/40 bg-surface-1/60 text-foreground hover:bg-surface-2/70"
            )}
            aria-pressed={isActive}
          >
            <p className="text-sm font-semibold">{resolveToolLabel(tool)}</p>
            <p className={cn("text-xs", isActive ? "text-background/80" : "text-muted-foreground")}>
              {tool.description ?? tool.name}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function AppsSection({
  activeServer,
  loadingTools,
  tools,
  activeTool,
  onSelect,
}: {
  activeServer: string | null;
  loadingTools: boolean;
  tools: CoworkMcpTool[];
  activeTool: CoworkMcpTool | null;
  onSelect: (tool: CoworkMcpTool) => void;
}) {
  if (!activeServer) {
    return null;
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apps</p>
      </div>
      {loadingTools ? (
        <p className="text-sm text-muted-foreground">Loading apps…</p>
      ) : tools.length === 0 ? (
        <div className="rounded-lg border border-border/30 bg-surface-2/40 p-4 text-sm text-muted-foreground">
          No MCP apps advertised by this server.
        </div>
      ) : (
        <AppsList tools={tools} activeTool={activeTool} onSelect={onSelect} />
      )}
    </div>
  );
}

function ActiveAppPanel({
  activeServer,
  activeTool,
}: {
  activeServer: string | null;
  activeTool: CoworkMcpTool | null;
}) {
  if (!activeServer || !activeTool) {
    return null;
  }
  return <McpAppRenderer serverName={activeServer} tool={activeTool} className="h-full" />;
}

export function McpAppsPanelContent() {
  const {
    servers,
    activeServer,
    setActiveServer,
    loadingServers,
    errorMessage: serverError,
  } = useMcpServers();
  const {
    tools,
    activeTool,
    setActiveTool,
    loadingTools,
    errorMessage: toolsError,
  } = useMcpTools(activeServer);
  const errorMessage = toolsError ?? serverError;
  const activeServerSummary = servers.find((server) => server.name === activeServer) ?? null;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-border/30 bg-surface-0/80 px-4 py-3 space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground">MCP Apps</p>
          <p className="text-xs text-muted-foreground">
            Launch embedded MCP tools directly in Open Wrap.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="mcp-server-select">
            Server
          </label>
          <select
            id="mcp-server-select"
            value={activeServer ?? ""}
            onChange={(event) => {
              setActiveServer(event.target.value || null);
              setActiveTool(null);
            }}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            disabled={loadingServers || servers.length === 0}
            aria-label="Select MCP server"
          >
            {servers.length === 0 ? (
              <option value="">No servers configured</option>
            ) : (
              servers.map((server) => (
                <option key={server.name} value={server.name}>
                  {server.name}
                </option>
              ))
            )}
          </select>
          <ServerStatus summary={activeServerSummary} />
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide p-4 space-y-4"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard access.
        tabIndex={0}
      >
        <ErrorNotice message={errorMessage} />
        <ServersState loading={loadingServers} count={servers.length} />
        <AppsSection
          activeServer={activeServer}
          loadingTools={loadingTools}
          tools={tools}
          activeTool={activeTool}
          onSelect={setActiveTool}
        />

        <div className="min-h-[260px]">
          <ActiveAppPanel activeServer={activeServer} activeTool={activeTool} />
        </div>
      </div>
    </div>
  );
}
