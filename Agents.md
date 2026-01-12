# AI Agents Guide

This document serves two purposes:
1.  **Collaboration Guide**: Defining roles and workflows for AI Agents (PM, Tech Lead, Developer, QA) collaborating on this project.
2.  **Technical Protocol**: Specifying how AI features *inside* the application interact with the LFCC engine.

## Project Context

**Keep-Up Reader** is a local-first collaborative reading/annotation application built on:
- **LFCC Protocol**: Local-First Collaboration Contract for deterministic sync
- **Loro CRDT**: Single source of truth for collaborative state
- **ProseMirror**: Rich text editor with custom NodeViews
- **Agent Runtime** (`packages/agent-runtime`): MCP tools, orchestration, and AI pipelines

## Quick Reference

| Document | Purpose |
|----------|---------|
| [`CLAUDE.md`](CLAUDE.md) | Quick reference for Claude Code |
| [`.agent/quality-gates.md`](.agent/quality-gates.md) | Quality gate definitions and enforcement |
| [`.agent/agent-specs.md`](.agent/agent-specs.md) | Detailed agent specifications |
| [`.agent/design-standards.md`](.agent/design-standards.md) | UI/UX design standards (Linear-level) |
| [`.agent/workflows/e2e-test.md`](.agent/workflows/e2e-test.md) | E2E testing workflow |
| [`CODING_STANDARDS.md`](CODING_STANDARDS.md) | Code quality standards |

---

# Part 1: Agent Collaboration Guide

## 1. Agent Personas

To simulate a full engineering team, Agents should adopt specific personas based on the active task.

### 🍷 Product Manager (PM)
*   **Focus**: User value, requirements clarity, task tracking.
*   **Responsibility**:
    *   Maintains `task.md`.
    *   Ensures the "Why" is clear before the "How" is planned.
    *   Accepts/Rejects `walkthrough.md` based on original requirements.

### 📐 Tech Lead (Architect)
*   **Focus**: System integrity, patterns, non-functional requirements.
*   **Responsibility**:
    *   Owns `CODING_STANDARDS.md` and `Agents.md`.
    *   Reviews `implementation_plan.md` for architectural compliance.
    *   Enforces LFCC constraints (Determinism, SEC).

### 🔨 Developer
*   **Focus**: Efficient execution, code quality, test coverage.
*   **Responsibility**:
    *   Writes code and tests.
    *   Follows the `implementation_plan.md` strictly.
    *   Updates `task.md` progress (`[/]`, `[x]`).

### 🕵️ QA / Reviewer
*   **Focus**: Regressions, edge cases, verification.
*   **Responsibility**:
    *   Runs the `walkthrough.md` steps.
    *   Checks for "it works on my machine" issues.
    *   Verifies build and test health.

## 2. Collaboration Workflow

### Handoff Protocol
When switching context or personas, Agents must use **Artifacts** to transfer state. Do not rely on implicit chat history.

1.  **Planning Phase** (PM + Architect):
    *   Input: User Request.
    *   Output: `task.md` (updated) + `implementation_plan.md`.
2.  **Execution Phase** (Developer):
    *   Input: Approved `implementation_plan.md`.
    *   Action: Code changes + Tests.
    *   Output: `walkthrough.md`.
3.  **Verification Phase** (QA):
    *   Input: `walkthrough.md`.
    *   Action: Validation.
    *   Output: Final Status (Success/Fail).

---

# Part 2: Technical Protocol (The "AI Envelope")

This section outlines how AI features *within the app* interact with the Local-First Collaboration system. The architecture is designed to be **model-agnostic**, **safe**, and **deterministic**.

## 1. Interaction Protocol (The "AI Envelope")

Agents do not mutate the document directly. They must submit requests to the **AI Gateway**, which enforces strict safety and synchronization rules.

### The Request Loop

1.  **Read**: Observe the current document state and obtain the **Frontier** (a causal precise version vector).
2.  **Think**: Generate the proposed changes.
3.  **Act**: Submit a request (e.g., `Replace Spans`) with:
    *   `doc_frontier`: The version you observed.
    *   `preconditions`: "I expect span X to have hash Y".
    *   `payload`: The new content.

### Payload Structure

AI payloads are typically **XML fragments** or **JSON structures** representing the change.

