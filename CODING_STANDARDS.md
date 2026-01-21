# Coding Standards

This project follows strict engineering standards to ensure **Local-First Collaboration (LFCC)** compliance, **Determinism**, and **Data Integrity**.

## 1. Core Principles (Non-Negotiable)

*   **Strong Eventual Consistency (SEC)**: All replicas receiving the same updates must converge to the exact same state.
*   **No Silent Drift**: Annotations must never "guess" their location. If a target is ambiguous, fail closed (orphan the annotation).
*   **Determinism**:  `f(state, op) -> state` must be pure. No implementation should rely on local timestamps or random values for logic decisions.
*   **Local-First**: The system must function fully offline. Sync is an asynchronous background process.

## 2. TypeScript & Code Style

*   **Language**: TypeScript ONLY.
*   **Strict Types**: No implicit `any`. Explicitly type all public interfaces.
*   **Variables**: Use `const` by default. Use `let` only when reassignment is required. Never use `var`.
*   **Concise**: Write clean, self-explanatory code. Comments should explain *why*, not *what*.

## 3. Biome Lint Rules (Enforced)

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following rules are **strictly enforced**:

### 3.1 Loop Patterns
*   **Use `for...of` instead of `forEach`**: Prefer `for (const item of items)` over `items.forEach(item => ...)`.
    ```typescript
    // ❌ Bad
    items.forEach((item) => { process(item); });
    
    // ✅ Good
    for (const item of items) { process(item); }
    ```

### 3.2 React/JSX Rules
*   **Use semantic HTML elements**: Replace `<div role="button">` with `<button>`.
*   **Add `type="button"` to buttons**: All `<button>` elements MUST have explicit `type="button"` unless they are submit buttons in forms.
*   **Use stable keys**: Never use array index as React `key`. Use unique identifiers from data.
    ```tsx
    // ❌ Bad
    items.map((item, i) => <div key={i}>{item.name}</div>)
    
    // ✅ Good
    items.map((item) => <div key={item.id}>{item.name}</div>)
    ```
*   **Associate labels with controls**: Use `<span>` instead of `<label>` for decorative text. Only use `<label>` when associated with an input via `htmlFor`.
*   **Keyboard accessibility**: Elements with `onClick` must also have keyboard handlers or use semantic elements like `<button>`.

### 3.3 SVG Accessibility
*   **Decorative SVGs**: Add `aria-hidden="true"` to decorative icons.
*   **Informative SVGs**: Add a `<title>` element or `aria-label` for screen readers.

### 3.4 Type Safety
*   **No `any`**: `noExplicitAny` is an **ERROR**. Use `unknown` for truly unknown types, or design proper interfaces.
*   **No Non-Null Assertions**: `noNonNullAssertion` is an **ERROR**. Do not use `!` to bypass null checks. Use optional chaining `?.` or explicit type guards.
*   **Use biome-ignore sparingly**: Only add `// biome-ignore lint/...` comments when absolutely necessary, with a reason explaining why.

### 3.5 Code Complexity
*   **Keep complexity low**: Functions must have small cognitive complexity.
*   **No Empty Blocks**: `noEmptyBlockStatements` is an **ERROR**.
*   **Early returns**: Use early returns to reduce nesting.
*   **Remove useless else**: After a return statement, do not wrap remaining code in `else`.
    ```typescript
    // ❌ Bad
    if (condition) {
      return value;
    } else {
      doSomething();
    }
    
    // ✅ Good
    if (condition) {
      return value;
    }
    doSomething();
    ```

### 3.6 Tailwind CSS (v4)
*   **Use modern syntax**: Prefer `bg-linear-to-br` over `bg-gradient-to-br`.
*   **Avoid arbitrary values when possible**: Use `z-60` instead of `z-[60]`.

### 3.7 Unused Code
*   **Remove unused imports**: Biome auto-removes these on save.
*   **Remove unused variables**: Prefix intentionally unused parameters with `_`.
    ```typescript
    // ✅ Good - explicitly mark as unused
    function handler(_event: Event, data: Data) { ... }
    ```

