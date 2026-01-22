# @ku0/agent-runtime

Agent Runtime with MCP tools, orchestration, and security for building AI agents.

> **Architecture Note**: Please read [ARCHITECTURE.md](./ARCHITECTURE.md) for mandatory integration standards.

## Overview

This package provides the core infrastructure for building AI agents with:

- **Multi-Agent Orchestration** - Powered by `@openai/agents` (Standard)
- **Persistent Memory** - Powered by `mem0ai` (Standard)
- **Monitoring** - Proactive file watching via `chokidar` (Ghost Agent)
- **Agentic Capabilities** - Browser control, Git Worktree isolation, E2E Pipelines
- **MCP Tool Registry** - Plugin-based tool management
- **Security Model** - Policies, permissions, and audit logging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Agent Runtime Architecture                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐      ┌─────────────────────────┐  │
│  │ OpenAI Agents SDK    │◄────►│      Mem0 Memory        │  │
│  │ (Orchestration)      │      │     (Long-term)         │  │
│  └──────────────────────┘      └─────────────────────────┘  │
│             │                               ▲               │
│             ▼                               │               │
│  ┌──────────────────────┐      ┌─────────────────────────┐  │
│  │   MCP Tool Registry  │      │      Ghost Agent        │  │
│  │ (Plugin Architecture)│◄────►│  (Chokidar Monitor)     │  │
│  └──────────────────────┘      └─────────────────────────┘  │
│             │          │            │                       │
│             ▼          ▼            ▼                       │
│      [ Tool Servers ]  [ Skills ]   [ Capabilities ]        │
│    Bash • File • Code  Procedural   Browser • Worktree      │
│    Interaction Tool                 Pipelines               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @ku0/agent-runtime
```

## Quick Start

```typescript
import {
  createOpenAIAgentsOrchestrator,
  createMem0MemoryAdapter,
  createToolRegistry,
  createBashToolServer,
  createCompletionToolServer,
  createFileToolServer,
  createRuntimeLogger
} from '@ku0/agent-runtime';

// 1. Setup logging
const logger = createRuntimeLogger({ module: "MyAgent" });

// 2. Setup Memory (Mem0)
const memory = createMem0MemoryAdapter({
  apiKey: process.env.MEM0_API_KEY
});

// 3. Create tool registry
const registry = createToolRegistry();
await registry.register(createBashToolServer());
await registry.register(createCompletionToolServer());
await registry.register(createFileToolServer());

// 4. Create Orchestrator (OpenAI Agents SDK)
const agent = createOpenAIAgentsOrchestrator({
  model: 'gpt-4o',
});

// 5. Run the agent
// The orchestrator handles the loop, planning, and tool execution
const result = await agent.run({
  prompt: 'Help me organize my notes relating to the Q1 roadmap',
  context: { memory, registry }
});

logger.info("Agent complete", { result });
```

## Security Presets

| Preset | Bash | File | Code | Network | LFCC |
|--------|------|------|------|---------|------|
| `safe` | disabled | read | disabled | none | read |
| `balanced` | sandbox | workspace | sandbox | allowlist | write |
| `power` | confirm | home | full | full | write |
| `developer` | full | full | full | full | admin |

## Tool Servers

### Bash Tool Server

Execute shell commands with security controls:

```typescript
const bash = createBashToolServer();
// Tools: execute
```

### File Tool Server

File system operations with path validation:

```typescript
const file = createFileToolServer();
// Tools: read, write, list, info, delete
```

### Code Interaction Tool Server

Advanced code navigation, editing, and intelligence (IDE capabilities):

```typescript
const codeInteraction = createCodeInteractionServer();
// Tools: read_file, list_files, edit_file, apply_patch, 
//        view_outline, search_code, scroll_file,
//        go_to_definition, find_references, get_diagnostics
```

### Code Execution Tool Server

Multi-language code execution:

```typescript
const codeExecution = createCodeToolServer();
// Tools: run, languages
// Supports: python, javascript, typescript, ruby, go, rust, bash
```

### MCP Remote Tool Server

Connect to external MCP servers with OAuth and token persistence:

```typescript
import { createMcpRemoteToolServer } from "@ku0/agent-runtime-tools";

