# MCP Remote Server Configuration

This document describes how to configure MCP remote servers in the agent runtime, including OAuth
configuration entry points and the token storage/key management policy.

## Configuration Entry Points

MCP remote servers are configured via `McpRemoteServerConfig` when wiring the tool registry.
The `auth` block accepts either a prebuilt OAuth provider or a client config that can be
combined with a token store configuration.

```ts
import {
  createMcpRemoteToolServer,
  type McpRemoteServerConfig,
} from "@ku0/agent-runtime-tools";

const serverConfig: McpRemoteServerConfig = {
  name: "acme",
  description: "Acme MCP server",
  transport: {
    type: "streamableHttp",
    url: "https://mcp.acme.dev",
  },
  auth: {
    client: {
      clientId: process.env.MCP_CLIENT_ID ?? "",
      clientSecret: process.env.MCP_CLIENT_SECRET,
      grantType: "authorization_code",
      redirectUrl: "https://keep-up.local/oauth/callback",
      scopes: ["tools.read", "tools.write"],
    },
    tokenStore: {
      type: "file",
      filePath: "/var/lib/keep-up/mcp/acme.tokens",
      encryptionKey: process.env.MCP_OAUTH_ENCRYPTION_KEY ?? "",
      keyEncoding: "base64",
    },
    scopes: ["tools.read", "tools.write"],
  },
};

const server = createMcpRemoteToolServer(serverConfig);
```

Token stores can be configured as:

- `type: "memory"` for non-persistent development use.
- `type: "file"` with AES-256-GCM encryption using `FileMcpOAuthTokenStore`.

### Multi-Account Token Scoping

When connecting to providers that support multiple accounts (e.g., Codex), scope tokens per account
or workspace to avoid collisions. The token store accepts these optional selectors:

- `tokenKey`: Explicit namespace key (highest precedence).
- `accountId`: Account identifier.
- `workspaceId`: Workspace identifier.

If `tokenKey` is omitted, the store builds a key from `accountId`/`workspaceId`.

Example:
```ts
auth: {
  tokenStore: {
    type: "file",
    filePath: "/var/lib/keep-up/mcp/acme.tokens",
    encryptionKey: process.env.MCP_OAUTH_ENCRYPTION_KEY ?? "",
    accountId: "acct-123",
    workspaceId: "ws-456",
  },
}
```

For Cowork's gateway-backed store, use `type: "gateway"` with the same selectors.

If you already have an OAuth provider instance, pass it directly:

```ts
import {
  McpOAuthClientProvider,
  createMcpRemoteToolServer,
  type McpRemoteServerConfig,
} from "@ku0/agent-runtime-tools";

const provider = new McpOAuthClientProvider({
  clientId: process.env.MCP_CLIENT_ID ?? "",
  clientSecret: process.env.MCP_CLIENT_SECRET,
  scopes: ["tools.read"],
});

const serverConfig: McpRemoteServerConfig = {
  name: "acme",
  description: "Acme MCP server",
  transport: { type: "sse", url: "https://mcp.acme.dev/events" },
  auth: {
    provider,
    scopes: ["tools.read"],
  },
};
```

## Token Storage and Key Management Policy

Use these defaults for secure MCP OAuth token storage:

- Generate a 32-byte encryption key and store it in a secrets manager.
- Do not commit or log the key; pass it via environment variables or a secret mount.
- Use a user- or server-scoped file path with `0600` permissions.
- Avoid sharing token files across environments; use distinct keys per environment.
- Audit logs must not include raw tokens (only status and error metadata).

### Key Rotation

1. Provision a new 32-byte key in the secrets manager.
2. Re-encrypt stored tokens with the new key or clear the token store to force re-auth.
3. Revoke the old key and invalidate any tokens issued under the old key.

## Operational Notes

- `auth.scopes` controls default scopes applied to tools without explicit scope metadata.
- `auth.client.scopes` controls the OAuth request scope if no explicit scope is passed at runtime.
- Prefer storing tokens per server, not globally, to simplify rotation and revocation.
