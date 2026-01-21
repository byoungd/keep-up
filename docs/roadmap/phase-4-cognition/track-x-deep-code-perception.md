# Track X: Deep Code Perception (LSP)

> **Owner**: AI Engineer
> **Status**: Proposed
> **Priority**: Critical
> **Timeline**: Month 1-2
> **Dependencies**: `packages/tool-lsp`
> **Parent**: [Q3 Roadmap](./README.md)

---

## Objective

Evolve the agent's interaction with code from "Text Processing" (Regex/Grep) to "Semantic Understanding" (AST/LSP). 

Currently, agents waste steps "searching" for file paths or signatures. With Deep Code Perception, the agent has a "HUD" (Heads Up Display) of the project structure.

> [!NOTE]
> This is a **novel capability**. Analysis of 10 competitor frameworks (see [sota-gap-analysis.md](./sota-gap-analysis.md)) confirms no existing agent uses LSP as a "Sense" rather than a "Tool".

---

## Tasks

### X1: Semantic Symbol Map
- **Symbol Harvesting**: Create a background service that maintains a lightweight map of `Symbol -> FilePath:Line`.
- **System Prompt Injection**: Dynamically inject the most relevant symbols (based on user query) into the system prompt.
- **Why**: The agent should know "AuthService has a login method" without running `grep`.

### X2: LSP-Native Tools
- **Smart Navigation**: `go_to_definition(symbol)` instead of `read_file(path)`.
- **Safe Refactoring**: `rename_symbol(old, new)` that uses the LSP to update *all* references safely, ensuring we don't break imports.

### X3: Dependency Awareness
- **Import Graph**: Visualize circular dependencies and usage chains.
- **Impact Analysis**: Before editing a file, warn the agent: "This change affects 5 other files."

---

## Deliverables

| Deliverable | Location | Description |
|-------------|----------|-------------|
| `LSPService` | `packages/agent-runtime/src/lsp/` | Background service managing LSP connections |
| `SymbolGraph` | `packages/agent-runtime/src/lsp/symbolGraph.ts` | Real-time symbol index data structure |
| `nav_def` tool | `packages/agent-runtime-tools/` | Go to definition tool |
| `nav_refs` tool | `packages/agent-runtime-tools/` | Find all references tool |
| `rename_sym` tool | `packages/agent-runtime-tools/` | Safe symbol rename tool |

---

## Acceptance Criteria

- [ ] Agent can find a class definition in 1 step (0 searches).
- [ ] Agent successfully renames a widely-used function without syntax errors in consumers.
- [ ] Agent is aware of the "Type" of a variable without reading the definition file.
- [ ] `SymbolGraph` updates in <100ms after file save.

---

## KPIs (Measured in Track Z)

| Metric | Target | Description |
|--------|--------|-------------|
| Symbol Resolution Rate | >95% | Correct class/function location |
| Reference Accuracy | 100% | Match IDE results |
| Hallucination Rate | <1% | No invented methods |

---

## Testing

- Unit tests for `SymbolGraph` construction and querying.
- Integration tests for `rename_symbol` across multiple files.
- Suggested command: `pnpm --filter @ku0/agent-runtime test -- --grep "lsp"`

## Walkthrough

See [track-x-walkthrough.md](./track-x-walkthrough.md).
