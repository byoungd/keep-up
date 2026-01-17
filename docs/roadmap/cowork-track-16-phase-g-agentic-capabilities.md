# Track 16: Phase G - Production-Grade Agentic Capabilities

> **Status**: 📝 Planning (V2 - Zero Tech Debt)
> **Goal**: Match Claude Cowork / OpenCode production quality. No toy implementations.

## Zero-Compromise Standards

1. **Isolation**: Docker Sandbox / VM is MANDATORY, not optional.
2. **MCP**: All tools MUST expose via Model Context Protocol.
3. **Verification**: Every capability must have E2E tests before merge.

---

## G-1: Browser Agent [Playwright + MCP]

**Primary Benchmark**: Google Antigravity (2025)
- Agent-first browser-use: DOM manipulation, form filling, navigation
- Mission Control: Multi-agent orchestration with visual monitoring
- Artifact generation: Screenshots, recordings, walkthroughs

**Secondary Benchmarks**: Claude Computer Use, Vercel `agent-browser`

### Technical Requirements
- **Engine**: Playwright (Chromium)
- **DOM Strategy**: Accessibility Tree with Element ID Mapping (`@1`, `@2`) - Vercel pattern
- **MCP Interface**: Full compliance with `playwright-mcp-server` patterns
- **Recording**: Browser session recordings as artifacts (Antigravity pattern)

### Implementation
| File | Purpose |
|------|---------|
| `src/browser/browserManager.ts` | Singleton lifecycle, context pooling |
| `src/browser/accessibilityMapper.ts` | `@id` mapping for LLM consumption |
| `src/tools/browser/browserToolServer.ts` | MCP server (`listTools`, `callTool`) |

### Tools
- `browser:navigate` - URL + wait strategies
- `browser:snapshot` - Accessibility tree with `@id` refs
- `browser:interact` - Click/type using `@id` refs
- `browser:screenshot` - Visual fallback (base64)

---

## G-2: Sandbox Runtime [Docker]

**Benchmark**: Claude Cowork VM, Docker Desktop Sandboxes

### Why NOT Just Git Worktree
- Worktree only isolates **source code** (branch-level).
- Sandbox isolates **runtime** (OS-level). Agent cannot `rm -rf /`.
- Claude Cowork uses Apple VMs. We use Docker for portability.

### Technical Requirements
- **Container Runtime**: Dockerode (Docker Engine API)
- **Image**: Minimal Alpine + Node.js 20
- **Workspace Mounting**: User project → `/workspace` (read-write)
- **Network**: Isolated by default, allowlist for specific hosts

### Implementation
| File | Purpose |
|------|---------|
| `src/sandbox/sandboxManager.ts` | Container lifecycle (create/destroy) |
| `src/sandbox/sandboxContext.ts` | `ISandboxContext` interface for tools |
| `src/sandbox/Dockerfile.agent` | Minimal agent runtime image |
| `src/tools/sandbox/sandboxToolServer.ts` | MCP tools for sandbox control |

### Security Policy
```typescript
interface SandboxPolicy {
  network: 'none' | 'allowlist' | 'full';
  allowedHosts?: string[];
  filesystem: 'read-only' | 'workspace-only' | 'full';
  maxMemoryMB: number;
  maxCpuPercent: number;
  timeoutMs: number;
}
```

---

## G-3: E2E Pipelines [Trigger.dev Compatible]

**Benchmark**: Devin's async task delegation

### Technical Requirements
- **Persistence**: SQLite-backed (not just filesystem)
- **Resume**: Survive server restarts
- **Triggers**: Webhook API + Linear/GitHub integration stubs

### Implementation
| File | Purpose |
|------|---------|
| `src/pipelines/pipelineSchema.ts` | Zod schemas for Pipeline/Stage |
| `src/pipelines/pipelineStore.ts` | SQLite persistence layer |
| `src/pipelines/pipelineRunner.ts` | Stage executor with retry |
| `src/pipelines/triggers/webhook.ts` | HTTP trigger endpoint |

---

## Verification Matrix

| Capability | Unit Test | Integration Test | E2E Test |
|------------|-----------|------------------|----------|
| Browser Agent | ✓ Mocked Playwright | ✓ Real browser | ✓ Navigate + Extract |
| Sandbox Runtime | ✓ Dockerode mocks | ✓ Real container | ✓ Execute command safely |
| Pipelines | ✓ SQLite in-memory | ✓ File persistence | ✓ Resume after crash |

---

## Dependencies to Add

```bash
pnpm add playwright dockerode better-sqlite3
pnpm add -D @types/dockerode @types/better-sqlite3
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Docker not installed | Graceful fallback to "unsafe" mode with warning |
| Playwright binary size | CI caching + lazy install |
| SQLite in edge runtime | Use D1 adapter for Cloudflare |
