---
description: Implement Track AI - Rust Vector Similarity
---

# Track AI: Rust Vector Similarity Implementation

> Dependencies: None
> Estimated Time: 1 week
> Reference: `docs/roadmap/phase-6-rust-native/track-ai-vector-similarity.md`

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
mkdir -p packages/vector-similarity-rs
cd packages/vector-similarity-rs
cargo init --lib
```

### Step 1.2: Add Dependencies to Cargo.toml
```toml
[package]
name = "vector-similarity-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
simsimd = "0.1"

[build-dependencies]
napi-build = "2"

[dev-dependencies]
criterion = "0.5"
```

### Step 1.3: Create N-API Build Script
Create `packages/vector-similarity-rs/build.rs`:
```rust
fn main() {
    napi_build::setup();
}
```

### Step 1.4: Implement Core Logic
Create `packages/vector-similarity-rs/src/lib.rs`:
```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use simsimd::SpatialSimilarity;

#[napi]
pub fn cosine_similarity(a: Float32Array, b: Float32Array) -> f64 {
    let a_slice = a.as_ref();
    let b_slice = b.as_ref();
    if a_slice.len() != b_slice.len() {
        return 0.0; // Or throw error
    }
    // simsimd handles AVX2/NEON automatically
    f32::cosine(a_slice, b_slice).unwrap_or(0.0) as f64
}

#[napi]
pub fn cosine_similarity_batch(query: Float32Array, targets: Vec<Float32Array>) -> Vec<f64> {
    // ...
}
```

---

## Week 2: TypeScript Integration

### Step 2.1: Create TypeScript Package Structure
// turbo
```bash
mkdir -p packages/vector-similarity-rs/src
```

Create `packages/vector-similarity-rs/package.json`:
```json
{
  "name": "@ku0/vector-similarity-rs",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "scripts": {
    "build": "napi build --release && tsc"
  }
}
```

### Step 2.2: TypeScript Bindings
Create `packages/vector-similarity-rs/src/index.ts`.

### Step 2.3: Replace JS Implementation
Update `packages/agent-runtime-memory/src/types.ts` to use `@ku0/vector-similarity-rs` with fallback.

---

## Acceptance Verification

// turbo
```bash
# 1. Benchmark
cd packages/vector-similarity-rs && cargo bench

# 2. Integration test
pnpm test --filter=@ku0/agent-runtime-memory
```
