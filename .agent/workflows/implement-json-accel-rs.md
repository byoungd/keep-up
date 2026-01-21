---
description: Implement Track AJ - Rust JSON Acceleration
---

# Track AJ: Rust JSON Acceleration Implementation

> Dependencies: None
> Estimated Time: 2 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-aj-json-acceleration.md`

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
mkdir -p packages/json-accel-rs
cd packages/json-accel-rs
cargo init --lib
```

### Step 1.2: Add Dependencies to Cargo.toml
```toml
[package]
name = "json-accel-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async", "serde-json"] }
napi-derive = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
simd-json = "0.13"

[build-dependencies]
napi-build = "2"

[dev-dependencies]
criterion = "0.5"
```

### Step 1.3: Create N-API Build Script
Create `packages/json-accel-rs/build.rs`:
```rust
fn main() {
    napi_build::setup();
}
```

### Step 1.4: Implement Core Logic
Create `packages/json-accel-rs/src/lib.rs`:
```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
// Note: simd-json requires unsafe for string extraction, ensure safety checks

#[napi]
pub fn fast_stringify(value: serde_json::Value) -> Result<String> {
    // simd-json implementation
    // fallback to serde_json if error
    serde_json::to_string(&value).map_err(|e| Error::new(Status::GenericFailure, e.to_string()))
}
```

---

## Week 2: TypeScript Integration

### Step 2.1: Create TypeScript Package
// turbo
```bash
mkdir -p packages/json-accel-rs/src
```

Create `packages/json-accel-rs/package.json`.

### Step 2.2: TypeScript Bindings
Create `packages/json-accel-rs/src/index.ts`.

### Step 2.3: Integration Test
Test with `packages/agent-runtime/src/utils/cache.ts`.

---

## Acceptance Verification

// turbo
```bash
# 1. Benchmark
cd packages/json-accel-rs && cargo bench
```