const mcpServer = createMcpRemoteToolServer({
  name: "acme",
  description: "Acme MCP server",
  transport: { type: "streamableHttp", url: "https://mcp.acme.dev" },
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
  },
});
```

## Agent Skills

Agent Skills provide progressive, on-demand procedural guidance using `SKILL.md` folders.

```typescript
import {
  createAuditLogger,
  createPermissionChecker,
  createSkillPolicyGuard,
  createSkillRegistry,
  createSkillToolServer,
  createToolPolicyEngine,
  createToolExecutor,
  createToolRegistry,
  createOrchestrator,
  securityPolicy,
} from '@ku0/agent-runtime';

const registry = createToolRegistry();
const security = securityPolicy().fromPreset('balanced').build();
const permissionChecker = createPermissionChecker(security);
const audit = createAuditLogger();

const skillRegistry = createSkillRegistry({
  roots: [
    { path: '/path/to/builtin-skills', source: 'builtin' },
    { path: '/path/to/user-skills', source: 'user' },
  ],
  cachePath: '/path/to/.keep-up/skills/cache.json',
  // Optional: override spec defaults (non-standard).
  // validation: { compatibilityMaxLength: 500 },
});
await skillRegistry.discover();

const policyEngine = createSkillPolicyGuard(
  createToolPolicyEngine(permissionChecker),
  skillRegistry
);
const toolExecutor = createToolExecutor({
  registry,
  policy: permissionChecker,
  policyEngine,
  audit,
});

await registry.register(
  createSkillToolServer({ registry: skillRegistry, executor: toolExecutor })
);

const agent = createOrchestrator(llm, registry, {
  security,
  skills: { registry: skillRegistry },
  components: { toolExecutor },
});
```

### Subagent Tool Server

Spawn focused subagents for parallel or staged workflows:

```typescript
const manager = createAgentManager({ llm, registry });
const subagent = createSubagentToolServer(manager);
// Tools: spawn, spawn_parallel, workflow, types
```

```

### Browser Tool Server

Headless browser control for web research and frontend validation (supports Playwright):

```typescript
const browser = createBrowserToolServer();
// Tools: navigate, click, type, screenshot, evaluate
```

### Git Worktree Tool Server

Safe, isolated execution in temporary git worktrees:

```typescript
const worktree = createGitWorktreeToolServer();
// Tools: create_worktree, cleanup_worktree, shadow_exec
```

### E2E Pipelines

Long-running background task orchestration:

```typescript
const pipeline = createPipelineManager();
// APIs: createWorkflow, triggerRoute
```

### LFCC Tool Server

Document operations through LFCC:

```typescript
const lfcc = createLFCCToolServer(bridge);
// Tools: list_documents, get_document, read_content, get_blocks,
//        insert_block, update_block, delete_block, search,
//        ai_gateway_request, ai_gateway_multi_request (when aiGateway is configured)
```

## Events

The orchestrator emits events for observability:

```typescript
agent.on((event) => {
  switch (event.type) {
    case 'turn:start':
      console.log(`Turn ${event.turn} started`);
      break;
    case 'thinking':
      console.log(`Assistant: ${event.data.content}`);
      break;
    case 'tool:calling':
      console.log(`Calling: ${event.data.toolName}`);
      break;
    case 'tool:result':
      console.log(`Result: ${event.data.result.success}`);
      break;
    case 'complete':
      console.log('Agent completed');
      break;
    case 'error':
      console.error(`Error: ${event.data.error}`);
      break;
  }
});
```

## Streaming

Use `runStream` for real-time event streaming:

```typescript
const stream = agent.runStream('Help me with my task');

for await (const event of stream) {
  console.log(`[${event.type}]`, event.data);
}

// Get final state from return value
const finalState = await stream.return?.();
```

## Specialized Agents

Spawn specialized agents for different tasks (inspired by Claude Code):

```typescript
import {
  createAgentManager,
  createToolRegistry,
  createMockLLM,
} from '@ku0/agent-runtime';

// Create agent manager
const manager = createAgentManager({
  llm: myLLMAdapter,
  registry: toolRegistry,
});

// Spawn a specialized agent
const result = await manager.spawn({
  type: 'explore',
  task: 'Find all React components in src/',
});

console.log(result.output);

// Spawn multiple agents in parallel
const results = await manager.spawnParallel([
  { type: 'explore', task: 'Find API routes' },
  { type: 'research', task: 'Research React 19 features' },
]);
```

### Available Agent Types

