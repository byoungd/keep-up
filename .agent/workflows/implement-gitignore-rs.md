---
description: Implement Track AK - Rust Gitignore Matcher
---

# Track AK: Rust Gitignore Matcher Implementation

> Dependencies: None
> Estimated Time: 1 week
> Reference: `docs/roadmap/phase-6-rust-native/track-ak-gitignore-matcher.md`

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
mkdir -p packages/gitignore-rs
cd packages/gitignore-rs
cargo init --lib
```

### Step 1.2: Add Dependencies to Cargo.toml
```toml
[package]
name = "gitignore-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
ignore = "0.4"
walkdir = "2"

[build-dependencies]
napi-build = "2"
```

### Step 1.3: Create N-API Build Script
Create `packages/gitignore-rs/build.rs`:
```rust
fn main() {
    napi_build::setup();
}
```

### Step 1.4: Implement Core Logic
Create `packages/gitignore-rs/src/lib.rs`:
```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use ignore::WalkBuilder;

#[napi]
pub fn list_files(root: String) -> Result<Vec<String>> {
    let mut files = Vec::new();
    for result in WalkBuilder::new(&root).hidden(false).git_ignore(true).build() {
        match result {
            Ok(entry) => {
                if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    files.push(entry.path().to_string_lossy().to_string());
                }
            }
            Err(err) => return Err(Error::new(Status::GenericFailure, err.to_string())),
        }
    }
    Ok(files)
}
```

---

## Week 2: TypeScript Integration

### Step 2.1: Create TypeScript Package
// turbo
```bash
mkdir -p packages/gitignore-rs/src
```

Create `packages/gitignore-rs/package.json`.

### Step 2.2: TypeScript Bindings
Create `packages/gitignore-rs/src/index.ts`.

### Step 2.3: Integration Test
Test with `packages/agent-runtime-tools/src/tools/file/fileSystem.ts`.

---

## Acceptance Verification

// turbo
```bash
# 1. Benchmark
cd packages/gitignore-rs && cargo bench
```