## 4. LFCC Implementation Rules (Critical)

### 4.1 Coordinates & Anchors
*   **UTF-16**: All indices are UTF-16 code units.
*   **Surrogate Pairs**: Operations MUST NOT split surrogate pairs.
*   **Stable Anchors**: Never persist absolute indices (integer offsets). Use **Stable Anchors** (Base64 encoded relative positions) for storage and sync.

### 4.2 Block Identity
*   **Preserve ID**: When modifying text within a block, the Block ID stays the same.
*   **Split**: Left/Top keeps the ID. Right/Bottom gets a new ID.
*   **Join**: Left/Top keeps the ID. Right/Bottom is retired.

### 4.3 Annotations
*   **SpanList**: All cross-block selections must be represented as a `SpanList` of strictly explicitly ordered spans.
*   **Wait**: Do not perform partial updates that leave the document in an invalid state.

## 5. Architecture Patterns

### 5.1 Canonicalization
All content equality checks (Shadow Model vs Real Editor) use **Recursive Canonicalization (v2)**.
*   Do not compare raw HTML strings.
*   Do not compare editor-internal JSON states directly unless normalized.

### 5.2 AI Integration
*   **Model Agnostic**: Code dealing with AI must never assume a specific model version.
*   **Dry-Run Compliance**: All AI headers/payloads must be passable to the `DryRunPipeline`.

## 6. Front-End & UI Logic

### 6.1 Annotation State Machine
*   **XState**: Use the reference State Machine (or exact equivalent) for handling annotation lifecycles.
*   **Display vs Storage**:
    *   **Computed States** (`active_unverified`, `broken_grace`) exist **ONLY** in the UI overlay. Never persist them to the CRDT.
    *   **Storage**: Only persist `active`, `orphan`, `hidden`, `deleted`.

### 6.2 Timers & Grace Periods
*   **Tokenized Timers**: All UI timers (e.g., for `broken_grace_period`) MUST be tokenized.
    *   Generate a `grace_token` on entry.
    *   On timer fire, check if `stored_token === fired_token`. If not, no-op.
*   **No Ghosting**: Never allow a stale timer to delete a recovered annotation.

### 6.3 UI & Design System Gates (Strict)
*   **Specs**: All UI changes MUST adhere to `docs/specs/cowork/cowork-ui-quality-gates.md`.
*   **No Magic Numbers**: No raw pixels or hex codes. Use `design-system` tokens.
*   **Physics**: Use `framer-motion` springs for layout interactions.
*   **Gate Check**: Agents must verify the **5 Quality Gates** (Tokens, Physics, Materials, Icons, A11y) before submitting.

## 7. Directory Structure
*   `apps/reader/`: Next.js application with the editor UI.
*   `packages/core/`: The core LFCC-compliant logic (kernel, sync, annotations).
*   `packages/lfcc-bridge/`: Adapter layer connecting ProseMirror to LFCC kernel.
*   `e2e/`: Playwright E2E test suites.
*   `docs/product/`: Product & Protocol Truth (LFCC Specs).

## 8. AI Agent Guidelines

### 8.1 Context Awareness
*   **Read First**: Before editing any file, read `task.md` and related `spec` or `protocol` documents.
*   **Search**: Use `grep_search` to find existing patterns before inventing new ones.

### 8.2 Tool Usage
*   **Specificity**: Prefer `view_file_outline` or `grep_search` over `list_dir` to reduce context noise.
*   **Safety**:
    *   Never use `rm -rf` or destructive commands without explicit user `SafeToAutoRun=false`.
    *   Always verify `npm install` or `pnpm install` is actually needed before running.

### 8.3 Communication
*   **Artifacts**: Use `implementation_plan.md` to communicate intent *before* writing code.
*   **Conciseness**: Keep comments and summaries sharp. Avoid "I will now..." metacommentary in final documents.