| Type | Description | Tools | Security |
|------|-------------|-------|----------|
| `general` | General-purpose with all tools | `*` | balanced |
| `bash` | Command execution specialist | `bash:*`, `file:read`, `file:list` | power |
| `explore` | Codebase exploration and search | `file:read`, `file:list`, `file:info` | safe |
| `plan` | Planning and architecture | `file:read`, `file:list`, `file:info` | safe |
| `code` | Code generation and editing | `file:*`, `code:*`, `bash:execute` | balanced |
| `research` | Web research and information | `web:search`, `web:fetch` | balanced |

### Web Search Tool Server

Search the web and fetch content:

```typescript
import { createWebSearchToolServer } from '@ku0/agent-runtime';

// With mock provider (for testing)
const webServer = createWebSearchToolServer();

// Register with registry
await registry.register(webServer);

// Tools: search, fetch
```

Implement `IWebSearchProvider` to connect to real search backends:

```typescript
import type { IWebSearchProvider } from '@ku0/agent-runtime';

class MySearchProvider implements IWebSearchProvider {
  readonly name = 'my-provider';

  async search(query: string, options?) {
    // Connect to your search API
    return results;
  }

  async fetch(url: string) {
    // Fetch and extract content
    return { url, title, content, contentType };
  }
}

const webServer = createWebSearchToolServer(new MySearchProvider());
```

## Telemetry

Built-in observability with metrics and tracing:

```typescript
import {
  createTelemetryContext,
  createOrchestrator,
  AGENT_METRICS,
} from '@ku0/agent-runtime';

// Create telemetry context
const telemetry = createTelemetryContext();

// Pass to orchestrator
const agent = createOrchestrator(llm, registry, {
  telemetry,
});

// Run agent
await agent.run('Do something');

// Export metrics (Prometheus format)
console.log(telemetry.metrics.toPrometheus());

// Get trace spans
const spans = telemetry.tracer.getSpans();
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `agent_tool_calls_total` | counter | Total tool calls by name and status |
| `agent_tool_call_duration_ms` | histogram | Tool execution time |
| `agent_turns_total` | counter | Agent turns by status |
| `agent_turn_duration_ms` | histogram | Turn duration |
| `agent_active_count` | gauge | Currently active agents |
| `agent_llm_requests_total` | counter | LLM API requests |
| `agent_llm_tokens_total` | counter | Token usage |
| `agent_permission_denied_total` | counter | Permission denials |

## External Framework Integration

The package provides adapter stubs for integrating external frameworks:

```typescript
import { LangChainAdapter, DifyAdapter, AdapterRegistry } from '@ku0/agent-runtime';

// Register adapters (implement when needed)
const adapters = createAdapterRegistry([
  new LangChainAdapter({ /* config */ }),
  new DifyAdapter({ endpoint: '...', apiKey: '...' }),
]);

// Check available adapters
const available = await adapters.getAvailable();
```

## API Reference

### Core Exports

- `createToolRegistry()` - Create a new tool registry
- `createOrchestrator(llm, registry, options)` - Create an agent orchestrator
- `createAICoreAdapter(provider, options)` - Adapt ai-core provider to agent LLM
- `securityPolicy()` - Create a security policy builder

### Tool Servers

- `createBashToolServer(executor?)` - Bash command execution
- `createFileToolServer(options?)` - File system operations
- `createCodeToolServer(executor?)` - Code execution
- `createSubagentToolServer(manager)` - Subagent orchestration tools
- `createLFCCToolServer(bridge?)` - Document operations
- `createWebSearchToolServer(provider?)` - Web search and fetch

### Agents

- `createAgentManager(config, telemetry?)` - Create agent manager
- `AGENT_PROFILES` - Predefined agent profiles
- `getAgentProfile(type)` - Get profile for agent type
- `listAgentTypes()` - List available agent types

### Security

- `createSecurityPolicy(preset)` - Create policy from preset
- `createPermissionChecker(policy)` - Create permission checker
- `createAuditLogger(maxEntries?)` - Create audit logger
- `SECURITY_PRESETS` - Available preset configurations

### Telemetry

- `createTelemetryContext()` - Create metrics + tracer context
- `InMemoryMetricsCollector` - In-memory metrics implementation
- `InMemoryTracer` - In-memory distributed tracing
- `measureAsync(metrics, name, labels, fn)` - Measure async function duration
- `traced(tracer, name, fn)` - Wrap function with tracing
- `AGENT_METRICS` - Predefined metric definitions

## License

Private - Internal use only
