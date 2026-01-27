"use client";

import { cn } from "@ku0/shared/utils";
import {
  AppBridge,
  buildAllowAttribute,
  type McpUiHostCapabilities,
  type McpUiResourceMeta,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as React from "react";
import {
  type CoworkMcpReadResourceResult,
  type CoworkMcpTool,
  callMcpTool,
  listMcpResources,
  listMcpResourceTemplates,
  listMcpTools,
  readMcpResource,
} from "../../api/coworkApi";

type ResourceSource = { kind: "doc"; value: string } | { kind: "url"; value: string };

type McpAppRendererProps = {
  serverName: string;
  tool: CoworkMcpTool;
  className?: string;
};

const SANDBOX_ATTR = "allow-scripts allow-forms";

const HOST_INFO = { name: "Open Wrap", version: "1.0.0" };

const HOST_CAPABILITIES: McpUiHostCapabilities = {
  serverTools: {},
  serverResources: {},
  openLinks: {},
  logging: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logMcpApp(level: "error" | "warn" | "info", message: string, data?: unknown): void {
  if (level === "error") {
    // biome-ignore lint/suspicious/noConsole: MCP app logging is intentional.
    console.error(`[MCP App] ${message}`, data);
    return;
  }
  if (level === "warn") {
    // biome-ignore lint/suspicious/noConsole: MCP app logging is intentional.
    console.warn(`[MCP App] ${message}`, data);
    return;
  }
  // biome-ignore lint/suspicious/noConsole: MCP app logging is intentional.
  console.info(`[MCP App] ${message}`, data);
}

function resolveLogLevel(level: string): "error" | "warn" | "info" {
  if (["error", "critical", "alert", "emergency"].includes(level)) {
    return "error";
  }
  if (["warning", "notice"].includes(level)) {
    return "warn";
  }
  return "info";
}

function resolveUiMeta(meta: unknown): McpUiResourceMeta | undefined {
  if (!meta) {
    return undefined;
  }
  if (isRecord(meta)) {
    if (
      "permissions" in meta ||
      "displayMode" in meta ||
      "hostCss" in meta ||
      "resourceContent" in meta
    ) {
      return meta as McpUiResourceMeta;
    }
    if (isRecord(meta.ui)) {
      return meta.ui as McpUiResourceMeta;
    }
  }
  return undefined;
}

function resolveResourceSource(
  result: CoworkMcpReadResourceResult
): { source: ResourceSource; meta?: McpUiResourceMeta } | null {
  const primary = result.contents.find((content) => "text" in content) ?? result.contents[0];
  if (!primary) {
    return null;
  }

  const meta = resolveUiMeta(primary._meta) ?? resolveUiMeta(result._meta);
  if ("text" in primary && typeof primary.text === "string") {
    return { source: { kind: "doc", value: primary.text }, meta };
  }
  if ("blob" in primary && typeof primary.blob === "string") {
    const mimeType = primary.mimeType ?? "text/html";
    return { source: { kind: "url", value: `data:${mimeType};base64,${primary.blob}` }, meta };
  }

  return null;
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

function buildToolMeta(tool: CoworkMcpTool): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = { ...(tool.metadata ?? {}) };

  if (tool.ui) {
    const uiMeta = isRecord(meta.ui) ? { ...(meta.ui as Record<string, unknown>) } : {};
    uiMeta.resourceUri = tool.ui.resourceUri;
    if (tool.ui.label) {
      uiMeta.label = tool.ui.label;
    }
    if (tool.ui.icon) {
      uiMeta.icon = tool.ui.icon;
    }
    if (tool.ui.visibility) {
      uiMeta.visibility = tool.ui.visibility;
    }
    meta.ui = uiMeta;
    if (meta["ui/resourceUri"] === undefined) {
      meta["ui/resourceUri"] = tool.ui.resourceUri;
    }
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

function toMcpUiTool(tool: CoworkMcpTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    _meta: buildToolMeta(tool),
  };
}

export function McpAppRenderer({ serverName, tool, className }: McpAppRendererProps) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [resourceSource, setResourceSource] = React.useState<ResourceSource | null>(null);
  const [resourceMeta, setResourceMeta] = React.useState<McpUiResourceMeta | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [iframeReady, setIframeReady] = React.useState(false);

  const resourceUri = React.useMemo(() => resolveToolResourceUri(tool), [tool]);

  React.useEffect(() => {
    if (!resourceUri) {
      setResourceSource(null);
      setResourceMeta(null);
      setErrorMessage("No MCP UI resource configured for this tool.");
      return;
    }

    let active = true;
    setIframeReady(false);
    setIsLoading(true);
    setErrorMessage(null);
    readMcpResource(serverName, resourceUri)
      .then((result) => {
        if (!active) {
          return;
        }
        const resolved = resolveResourceSource(result);
        if (!resolved) {
          setResourceSource(null);
          setResourceMeta(null);
          setErrorMessage("MCP resource did not include renderable HTML.");
          return;
        }
        setResourceSource(resolved.source);
        setResourceMeta(resolved.meta ?? null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setResourceSource(null);
        setResourceMeta(null);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load MCP app.");
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [serverName, resourceUri]);

  React.useEffect(() => {
    if (!iframeReady || !iframeRef.current || !resourceSource) {
      return;
    }

    const targetWindow = iframeRef.current.contentWindow;
    if (!targetWindow) {
      return;
    }

    const bridge = new AppBridge(null, HOST_INFO, HOST_CAPABILITIES);
    const transport = new PostMessageTransport(targetWindow, targetWindow);

    bridge.oncalltool = async (params, _extra) => {
      const result = await callMcpTool(serverName, {
        name: params.name,
        arguments: (params.arguments ?? {}) as Record<string, unknown>,
      });
      return result;
    };

    bridge.onlistresources = async (params, _extra) => {
      const result = await listMcpResources(serverName, params?.cursor);
      return result;
    };

    bridge.onlistresourcetemplates = async (params, _extra) => {
      const result = await listMcpResourceTemplates(serverName, params?.cursor);
      return result;
    };

    bridge.onreadresource = async (params, _extra) => {
      const result = await readMcpResource(serverName, params.uri);
      return result;
    };

    bridge.onopenlink = async (params, _extra) => {
      try {
        const url = new URL(params.url);
        if (url.protocol === "http:" || url.protocol === "https:") {
          window.open(url.toString(), "_blank", "noopener,noreferrer");
        }
      } catch {
        // Ignore invalid URLs.
      }
      return {};
    };

    bridge.onloggingmessage = (params) => {
      const rawLevel = params?.level ?? "info";
      const data = params?.data;
      const message = typeof data === "string" ? data : "MCP app log";
      logMcpApp(resolveLogLevel(rawLevel), message, typeof data === "string" ? undefined : data);
    };

    bridge.setRequestHandler(ListToolsRequestSchema, async (_request, _extra) => {
      const toolList = await listMcpTools(serverName);
      return { tools: toolList.map((entry) => toMcpUiTool(entry)) };
    });

    let cancelled = false;
    bridge.connect(transport).catch((error) => {
      if (!cancelled) {
        logMcpApp("error", "Failed to connect MCP app bridge", error);
      }
    });

    return () => {
      cancelled = true;
      transport.close();
      void bridge.close();
    };
  }, [iframeReady, resourceSource, serverName]);

  const allow = resourceMeta?.permissions
    ? buildAllowAttribute(resourceMeta.permissions)
    : undefined;

  if (errorMessage) {
    return (
      <div
        className={cn(
          "h-full rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive",
          className
        )}
      >
        {errorMessage}
      </div>
    );
  }

  if (isLoading || !resourceSource) {
    return (
      <div
        className={cn(
          "h-full rounded-lg border border-border/30 bg-surface-2/40 p-4 text-sm text-muted-foreground",
          className
        )}
      >
        Loading MCP app…
      </div>
    );
  }

  return (
    <div className={cn("h-full rounded-lg border border-border/40 bg-background", className)}>
      <iframe
        key={resourceUri}
        ref={iframeRef}
        title={tool.ui?.label ?? tool.name}
        className="h-full w-full rounded-lg"
        src={resourceSource.kind === "url" ? resourceSource.value : undefined}
        srcDoc={resourceSource.kind === "doc" ? resourceSource.value : undefined}
        sandbox={SANDBOX_ATTR}
        allow={allow}
        onLoad={() => setIframeReady(true)}
      />
    </div>
  );
}
