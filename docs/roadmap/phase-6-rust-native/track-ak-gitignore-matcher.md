# Track AK: Gitignore Matcher

> Priority: P3
> Status: Planning
> Owner: Agent Runtime Team
> Dependencies: None

---

## Overview

Implement a Rust-based file walker and gitignore matcher using the `ignore` crate (ripgrep's engine)
to accelerate file system operations in large repositories.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| --- | --- | --- |
| Slow file walking | JS recursive readdir | Latency in large repos (>10k files) |
| Inaccurate ignoring | wrapper around `node-ignore` | Inconsistencies with git behavior |
| CPU overhead | JS string matching | High CPU during workspace scans |

---

## Deliverables

### D1: Rust Ignore Library
- Fast directory traversal respecting `.gitignore`.
- Support for global gitignore and `.git/info/exclude`.
- Parallel walking options.

### D2: TypeScript Bindings
- N-API bindings.
- `listFiles(root: string): Promise<string[]>`
- `isIgnored(path: string): boolean`

---

## Cross-Platform Requirements

- Support Windows path separators.
- Handle symlink loops correctly.

---

## API Surface

```rust
pub fn list_files(root: String, options: WalkOptions) -> Result<Vec<String>>;
pub fn is_ignored(root: String, path: String) -> bool;
```

---

## Implementation Plan

| Week | Deliverable | Tasks |
| --- | --- | --- |
| 1 | Crate setup | `packages/gitignore-rs`, N-API |
| 1 | Core Logic | Integrate `ignore` crate |
| 2 | TS integration | Replace file system tools code |

---

## Affected Code

| File | Change Type |
| --- | --- |
| `packages/agent-runtime-tools/src/tools/file/fileSystem.ts` | Replace walker |
| `packages/gitignore-rs/` | New Rust crate |

---

## Acceptance Criteria

- [ ] File listing 5x faster than JS implementation.
- [ ] Perfectly matches `git check-ignore` behavior.
- [ ] Low memory footprint during walk.

---

## References

- ignore crate: https://crates.io/crates/ignore
- node-ignore: https://github.com/kaelzhang/node-ignore
