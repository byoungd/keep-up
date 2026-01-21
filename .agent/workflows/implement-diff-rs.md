---
description: Implement Track AH - Rust Diff Engine
---

# Track AH: Rust Diff Engine Implementation

> Dependencies: None
> Estimated Time: 2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-ah-diff-engine.md`

---

## Prerequisites

Before starting, verify:
- [ ] Rust toolchain installed (`rustup show`)
- [ ] N-API dependencies available (`cargo install nj-cli`)

---

## Week 1: Crate Scaffold and Core Implementation

### Step 1.1: Initialize Cargo Project
// turbo
```bash
mkdir -p packages/diff-rs
cd packages/diff-rs
cargo init --lib
```

### Step 1.2: Add Dependencies to Cargo.toml
```toml
[package]
name = "diff-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
similar = "2"

[build-dependencies]
napi-build = "2"

[dev-dependencies]
tempfile = "3"
```

### Step 1.3: Create N-API Build Script
Create `packages/diff-rs/build.rs`:
```rust
fn main() {
    napi_build::setup();
}
```

### Step 1.4: Implement Core Diff Logic
Create `packages/diff-rs/src/lib.rs`:
```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use similar::{ChangeTag, TextDiff};

#[napi(object)]
pub struct DiffHunk {
    pub tag: String,
    pub old_start: u32,
    pub old_len: u32,
    pub new_start: u32,
    pub new_len: u32,
    pub lines: Vec<String>,
}

#[napi]
pub fn diff_lines(old: String, new: String) -> Vec<DiffHunk> {
    let diff = TextDiff::from_lines(&old, &new);
    // ... implementation
}

#[napi]
pub fn diff_unified(old: String, new: String, context: u32) -> String {
    let diff = TextDiff::from_lines(&old, &new);
    diff.unified_diff()
        .context_radius(context as usize)
        .to_string()
}
```

### Step 1.5: Verify Build
// turbo
```bash
cd packages/diff-rs && cargo build
```

---

## Week 2: TypeScript Integration

### Step 2.1: Create TypeScript Package Structure
// turbo
```bash
mkdir -p packages/diff-rs/src
```

Create `packages/diff-rs/package.json`:
```json
{
  "name": "@ku0/diff-rs",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "napi build --release && tsc"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

### Step 2.2: Create TypeScript Bindings
Create `packages/diff-rs/src/index.ts`:
```typescript
import { getNativeBinding } from './native';

export interface DiffHunk {
  tag: 'equal' | 'delete' | 'insert';
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: string[];
}

export function diffLines(oldText: string, newText: string): DiffHunk[] {
  const native = getNativeBinding();
  return native.diffLines(oldText, newText);
}

export function diffUnified(
  oldText: string,
  newText: string,
  context = 3
): string {
  const native = getNativeBinding();
  return native.diffUnified(oldText, newText, context);
}
```

### Step 2.3: Update Editor to Use Rust Diff
Update `packages/agent-runtime-tools/src/tools/code/editor.ts`:
```typescript
import { diffUnified } from '@ku0/diff-rs';

// Replace existing diff usage with:
const diff = diffUnified(original, modified, 3);
```

### Step 2.4: Build and Test
// turbo
```bash
cd packages/diff-rs && pnpm build
pnpm test --filter=@ku0/agent-runtime-tools -- --grep "editor"
```

---

## Acceptance Verification

// turbo
```bash
# 1. Benchmark diff speed
cd packages/diff-rs && cargo bench

# 2. Run unit tests
cd packages/diff-rs && cargo test

# 3. Integration test
pnpm test --filter=@ku0/agent-runtime-tools
```

Expected results:
- [ ] Diff generation < 2ms for 10k lines
- [ ] Unified diff output format correct
- [ ] Editor tests pass

---

## Rollback Plan

If issues arise:
1. Revert `packages/agent-runtime-tools/src/tools/code/editor.ts` to use JS `diff`
2. Remove `@ku0/diff-rs` from dependencies
