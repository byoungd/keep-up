# Tool Workbench and Policy Engine

## Overview

The Tool Workbench provides a stateful, per-run tool registry with policy gating and hook execution.
It exposes the following API surface:

- `list_tools` / `listTools`
- `call_tool` / `callTool`
- `save_state` / `saveState`
- `load_state` / `loadState`

A workbench instance owns an isolated registry, optional discovery sources, and a rule-based
policy engine that can allow, deny, or ask for approval before tool execution.

Tool access can be scoped per workbench run with `allowedTools` (or `registryScope`), which is
applied via a registry view.

## Tool Sources and Discovery

The workbench can register tools from multiple sources:

- MCP tool servers (static registration).
- Command-backed tool discovery (local commands returning MCP tool schemas).
- External adapter registries (framework extensions).
- Local registries via adapters (e.g., coordinator-backed tools).

Example: MCP servers + command discovery + external adapters.

```ts
import {
  ToolWorkbench,
  StaticToolSource,
  CommandToolSource,
  ExternalAdapterToolSource,
  createToolRegistry,
} from "@ku0/agent-runtime";

const workbench = new ToolWorkbench({
  sources: [
    new StaticToolSource([mcpServerA, mcpServerB]),
    new CommandToolSource({
      name: "local-tools",
      listCommand: "./scripts/list-tools",
      callCommand: "./scripts/call-tool",
    }),
    new ExternalAdapterToolSource(adapterRegistry),
  ],
});

const tools = await workbench.listTools();
```

Schema validation runs on command-discovered tools. Invalid schemas are skipped.

For discovery queries, use `discoverTools`:

```ts
const results = await workbench.discoverTools({ query: "summarize" });
```

## Policy Configuration (Allow / Deny / Ask)

Workbench policy rules gate tool execution and hook execution. Each rule can:

- Match tool name patterns (`tools` or `toolPatterns`).
- Apply an action: `allow`, `deny`, or `ask`.
- Attach reason codes for audit and UI display.

Example policy:

```ts
const workbench = new ToolWorkbench({
  policy: {
    autoApproveTools: ["file:read"],
    pathAllowlist: ["/Users/han/Documents/Code"],
    rules: [
      {
        id: "deny-shell",
        action: "deny",
        tools: ["bash:*"],
        reasonCode: "deny_shell",
        reason: "Shell access is disabled",
      },
      {
        id: "ask-write",
        action: "ask",
        tools: ["file:write"],
        reasonCode: "ask_write",
      },
    ],
  },
  confirmationHandler: async (request) => {
    return request.toolName === "file:write"; // example
  },
});
```

Notes:

- `autoApproveTools` bypasses confirmation.
- `pathAllowlist` enforces path safeguards for file tools (`file:*`).
- `ask` requires a confirmation handler; otherwise the call is denied.

## Hook Gating

Hook execution is gated by the same policy engine when configured. Hook rules use `target: "hook"`
and match on hook type and tool name patterns.

```ts
const workbench = new ToolWorkbench({
  hooks: [
    {
      name: "preflight",
      type: "PreToolUse",
      toolPatterns: ["file:*"],
      command: "./hooks/preflight",
      timeoutMs: 3000,
      isCancellable: true,
    },
  ],
  policy: {
    rules: [
      {
        id: "deny-pre-hook",
        target: "hook",
        action: "deny",
        hooks: ["PreToolUse"],
        toolPatterns: ["bash:*"],
        reasonCode: "deny_hook",
      },
    ],
  },
});
```

## Checkpoint Persistence

Workbench state can be persisted through the `CheckpointManager`. The workbench stores its
serialized state under the `workbench` metadata key.

```ts
const state = await workbench.saveState();
await workbench.loadState(state);
```

The saved state currently includes:

- Policy decision cache (if enabled).
- Per-tool usage counts.
