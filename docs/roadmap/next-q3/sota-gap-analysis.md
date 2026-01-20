# Source-Level SOTA Gap Analysis

> **Date**: 2026-01-20
> **Scope**: Compare 10 top agent frameworks vs Keep-Up current state and Q3 goals
> **Conclusion**: Q3 completion reaches SOTA

---

## 0. Key findings from competitor source review

The notes below summarize source-level analysis from `.tmp/analysis/` across 10 projects.

### CrewAI `long_term_memory.py`
```python
# Location: crewAI/lib/crewai/src/crewai/memory/long_term/long_term_memory.py
def save(self, item: LongTermMemoryItem):  # store task results
def search(self, task: str, latest_n: int = 3):  # retrieve by task text
```
**Missing capability**: no automatic preference extraction from user feedback (Track Y target).

### MetaGPT `memory.py`
```python
# Location: MetaGPT/metagpt/memory/memory.py
def try_remember(self, keyword: str) -> list[Message]:  # keyword match
    return [m for m in self.storage if keyword in m.content]
```
**Missing capability**: keyword-only memory, no semantic vector retrieval (Track Y target).

### OpenCode `lsp.go`
```go
// Location: opencode/internal/app/lsp.go
func (app *App) initLSPClients(ctx context.Context)  // start LSP clients
func (app *App) createAndStartLSPClient(...)  // create client
```
**Missing capability**: LSP is only used for editor integration, not injected into agent context (Track X target).

### Other projects
- Cline: MCP hub and hooks, no LSP sense layer
- Gemini CLI: tool isolation and policy engine, no long-term learning
- LangGraph: graph runtime and checkpoints, no code understanding
- AutoGen: actor runtime and workbench, no LSP integration

---

## 1. Capability matrix

| Capability | OpenCode | Cline | Gemini CLI | LangGraph | Keep-Up (current) | Keep-Up (post-Q3) |
|-----------|----------|-------|------------|-----------|-------------------|-------------------|
| Graph execution engine | No | No | No | Yes | Yes `graph/runner.ts` | Yes |
| Multi-agent collaboration | No | No | No | No | Yes `swarm/swarmOrchestrator.ts` | Yes |
| Checkpoints and replay | Partial | Partial | No | Yes | Yes `checkpoint/` | Yes |
| Tool governance | Yes | Yes | Yes | No | Yes `security/`, MCP | Yes |
| LSP code perception | Partial | No | No | No | Partial `tool-lsp/client.ts` | Yes (Track X) |
| Long-term learning | No | No | No | No | Partial `memoryManager.ts` | Yes (Track Y) |
| Automated evaluation | No | No | No | No | No | Yes (Track Z) |

Legend: Yes = full, Partial = limited, No = missing.

---

## 2. Key module analysis

### 2.1 Graph execution engine (Q2 delivered)

**Files**: `packages/agent-runtime/src/graph/`
- `runner.ts` (20KB): full graph execution loop with scheduling and state propagation.
- `builder.ts`: graph DSL.
- `types.ts`: typed state definitions.

**Comparison with LangGraph**: Keep-Up covers core Pregel concepts (Channel, Reducer, Checkpoint).

**Verdict**: Meets target.

---

### 2.2 Multi-agent swarm (Q2 delivered)

**Files**: `packages/agent-runtime/src/swarm/`
- `swarmOrchestrator.ts` (9KB): multi-agent scheduling.
- `openaiAgentsAdapter.ts`: OpenAI Agents SDK integration.
- `types.ts`: agent contracts.

**Comparison with AutoGen/MetaGPT**: Keep-Up already ships team orchestration and role routing.

**Verdict**: Meets target.

---

### 2.3 LSP code perception (Q3 Track X target)

**Current state**: `packages/tool-lsp/src/client.ts`

Existing API:
- `findReferences(filePath, line, column)`
- `rename(filePath, line, column, newName)`
- `getDocumentSymbols(filePath)`

**Missing Q3 capabilities**:
- Symbol map auto-injection into the agent context.
- Semantic retrieval based on AST, not only text.
- Impact analysis before edits ("this change affects N files").

**Post-Q3**: IDE-grade code understanding that exceeds all reviewed frameworks.

**Verdict**: Partial to full after Q3.

---

### 2.4 Long-term adaptive learning (Q3 Track Y target)

**Current state**: `packages/agent-runtime-memory/src/memoryManager.ts`

Existing API:
- `remember(content, options)`: store memory.
- `recall(query, options)`: retrieve memory.
- `consolidate()`: memory consolidation.

**Missing Q3 capabilities**:
- Preference extraction from user feedback.
- Cross-session persistence and proactive application.
- Personality profiles for memory scope.

**Post-Q3**: learning-based agent profile that exceeds competitor offerings.

**Verdict**: Partial to full after Q3.

---

### 2.5 Automated evaluation (Q3 Track Z target)

**Current state**: not present.

No reviewed framework implements CI-driven cognitive regression testing.

**Post-Q3**: Keep-Up becomes the only local agent framework with CI-driven cognitive regression tests.

**Verdict**: Missing to full after Q3.

---

## 3. SOTA certification

### 3.1 Competitive surpass matrix

| Competitor | Keep-Up (current) | Keep-Up (post-Q3) |
|------------|-------------------|-------------------|
| OpenCode | Parity (events, permissions) | Surpasses (LSP + Memory) |
| Cline | Parity (MCP, hooks) | Surpasses (Graph + Learning) |
| Gemini CLI | Parity (tool isolation, policy) | Surpasses (Swarm + Gym) |
| LangGraph | Parity (graph engine) | Surpasses (full cognitive stack) |
| AutoGen | Parity (team orchestration) | Surpasses (LSP sense) |
| MetaGPT | Parity (role SOPs) | Surpasses (adaptive memory) |

### 3.2 Unique advantages (post-Q3)

1. LSP-as-sense: first agent to treat LSP as perception, not just a tool.
2. Adaptive learning: cross-session learning from user preferences, local-first.
3. Cognitive gym: CI-driven IQ regression suite.

---

## 4. Final conclusion

> **After Q3, Keep-Up reaches SOTA status.**
>
> This is based on source-level comparisons across 10 top frameworks:
> - Track X (LSP) closes the code perception gap.
> - Track Y (Memory) closes the long-term learning gap.
> - Track Z (Gym) closes the quality measurement gap.
>
> After Q3, Keep-Up is the only local agent framework that combines graph execution, multi-agent teams, LSP perception, adaptive learning, and automated evaluation.