```json
{
  "doc_frontier": "vector_clock_string",
  "client_request_id": "uuid",
  "ops_xml": "<replace_spans annotation=\"uuid\">...</replace_spans>",
  "preconditions": [
    { "span_id": "target_uuid", "if_match_context_hash": "sha256_ver" }
  ]
}
```

## 2. Safety & Dry-Run Pipeline

Every AI mutation undergoes a mandatory **Dry-Run Pipeline** before hitting the editor. If **any** step fails, the request is rejected (Fail-Closed).

1.  **Sanitize (Whitelist)**:
    *   **Allowed**: Standard rich text (`bold`, `italic`, `link`, etc.) and structural blocks (`paragraph`, `code`, `table`).
    *   **Banned**: `<script>`, `<style>`, `iframe`, `onclick` handlers.
2.  **Normalize**:
    *   The payload is converted to the **LFCC Canonical Tree** (v2).
    *   This ensures deterministic structure (no varying DOM nesting).
3.  **Schema Dry-Run**:
    *   The system attempts to apply the change to a sandbox editor instance.
    *   If the editor cannot parse it or produces an invalid state, the request fails.

## 3. Handling Conflicts (409)

Since the system is local-first and collaborative, the document may change while the Agent is thinking. If your `doc_frontier` is stale, you will receive a **409 Conflict**.

**Recommended Rewrite Strategies:**

1.  **Rebase**: Fetch the latest changes and update your `doc_frontier`.
2.  **Relocate**:
    *   Try to find your target spans again using **Context Hash** matching.
    *   If `ai_sanitization_policy` allows, use fuzzy matching (Level 2/3).
3.  **Retry**: Submit the updated request.

## 4. Best Practices for Agent Developers

*   **Never Guess IDs**: Always read existing Block/Span IDs from the document.
*   **Respect Preconditions**: Always include `if_match_context_hash` for any span you are modifying. This prevents "overwrite wars".
*   **Output Canonical**: Prefer generating simple, standard HTML/XML that maps 1:1 to the LFCC Canonical blocks. Complex or messy HTML increases the chance of dry-run rejection.
*   **Statelessness**: Do not assume the server remembers your previous thought process. Every request must be self-contained regarding its target validators.

---

# Part 3: Code Quality Standards for Agents

When writing or modifying code, Agents **MUST** follow the rules in `CODING_STANDARDS.md`. Key points:

## 0. CRDT Standard (Loro Only)

- **Single source of truth**: Loro is the only CRDT used in this project.
- **Do not introduce Yjs**: Do not add Yjs dependencies or serialize/deserialize Yjs updates anywhere.
- **Import/persistence/reader alignment**: Pipelines that store or read CRDT data must produce and consume Loro snapshots/updates.
- **If Yjs artifacts exist**: Stop and propose a migration plan to Loro before extending behavior.
- **Pre-flight check**: Confirm the active CRDT and storage format before implementing features that touch import, persistence, or rendering.

## 1. Pre-Flight Checklist

Before submitting code changes, verify:

- [ ] **TypeScript**: All code is in TypeScript (no `.js` files for new code).
- [ ] **No `any`**: Avoid `any` types. Use `unknown` or proper interfaces.
- [ ] **No `var`**: Use `const` by default, `let` when reassignment needed.
- [ ] **Biome passes**: Run `pnpm biome check --write` before committing.

## 2. React/JSX Rules (Critical)

| Rule | Bad | Good |
|------|-----|------|
| Button type | `<button onClick={...}>` | `<button type="button" onClick={...}>` |
| Array key | `items.map((x, i) => <div key={i}>)` | `items.map((x) => <div key={x.id}>)` |
| Semantic elements | `<div role="button">` | `<button>` |
| Loop style | `array.forEach(fn)` | `for (const x of array)` |
| Labels | `<label>Decorative text</label>` | `<span>Decorative text</span>` |
| Icon-only buttons | `<Button size="icon"><Icon /></Button>` | `<Button size="icon" aria-label="Description"><Icon /></Button>` |
| Form inputs | `<input type="text" />` | `<input type="text" aria-label="Field name" />` |

## 2.2 Editor Animation Constraints (Critical)

> [!CAUTION]
> **Do NOT use Framer Motion in ProseMirror editor components.**

Framer Motion's `layout` animations conflict with ProseMirror's DOM management:
- ProseMirror directly controls cursor and selection positions
- Framer Motion's layout measurements interfere with this control
- This causes **cursor jumping to wrong positions** after Enter/split operations