### 8.4 Pre-Commit Checks
*   **Run biome check**: Before committing, ensure `pnpm biome check --write` passes.
*   **Fix lint errors**: Address all errors (not just warnings) before requesting code review.
*   **Format code**: Biome handles formatting automatically; do not fight the formatter.

## 9. Testing Guidelines

### 9.1 Unit Tests (Vitest)
*   **Location**: Colocate tests with source (`foo.ts` → `foo.test.ts`) or use `tests/` folder in package.
*   **Naming**: Use descriptive names: `it('should return orphan state when block is deleted')`.
*   **Mocks**: Prefer dependency injection over global mocks.

### 9.2 E2E Tests (Playwright)
*   **Location**: `e2e/` directory at project root.
*   **Naming**: `feature-name.spec.ts`.
*   **Selectors**: Use `data-testid` attributes, never CSS classes.
*   **Stability**: Add appropriate waits; avoid `sleep()`.

### 9.3 Test Commands

| Command | Purpose |
|---------|---------|
| `pnpm test:unit` | Run all unit tests |
| `pnpm test:e2e:full` | Run full E2E suite (single worker) |
| `pnpm test:watch` | Watch mode for unit tests |

## 10. Error Handling Patterns

### 10.1 Fail-Closed Principle
*   When uncertain, reject the operation rather than guessing.
*   Example: If annotation target is ambiguous, mark as `orphan`, don't relocate.

### 10.2 Result Types
*   For fallible operations, prefer `Result<T, E>` pattern over throwing.
*   Use early returns for error cases.

### 10.3 Logging
*   Use structured logging with context: `console.warn('[LFCC][sync]', message, { docId, opId })`.
*   Never log sensitive data (user content, auth tokens).

## 11. Monorepo Best Practices

### 11.1 Package Dependencies
*   `packages/core` has ZERO external dependencies on UI frameworks.
*   `packages/lfcc-bridge` may depend on `prosemirror-*` but not React.
*   `apps/reader` may depend on any package.

### 11.2 Shared Types
*   Export types from package entry points.
*   Use `@ku0/core`, `@ku0/lfcc-bridge` workspace aliases.

### 11.3 Turbo Cache
*   Never commit `.turbo/` directory.
*   `turbo.json` defines task dependencies; follow existing patterns.

## 12. AI Engineering Standards (Agentic Phase)

### 12.1 Core Stack
*   **LLM Interactions**: MUST use Vercel AI SDK (`ai`). Direct provider SDK usage is BANNED.
*   **Structured Output**: MUST use `zod` v4.x schemas with `generateObject`.
*   **Telemetry**: All AI operations must be traced via `langfuse`.

### 12.2 Tool Definitions
*   **MCP Protocol**: All tools must implement Model Context Protocol (MCP) interfaces.
*   **Schema Safety**: Tool input schemas must be strict (`zconfig`, not `any`).
*   **Permissions**: Destructive tools MUST check `SecurityPolicy` before execution.

### 12.3 Agent Isolation
*   **Filesystem**: Agents should default to `ShadowWorkspace` or `Git Worktree` to avoid polluting user space.
*   **Browser**: Browser tools must use headless instances with resource caps.

## 13. Feature Development Process

### 13.1 Research First (Mandatory)
Before implementing any new feature, specific agents MUST:
1.  **Search Web**: Research the latest (2025-2026) open-source solutions and patterns.
2.  **Evaluate**: Compare 2-3 options (e.g., specific libraries vs custom impl).
3.  ** Reuse**: Prioritize integrating mature libraries over reinventing wheels.
4.  **Justify**: In the `implementation_plan.md`, explicitly state *why* a particular stack was chosen.

## 14. Rust Development Standards (Phase 6)

This project uses Rust for performance-critical subsystems. TypeScript remains the control plane; Rust is used only when there is a quantifiable performance or safety benefit.

