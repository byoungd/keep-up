# Track AH: Diff Engine

> Priority: P1
> Status: Ready
> Owner: Agent Runtime Team
> Dependencies: None (can run in parallel with AD-AG)

---

## Overview

Implement a Rust-based diff engine to accelerate structural diffing for code edits, rollback
operations, and visual diff previews.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Slow diff generation | JS `diff` library | ~20ms for large files |
| High memory usage | JS object allocation | GC pressure during edits |
| Limited algorithms | Basic line diff | No syntax-aware diffing |

---

## Deliverables

### D1: Rust Diff Library
- Line-based diff (Myers algorithm).
- Unified diff format output.
- Patch application and reversal.

### D2: Syntax-Aware Diffing (Optional)
- Tree-sitter integration for AST-level diffs.
- Semantic change detection.

### D3: TypeScript Bindings
- N-API for Node runtime.
- Drop-in replacement for `diff` library.

---

## Cross-Platform Requirements

- Provide prebuilt binaries for macOS/Linux/Windows.
- No platform-specific dependencies.

---

## API Surface

```rust
pub fn diff_lines(old: &str, new: &str) -> Vec<DiffHunk>;
pub fn diff_unified(old: &str, new: &str, context: usize) -> String;
pub fn apply_patch(original: &str, patch: &str) -> Result<String>;
pub fn reverse_patch(patch: &str) -> String;
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Crate scaffold | `packages/diff-rs`, N-API setup |
| 1 | Core diff impl | Myers algorithm, unified output |
| 2 | TS integration | Replace `diff` library in editor.ts |
| 2 | Performance tuning | Benchmark against JS implementation |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime-tools/src/tools/code/editor.ts` | Call Rust differ |
| `packages/diff-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] Diff generation < 2ms for 10k line files.
- [ ] Unified diff output matches `diff` library format.
- [ ] Patch apply/reverse round-trips correctly.
- [ ] Memory usage 50% lower than JS implementation.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Edge cases in patch format | Comprehensive test suite |
| Unicode handling | Use Rust's native Unicode support |

---

## References

- Current impl: `packages/agent-runtime-tools/src/tools/code/editor.ts`
- similar crate: https://crates.io/crates/similar
- diffy crate: https://crates.io/crates/diffy
