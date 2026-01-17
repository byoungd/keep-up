# Agent Runtime Architecture

> **Golden Rule**: Leverage specialized open-source libraries over custom implementations. Do not reinvent the wheel.

This document serves as the authoritative guide for the `agent-runtime` architecture. All agents and extensions MUST follow these standards.

## Core Integrations

We have standardized on the following libraries. **Do not create custom implementations** for these capabilities.

| Capability | Standard Library | Adapter / Usage | Status |
|------------|------------------|-----------------|--------|
| **Multi-Agent** | `@openai/agents` | `OpenAIAgentsOrchestrator` | ✅ Mandatory |
| **Memory** | `mem0ai` | `Mem0MemoryAdapter` | ✅ Mandatory |
| **File Watching** | `chokidar` | `GhostAgent` | ✅ Mandatory |
| **Logging** | `pino` | `RuntimeLogger` / `createRuntimeLogger` | ✅ Mandatory |
| **YAML Parsing** | `gray-matter` | `parseFrontmatter` | ✅ Mandatory |

---

## 1. Multi-Agent Orchestration

**Standard**: Use the official OpenAI Agents SDK.
**Forbidden**: Implementing custom swarm logic, handoff protocols, or agent loops.

```typescript
// ✅ CORRECT
import { createOpenAIAgentsOrchestrator, Agent } from "@ku0/agent-runtime";
const orchestrator = createOpenAIAgentsOrchestrator({ model: "gpt-4o" });

// ❌ WRONG
class CustomSwarm {
  async runLoop() { /* custom logic */ }
}
```

## 2. Persistent Memory

**Standard**: Use `mem0ai` for cross-session long-term memory.
**Forbidden**: Creating custom vector stores (`pgvector`, `chroma`, etc.) directly in this package.

```typescript
// ✅ CORRECT
import { createMem0MemoryAdapter } from "@ku0/agent-runtime";
const memory = createMem0MemoryAdapter({ apiKey: process.env.MEM0_API_KEY });

// ❌ WRONG
class MyVectorStore {
  async embed() { /* custom embedding */ }
}
```

## 3. File System Monitoring

**Standard**: Use `chokidar` via `GhostAgent` for proactive file monitoring.
**Forbidden**: Using `fs.watch` or `fs.watchFile` directly.

```typescript
// ✅ CORRECT
import { createGhostAgent } from "@ku0/agent-runtime";
const ghost = createGhostAgent("/workspace");

// ❌ WRONG
fs.watch("/workspace", (event, filename) => { ... });
```

## 4. Logging & Observability

**Standard**: Use `pino` layered via `RuntimeLogger`.
**Forbidden**: usage of `console.log`, `console.error`, or `console.warn` in production code.

```typescript
// ✅ CORRECT
import { createRuntimeLogger } from "@ku0/agent-runtime";
const logger = createRuntimeLogger({ module: "MyComponent" });
logger.info("Operation started", { id: 123 });

// ❌ WRONG
console.log("Operation started", 123);
```

## 5. Structured Data Parsing

**Standard**: Use `gray-matter` for all YAML frontmatter parsing.
**Forbidden**: Custom regex-based frontmatter parsers.

```typescript
// ✅ CORRECT
import { parseFrontmatter } from "@ku0/agent-runtime";
const { data, content } = parseFrontmatter(text);

// ❌ WRONG
const match = text.match(/^---\n([\s\S]*?)\n---/);
```

---

## Architectural Principles

1.  **Adapter Pattern**: All external libraries must be wrapped in internal interfaces (e.g., `IMemoryManager`, `ISwarmOrchestrator`) to allow for future replacement if necessary without breaking consumers.
2.  **Progressive Enhancement**: Advanced features (like Ghost Agent) should be optional enhancements, not blockers for basic runtime startup.
3.  **Type Safety**: All integrations must provide full TypeScript definitions. Avoid `any`.