### 14.1 Core Principles
*   **TypeScript orchestrates, Rust accelerates**: Orchestrator, policy, and model routing stay in TypeScript.
*   **N-API first**: Use napi-rs for synchronous Node bindings. UDS for isolated processes (future).
*   **Cross-platform**: All Rust code must support macOS, Linux, and Windows with explicit fallbacks.

### 14.2 Rust Crates

| Crate | Purpose | Priority |
|-------|---------|----------|
| `crates/sandbox-rs/` | OS-level sandbox (Seatbelt/Landlock/AppContainer) | P0 |
| `crates/storage-engine-rs/` | Event log + checkpoint engine | P1 |
| `crates/tokenizer-rs/` | tiktoken + Zstd compression | P1 |
| `crates/symbol-index-rs/` | Inverted/trigram symbol index | P2 |

### 14.3 Code Style
*   **Edition**: Rust 2024 edition.
*   **Clippy**: `cargo clippy -- -D warnings` must pass. No `#[allow(clippy::...)]` without justification.
*   **Formatting**: `cargo fmt` before commits.
*   **Error handling**: Use `thiserror` for library errors, `anyhow` for applications.
*   **Unsafe**: Avoid `unsafe` unless absolutely necessary. Document all unsafe blocks.
*   **Documentation**: Public APIs must have rustdoc comments with examples.

### 14.4 N-API Bindings
*   **Library**: Use `napi-rs` for TypeScript bindings.
*   **Thread safety**: All exported functions must be `Send + Sync` or use synchronous APIs.
*   **Error conversion**: Convert Rust `Result` to N-API errors with meaningful messages.
*   **WASM fallback**: Provide `wasm32-unknown-unknown` target for browser contexts where applicable.

```rust
// Example N-API export pattern
#[napi]
pub fn count_tokens(text: String, model: String) -> napi::Result<u32> {
    internal::count_tokens(&text, &model)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
```

### 14.5 Cross-Platform Requirements
*   **macOS**: Seatbelt sandbox policies via `sandbox-exec`.
*   **Linux**: Landlock (kernel >= 5.13) + seccomp + namespaces. Fallback to Docker.
*   **Windows**: AppContainer. Fallback to Docker/WSL when unavailable.
*   **File paths**: Use `std::path::Path` and handle Unicode normalization.
*   **File locking**: Use platform-safe atomic writes (`tempfile` + rename).

### 14.6 Testing
*   **Unit tests**: `cargo test` in each crate.
*   **Integration tests**: `tests/` directory for cross-crate scenarios.
*   **Benchmarks**: Use `criterion` for performance regression testing.
*   **CI**: All crates must pass `cargo clippy`, `cargo fmt --check`, and `cargo test` on all platforms.

### 14.7 Performance Targets

| Subsystem | Current (TS) | Target (Rust) |
|-----------|--------------|---------------|
| Sandbox startup | ~500ms (Docker) | <10ms |
| Event log write P99 | ~15ms | <5ms |
| Token counting | ~10ms/10k tokens | <1ms |
| Symbol query | ~50ms (full scan) | <5ms |

### 14.8 Feature Flags
*   Use feature flags for gradual Rust rollout: `runtime.sandbox.mode = rust|docker`.
*   Automatic fallback on unsupported platforms or missing binaries.

### 14.9 References
*   [Phase 6 Roadmap](./docs/roadmap/phase-6-rust-native/README.md)
*   [Track AD: Sandbox Sidecar](./docs/roadmap/phase-6-rust-native/track-ad-sandbox-sidecar.md)
*   [Track AE: Storage Engine](./docs/roadmap/phase-6-rust-native/track-ae-storage-engine.md)
*   [Track AF: Tokenizer](./docs/roadmap/phase-6-rust-native/track-af-tokenizer-compression.md)
*   [Track AG: LSP Indexer](./docs/roadmap/phase-6-rust-native/track-ag-lsp-indexer.md)
