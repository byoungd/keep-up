# Cowork MCP Apps Architecture Plan (SEP-1865)

Scope: Open Wrap `apps/cowork` + agent-runtime MCP integration.
Source spec: `docs/specs/mcp_analysis_sep1865.md`.

## Goals
- Render MCP Apps inside Cowork using the SEP-1865 UI extension.
- Keep MCP tool execution routed through the existing runtime policy layer.
- Preserve sandbox isolation for UI resources.

## Architecture
### Server
- `McpServerManager` loads MCP server configs from the Cowork state dir and exposes a typed API.
- `McpRemoteToolServer` bridges MCP SDK client/transport and keeps raw tool metadata (including UI hints).
- Hono routes expose MCP Apps endpoints:
  - `GET /api/mcp/servers`
  - `GET /api/mcp/servers/:server/tools`
  - `POST /api/mcp/servers/:server/tools/call`
  - `GET /api/mcp/servers/:server/resources`
  - `GET /api/mcp/servers/:server/resource-templates`
  - `GET /api/mcp/servers/:server/resource?uri=...`

### Client
- `McpAppsPanelContent` lists servers/tools and chooses an active app.
- `McpAppRenderer` loads `ui://` resources through `readResource`, renders in a sandboxed iframe, and wires `AppBridge` + `PostMessageTransport`.
- Tool/resource requests are forwarded back to the server via `coworkApi`.

### Data Flow
1) MCP server advertises `ui.resourceUri` in tool metadata.  
2) Cowork server retrieves tools and exposes them via `/api/mcp/servers/:server/tools`.  
3) UI selects a tool, fetches its `ui://` resource via `/api/mcp/servers/:server/resource`.  
4) `AppBridge` bridges tools/resources/logging with MCP Apps inside the iframe.  

## Configuration
Config file: `${COWORK_STATE_DIR}/mcp-settings.json`  
Override: `COWORK_MCP_SETTINGS_PATH`

Example:
```json
{
  "servers": [
    {
      "name": "acme-mcp",
      "description": "Acme MCP Server",
      "transport": {
        "type": "streamableHttp",
        "url": "https://mcp.example.com"
      },
      "toolScopes": {
        "defaultScopes": ["read:apps"],
        "toolScopes": {
          "dashboard-viewer": ["read:dashboard"]
        }
      }
    }
  ]
}
```

Supported transports:
- `stdio` (command + args)
- `sse` (url)
- `streamableHttp` (url)

## Security
- Sandbox iframe: `allow-scripts allow-forms`.
- Never enable `allow-same-origin` alongside `allow-scripts`.
- Only allow `http/https` open-link requests from apps.

## Follow-ups
- Optional CSP `frame-src` policy for MCP app rendering.
- Host context plumbing (theme, locale, safe area, etc.).
- Resource caching and offline-friendly templates.