**Rules:**
| Component | Allowed | Forbidden |
|-----------|---------|-----------|
| `BlockNodeView.tsx` | Plain `div`, CSS transitions | `motion.div`, `layout`, `layoutId` |
| Editor NodeViews | CSS animations, ProseMirror decorations | Any Framer Motion component |
| Outside editor | Framer Motion OK | - |

**If you need block animations:**
- Use pure CSS transitions (`transition: transform 0.2s`)
- Use ProseMirror's built-in decoration system
- Implement custom DOM animation after ProseMirror transaction settles

## 2.1 Accessibility (A11y) Requirements

All UI components MUST follow these accessibility rules:

| Element | Requirement | Example |
|---------|-------------|---------|
| Icon-only button | Add `aria-label` | `<Button aria-label={t("close")}><X /></Button>` |
| Range input | Add `aria-label` | `<input type="range" aria-label="Font size" />` |
| Scrollable region | Add `tabIndex={0}` | `{/* biome-ignore ... */}<section tabIndex={0}>` |
| Color picker | Use `<button>` with `aria-label` | `<button aria-label="Warm">` |
| Landmarks | One `<main>` per page | Use `<article>` for nested content areas |
| Decorative icons | Add `aria-hidden="true"` | `<Icon aria-hidden="true" />` |

## 3. Tailwind CSS (v4 Syntax)

| Deprecated | Modern |
|------------|--------|
| `bg-gradient-to-br` | `bg-linear-to-br` |
| `z-[60]` | `z-60` |

## 4. Unused Code

- **Unused imports**: Remove them (Biome auto-fixes this).
- **Unused parameters**: Prefix with `_` (e.g., `_event`).
- **Unused variables**: Remove or rename with `_` prefix.

## 5. Complexity Guidelines

- Functions should have cognitive complexity ≤ 15
- Use early returns to reduce nesting
- Extract helper functions for complex logic
- Remove useless `else` after `return`

## 6. Commit Workflow

```bash
# 1. Fix and format code
pnpm biome check --write

# 2. Stage changes
git add -A

# 3. Commit (lint-staged runs automatically via husky)
git commit -m "feat: description"
```

The pre-commit hook runs `biome check --write` on staged files via `lint-staged`.


## 7. Documentation Language

- **English Only**: All code documentation (JSDoc, inline comments) and internal documentation (markdown files) MUST be written in English.

---

# Part 4: E2E Testing Strategy

## 1. Golden Rule: Targeted Tests Over Full Suite

**Never run the full E2E suite during development.** Use targeted category tests instead:

```bash
# ✅ Correct: Run only the relevant category
pnpm test:e2e:core       # Editor changes
pnpm test:e2e:blocks     # Block system changes
pnpm test:e2e:collab     # Collaboration changes
pnpm test:e2e:annotations # Annotation changes
pnpm test:e2e:features   # Import/AI changes
pnpm test:e2e:smoke      # Quick sanity check
pnpm test:e2e:a11y       # Accessibility smoke

# ❌ Avoid: Full suite (slow, flaky under load)
pnpm test:e2e
```

## 2. Category Mapping

| Changed Area | Test Command |
|--------------|--------------|
| Editor, formatting, selection | `pnpm test:e2e:core` |
| Block NodeView, drag-drop | `pnpm test:e2e:blocks` |
| Collab server, WebSocket, sync | `pnpm test:e2e:collab` |
| Annotations, highlights, comments | `pnpm test:e2e:annotations` |
| Import, AI gateway, persistence | `pnpm test:e2e:features` |
| Pages, navigation | `pnpm test:e2e:smoke` |
| A11y | `pnpm test:e2e:a11y` |

## 3. Handling Timeouts

Timeouts are usually **load-related**, not logic bugs. Debug with:

```bash
# Re-run specific file with increased timeout
pnpm playwright test e2e/<file>.spec.ts --timeout=90000

# Run with single worker for stability
PLAYWRIGHT_WORKERS=1 pnpm test:e2e:<category>
```

## 4. When to Run Full Suite

Only run full E2E suite:
- Before **releases**
- Before **major branch merges**
- In **CI pipelines** (with retries enabled)

```bash
# Full suite with stability settings
PLAYWRIGHT_WORKERS=1 pnpm test:e2e:full
```

## 5. Workflow Reference

See `.agent/workflows/e2e-test.md` for the complete targeted testing workflow.
