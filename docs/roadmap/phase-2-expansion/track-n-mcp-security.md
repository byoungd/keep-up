# Track N: MCP 2.0 & Security Enhancement

**Owner**: Runtime Developer  
**Status**: Active  
**Priority**: 🔴 Critical  
**Timeline**: Week 1-3  
**Dependencies**: Track H, Track L  
**Reference Implementation**: Cline `McpHub.ts` (1564 lines)

---

## Objective

Upgrade the MCP integration to MCP 2.0 with full transport parity (stdio/SSE/streamable HTTP),
persistent OAuth 2.0 authorization, and hardened prompt injection defenses. Build on the existing
SDK adapter, remote server, and security guardrails already present in the runtime.

---

## Current Baseline (Already Implemented)

- `packages/agent-runtime-tools/src/tools/mcp/sdkAdapter.ts` maps MCP SDK tool/result types.
- `packages/agent-runtime-tools/src/tools/mcp/remoteServer.ts` connects to MCP servers via streamable HTTP.
- `packages/agent-runtime-tools/src/tools/mcp/oauth.ts` provides OAuth client provider + in-memory token store.
- `packages/agent-runtime/src/security/promptInjection.ts` and `packages/agent-runtime/src/executor/index.ts`
  enforce prompt-injection checks.

## Progress Snapshot (2026-01-21)
- Transport parity implemented in `packages/agent-runtime-tools/src/tools/mcp/transport.ts` with tests.
- OAuth token persistence via `FileMcpOAuthTokenStore` and `McpOAuthSession` in `oauth.ts`.
- Scope mapping and policy enforcement in `remoteServer.ts` + `registry.ts`.
- Prompt-injection guardrails already wired in runtime security.

## Remaining Work
- Emit MCP connection/auth status as audit events.
- Define a secure token storage policy (key management, rotation).
- Document connector-specific injection policy overrides.

---

## Gaps to Close

- Server connection status, health, and auth state are not surfaced as audit events.
- OAuth token storage policy (key management/rotation) needs definition.
- Scope enforcement still needs policy/audit visibility at runtime level.
- Prompt injection guardrails need connector-specific policy tuning and audit coverage.

---

## Source Analysis

### From Cline McpHub.ts

```typescript
// Key patterns extracted from Cline implementation

// 1. Transport Abstraction (lines 347-497)
switch (expandedConfig.type) {
  case "stdio":
    transport = new StdioClientTransport({
      command: expandedConfig.command,
      args: expandedConfig.args,
      env: { ...getDefaultEnvironment(), ...(expandedConfig.env || {}) },
      stderr: "pipe",
    });
    break;
  case "sse":
    transport = new SSEClientTransport(new URL(expandedConfig.url), {
      authProvider,
      eventSourceInit: reconnectingEventSourceOptions,
    });
    break;
  case "streamableHttp":
    transport = new StreamableHTTPClientTransport(new URL(expandedConfig.url), {
      authProvider,
      fetch: streamableHttpFetch,
    });
    break;
}

// 2. OAuth Provider Integration (lines 341-345)
const authProvider = expandedConfig.type === "sse" || expandedConfig.type === "streamableHttp"
  ? await this.mcpOAuthManager.getOrCreateProvider(name, expandedConfig.url)
  : undefined;

// 3. Connection Lifecycle (lines 499-512)
const connection: McpConnection = {
  server: {
    name,
    config: configForStorage,
    status: "connecting",
    disabled: config.disabled,
    uid: this.getMcpServerKey(name),
    oauthRequired: false,
    oauthAuthStatus: "authenticated",
  },
  client,
  transport,
  authProvider,
};
```

---

## Tasks

### N1: Transport Parity + MCP 2.0 Upgrade (Week 1)

**Goal**: Support stdio, SSE, and streamable HTTP transports through the official MCP SDK and align
config with MCP 2.0 expectations.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/tools/mcp/remoteServer.ts

export type McpTransportConfig =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "sse"; url: string; eventSourceInit?: EventSourceInit }
  | { type: "streamableHttp"; url: string; requestInit?: RequestInit };

export interface McpRemoteServerConfig {
  name: string;
  description: string;
  transport: McpTransportConfig;
  auth?: {
    provider: OAuthClientProvider;
    scopes?: string[];
    authorizationCode?: string;
  };
  toolScopes?: ToolScopeConfig;
}
```

**Deliverables**:
- [ ] Add stdio + SSE support to `packages/agent-runtime-tools/src/tools/mcp/remoteServer.ts`
- [ ] Transport factory with shared retry/health wiring (`packages/agent-runtime-tools/src/tools/mcp/transport.ts`)
- [ ] Capability + schema validation for tool metadata (`packages/agent-runtime-tools/src/tools/mcp/sdkAdapter.ts`)
- [ ] Unit tests for all transport types in `packages/agent-runtime-tools/src/__tests__/`

---

### N2: OAuth 2.0 Persistence + Scope Policy (Week 2)

**Goal**: Persist OAuth tokens securely and surface scope enforcement in the runtime policy/audit layer.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/tools/mcp/oauth.ts

export interface McpOAuthTokenStore {
  getTokens(): Promise<OAuthTokens | undefined>;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export class SecureTokenStore implements McpOAuthTokenStore {
  async getTokens(): Promise<OAuthTokens | undefined> {
    return loadTokensFromSecureStore();
  }
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeTokensToSecureStore(tokens);
  }
  async clear(): Promise<void> {
    await deleteTokensFromSecureStore();
  }
}
```

**Deliverables**:
- [ ] Persistent token store implementation (keychain or encrypted DB)
- [ ] OAuth refresh + re-auth flows wired to `McpOAuthSession`
- [ ] Scope enforcement surfaced to `packages/agent-runtime/src/security/index.ts`
- [ ] Audit events for auth decisions + scope mismatches

---

### N3: Prompt Injection Defense + Audit (Week 3)

**Goal**: Harden injection defenses with connector-specific policy and auditable block/redaction decisions.

**Implementation**:

```typescript
// packages/agent-runtime/src/security/promptInjection.ts

export interface PromptInjectionPolicy {
  enabled: boolean;
  blockOnRisk: "low" | "medium" | "high";
  maxContentChars: number;
  maxDepth: number;
  connectorOverrides?: Record<string, Partial<PromptInjectionPolicy>>;
}
```

**Deliverables**:
- [ ] Connector-specific policies and redaction rules
- [ ] Audit logs for blocked or redacted tool calls
- [ ] Integration tests covering high-risk tool outputs

---

## Acceptance Criteria

- [ ] All three transports (stdio/SSE/streamable HTTP) work with the MCP SDK client.
- [ ] MCP 2.0 capability negotiation and tool schema validation are enforced.
- [ ] OAuth tokens persist securely and refresh without manual re-auth.
- [ ] Tool scopes are enforced with audit visibility.
- [ ] Prompt injection guardrails block or redact high-risk content with logged reasons.
- [ ] No regression in existing MCP tools or prompt injection tests.

---

## Testing Requirements

```bash
# MCP SDK + transport tests
pnpm --filter @ku0/agent-runtime-tools test -- --grep "mcp"

# OAuth flow tests
pnpm --filter @ku0/agent-runtime-tools test -- --grep "oauth"

# Prompt injection/security tests
pnpm --filter @ku0/agent-runtime test -- --grep "promptInjection"
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK breaking changes | High | Pin SDK version, adapter isolation |
| OAuth token leakage | Critical | Secure storage + no logging |
| Transport regressions | Medium | Per-transport tests and retry policies |
| False positives in injection guard | Medium | Policy overrides + audit review |
