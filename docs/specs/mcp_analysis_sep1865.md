# MCP Apps (SEP-1865) Technical Analysis

## 1. Executive Summary
Anthropic (with OpenAI and the MCP-UI Working Group) released the **MCP Apps Extension (SEP-1865)** on January 26, 2026. This enables MCP servers to serve interactive, app-like UIs directly within host applications (e.g., Claude, IDEs).

Launch partners: **Slack, Figma, Asana, Amplitude, Box**.

---

## 2. Protocol Specification

### 2.1 Transport & Messaging
| Aspect | Detail |
|--------|--------|
| **Base Protocol** | JSON-RPC 2.0 (same as core MCP) |
| **Transport** | `window.postMessage` between sandboxed iframe and host |
| **SDK** | `@modelcontextprotocol/ext-apps` (npm) |
| **Core SDK** | `@modelcontextprotocol/sdk` (reusable) |

### 2.2 URI Scheme
- **`ui://`**: A new URI scheme for referencing UI templates.
- Templates are declared in tool metadata under `ui/resourceUri`.
- Hosts can **prefetch and review** templates for performance and security.

### 2.3 Message Types
| Message | Direction | Description |
|---------|-----------|-------------|
| `ui/initialize` | App → Host | Handshake, request capabilities |
| `ui/ready` | Host → App | Confirm init, pass context |
| `tools/call` | App → Host | Request tool execution |
| `tools/result` | Host → App | Return tool result |
| Custom events | Bidirectional | App-specific actions |

### 2.4 Tool Metadata Extension
```jsonc
{
  "name": "dashboard-viewer",
  "description": "Interactive dashboard",
  "inputSchema": { ... },
  "ui": {
    "resourceUri": "ui://my-server/dashboard",
    "label": "Open Dashboard",
    "icon": "chart"
  }
}
```

---

## 3. Security Architecture

### 3.1 Sandbox Attributes (iframe)
Recommended: `sandbox="allow-scripts allow-forms"`
**NEVER use:** `allow-same-origin` + `allow-scripts` together if content is from same origin.

| Flag | Purpose | Risk if Enabled Improperly |
|------|---------|----------------------------|
| `allow-scripts` | JS execution | XSS if content untrusted |
| `allow-forms` | Form submission | Phishing vector |
| `allow-same-origin` | Access parent storage | Can remove sandbox |
| `allow-popups` | Open new windows | Redirect attacks |

### 3.2 Content Security Policy (CSP)
Host should set:
```
Content-Security-Policy: frame-src 'self' ui://*;
```

### 3.3 MCP-Specific Risks
- **Token Theft**: MCP servers store OAuth tokens; compromise = full access.
- **Prompt Injection**: Hidden instructions in messages can trigger MCP actions.
- **Excessive Permissions**: MCP servers often request broad scopes.

**Mitigations:** Provenance checks, traffic mediation, rate limiting, monitoring.

---

## 4. Gap Analysis for `keep-up`

### 4.1 Agent Runtime (`packages/agent-runtime`)
| Current | Required |
|---------|----------|
| Standard tool handling | Parse `ui/*` metadata |
| — | Elicitation flow support |
| — | Forward UI hints to frontend |

### 4.2 Frontend (`apps/cowork`)
| Current | Required |
|---------|----------|
| Text-based chat | `MCPAppRenderer` component |
| Basic artifact preview | Sandboxed `<iframe>` with CSP |
| — | `postMessage` bridge to orchestrator |
| — | `ui://` protocol fetch/proxy |

### 4.3 Protocol Layer (`packages/mcp`)
- Update `Tool` interface with `ui` property.
- Add `MCPAppResource` and `MCPAppMessage` types.

---

## 5. Proposed Architecture

```mermaid
flowchart LR
    subgraph MCP Server
        A[Tool Definition<br/>ui/resourceUri]
    end
    subgraph Host (keep-up)
        B[CoworkTaskRuntime]
        C[MCPAppRenderer]
        D[Sandboxed iframe]
    end
    
    A -->|tool metadata| B
    B -->|ui hint| C
    C -->|load| D
    D <-->|postMessage| C
    C -->|tools/call| B
```

1. **MCP Server** declares `ui/resourceUri` in tool metadata.
2. **Runtime** parses and forwards UI hints to frontend.
3. **MCPAppRenderer** loads template in sandboxed iframe.
4. **postMessage bridge** handles bidirectional communication.

---

## 6. Open Questions for Implementation
1. How to handle `ui://` fetching (direct HTTPS? proxy through MCP client?)?
2. Should we Support offline/caching of UI templates?
3. What CSP rules should be configurable per-workspace or per-server?

---

## 7. References
- [modelcontextprotocol.io](https://modelcontextprotocol.io)
- [github.com/modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
- [npm: @modelcontextprotocol/ext-apps](https://npmjs.com/package/@modelcontextprotocol/ext-apps)
