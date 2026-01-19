# Architecture Deep Dive: Top Agent Projects

**Analysis Date**: 2026-01-20
**Scope**: Source-level analysis of `.tmp/analysis/`
**Projects**: OpenCode (Go), MetaGPT (Python), CrewAI (Python), Cline (TypeScript)

---

## 1. OpenCode (Go)

**Key Finding**: Robust, idiomatic Go architecture suitable for high-performance agent runtimes.

### Core Modules (`internal/`)
- **`pubsub/broker.go`**: Generic, thread-safe Event Bus using Go channels.
  - Used for decoupling TUI, LSP, and Agent logic.
  - Pattern: `Subscribe(ctx) <-chan Event[T]`
- **`lsp/client.go`**: Production-grade LSP client.
  - Manages `exec.Cmd` lifecycle.
  - Handles `stdin/stdout` pipes for JSON-RPC.
  - Specific support for `gopls`, `tsserver`, `pyright`.
- **`session/`**: SQLite-backed conversation persistence.
- **`tui/`**: Bubbletea-based terminal interface.

**Relevance**:
- **Track O**: Event Bus pattern is perfect for our `RuntimeMessageBus`.
- **Track C3**: LSP implementation is a direct reference for our TypeScript integration.

---

## 2. MetaGPT (Python)

**Key Finding**: Structured, schema-driven architecture using Pydantic.

### Schema Design (`metagpt/schema.py`)
- **`Message`**: Includes routing (`send_to`, `cause_by`) and resources.
- **`Plan`**: Topological sort for task dependencies.
- **`Action`**: Atomic units of work with input/output validation.
- **`Role`**: Composes Actions and Memories.

**Relevance**:
- **Track O**: `send_to` routing logic informs our A2A protocol.
- **Track P**: `Plan` dependency management references our task decomposition.

---

## 3. CrewAI (Python)

**Key Finding**: Role-based delegation and sequential/hierarchical processes.

### Core Concepts (`src/crewai/`)
- **`agent/`**: Individual agent logic with `role`, `goal`, `backstory`.
- **`task.py`**: Task definitions (`async` or `sequential`).
- **`crew.py`**: Orchestrates agents and tasks.
- **`process.py`**: Supports Sequential and Hierarchical execution flows.

**Relevance**:
- **Track O**: Role-based delegation is key for Agent Collaboration.
- **Track N**: Agent-specific tooling configuration.

---

## 4. Cline (TypeScript)

**Key Finding**: Local-first, VS Code-native implementation with robust tooling.

### Key Components
- **`McpHub`**: Centralized MCP server management with OAuth.
- **`AutoApprove`**: Path-based validation for security (analyzed in depth).
- **`ShadowCheckpoint`**: Git worktree isolation for safe state tracking.

**Relevance**:
- **Track N & P**: Directly informing our implementation of Security and State.

---

## Comparative Architecture Matrix

| Feature | OpenCode (Go) | MetaGPT (Python) | CrewAI (Python) | Cline (TS) | **Our Roadmap** |
|---------|---------------|------------------|-----------------|------------|-----------------|
| **Events** | Channel-based PubSub | Observer Pattern | Direct Call | ID-based Callbacks | **Event Bus (Track O)** |
| **State** | SQLite Session | JSON/Git Repo | InMemory/Pickle | Shadow Git | **Shadow Git + SQL (Track P)** |
| **Tools** | Internal + MCP | Custom Actions | LangChain Tools | MCP + VS Code API | **MCP 2.0 (Track N)** |
| **Security**| Permission Config | Lint Rollback | N/A | Path Validation | **OAuth + Path Check (Track N)** |

## Recommendations

1. **Adopt OpenCode's Event Bus** structure for high-throughput internal messaging.
2. **Adopt MetaGPT's Schema** rigor for inter-agent messages (A2A).
3. **Adopt Cline's MCP & AutoApprove** for the most secure local execution environment.
