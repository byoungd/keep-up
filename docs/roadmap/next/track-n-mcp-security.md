# Track N: MCP 2.0 & Security Enhancement

**Owner**: Runtime Developer  
**Status**: Proposed  
**Priority**: 🔴 Critical  
**Timeline**: Week 1-3  
**Dependencies**: Track H, Track L  
**Reference Implementation**: Cline `McpHub.ts` (1564 lines)

---

## Objective

Fully adopt MCP 2.0 SDK with production-grade security including OAuth 2.0 authorization and prompt injection defense.

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

### N1: MCP SDK Full Adoption (Week 1)

**Goal**: Replace custom MCP registry with official `@modelcontextprotocol/sdk`.

**Implementation**:

```typescript
// packages/agent-runtime-tools/src/mcp/sdkAdapter.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export interface McpServerConfig {
  type: "stdio" | "sse" | "streamableHttp";
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
  autoApprove?: string[];
}

export class McpSdkAdapter {
  private clients = new Map<string, Client>();
  private transports = new Map<string, Transport>();

  async connect(config: McpServerConfig): Promise<void> {
    const transport = this.createTransport(config);
    const client = new Client({ name: "keep-up", version: "1.0.0" }, { capabilities: {} });
    
    await client.connect(transport);
    
    this.clients.set(config.name, client);
    this.transports.set(config.name, transport);
  }

  private createTransport(config: McpServerConfig): Transport {
    switch (config.type) {
      case "stdio":
        return new StdioClientTransport({
          command: config.command!,
          args: config.args,
          stderr: "pipe",
        });
      case "sse":
        return new SSEClientTransport(new URL(config.url!));
      case "streamableHttp":
        return new StreamableHTTPClientTransport(new URL(config.url!));
    }
  }

  async listTools(serverName: string): Promise<McpTool[]> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server ${serverName} not connected`);
    
    const response = await client.request(
      { method: "tools/list" },
      ListToolsResultSchema
    );
    return response?.tools || [];
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server ${serverName} not connected`);
    
    const response = await client.request(
      { method: "tools/call", params: { name: toolName, arguments: args } },
      CallToolResultSchema
    );
    return response?.content;
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-tools/src/mcp/sdkAdapter.ts`
- [ ] `packages/agent-runtime-tools/src/mcp/schemaValidator.ts`
- [ ] Migration guide for existing MCP tools
- [ ] Unit tests for all transport types

---

### N2: OAuth 2.0 Integration (Week 2)

**Goal**: Secure tool access with OAuth 2.0 scopes per Cline's `McpOAuthManager.ts`.

**Implementation**:

```typescript
// packages/agent-runtime-core/src/auth/oauth.ts

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
}

export interface OAuthProvider {
  tokens(): Promise<OAuthTokens | undefined>;
  redirectUrl(): URL;
  saveTokens(tokens: OAuthTokens): Promise<void>;
  clearTokens(): Promise<void>;
}

export class McpOAuthManager {
  private providers = new Map<string, OAuthProvider>();
  private tokenStore: TokenStore;

  constructor(tokenStore: TokenStore) {
    this.tokenStore = tokenStore;
  }

  async getOrCreateProvider(serverName: string, url: string): Promise<OAuthProvider> {
    const key = this.getServerAuthHash(serverName, url);
    
    if (!this.providers.has(key)) {
      const provider = await this.createProvider(serverName, url);
      this.providers.set(key, provider);
    }
    
    return this.providers.get(key)!;
  }

  private getServerAuthHash(serverName: string, url: string): string {
    return `${serverName}:${new URL(url).origin}`;
  }
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    // Securely store tokens with encryption
    await this.tokenStore.setSecure(this.getServerAuthHash(), tokens);
  }

  // Generate random state for CSRF protection
  generateState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // PKCE Code Verifier generation
  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString("base64url");
  }
}
```

**Deliverables**:
- [ ] `packages/agent-runtime-core/src/auth/oauth.ts` (with PKCE/CSRF)
- [ ] `packages/agent-runtime-core/src/auth/tokenStore.ts` (Keychain/Encrypted)
- [ ] `packages/agent-runtime-tools/src/mcp/authMiddleware.ts`
- [ ] Token persistence layer
- [ ] Scope-to-tool binding in policy engine

---

### N3: Prompt Injection Defense (Week 3)

**Goal**: Add defense layer against prompt injection attacks.

**Implementation**:

```typescript
// packages/agent-runtime-core/src/security/injectionGuard.ts

export interface InjectionGuardConfig {
  enabled: boolean;
  blockPatterns: RegExp[];
  sanitizePatterns: Array<{ pattern: RegExp; replacement: string }>;
  maxInputLength: number;
  allowedSchemas: Set<string>;
}

export class InjectionGuard {
  constructor(private config: InjectionGuardConfig) {}

  validateInput(input: unknown, schema?: JSONSchema): ValidationResult {
    if (typeof input === "string") {
      return this.validateString(input);
    }
    if (typeof input === "object" && schema) {
      return this.validateObject(input, schema);
    }
    return { valid: true };
  }

  private validateString(input: string): ValidationResult {
    // Check maximum length
    if (input.length > this.config.maxInputLength) {
      return { valid: false, reason: "Input exceeds maximum length" };
    }

    // Check block patterns
    for (const pattern of this.config.blockPatterns) {
      if (pattern.test(input)) {
        return { valid: false, reason: "Input contains blocked pattern" };
      }
    }

    return { valid: true };
  }

  sanitize(input: string): string {
    let result = input;
    for (const { pattern, replacement } of this.config.sanitizePatterns) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
}

// Default block patterns
export const DEFAULT_BLOCK_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|system\|>/i,
];
```

**Deliverables**:
- [ ] `packages/agent-runtime-core/src/security/injectionGuard.ts`
- [ ] `packages/agent-runtime-execution/src/sanitizer.ts`
- [ ] Configurable block/sanitize patterns
- [ ] Policy hooks for blocking/redaction

---

## Acceptance Criteria

- [ ] MCP tools registered and executed via official SDK
- [ ] All three transport types (stdio/SSE/HTTP) working
- [ ] OAuth 2.0 tokens managed with refresh flow
- [ ] Scope enforcement at tool execution time
- [ ] Injection guard blocks known attack patterns
- [ ] Audit logging for all security decisions
- [ ] Zero regression on existing MCP functionality

---

## Testing Requirements

```bash
# Unit tests
pnpm --filter @ku0/agent-runtime-tools test -- --grep "mcp"

# Integration tests
pnpm test:integration -- --grep "oauth"

# Security tests
pnpm --filter @ku0/agent-runtime-core test -- --grep "injection"
```

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK breaking changes | High | Pin SDK version, abstraction layer |
| OAuth token leakage | Critical | Secure token storage, no logging |
| False positive blocks | Medium | Configurable patterns, override |
