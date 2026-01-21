---
description: Implement Track AD - Rust Sandbox Sidecar
---

# Track AD: Rust Sandbox Sidecar Implementation

> Dependencies: None
> Estimated Time: 4 weeks
> Reference: `docs/roadmap/phase-6-rust-native/track-ad-sandbox-sidecar.md`

---

## Prerequisites

Before starting, verify:
- [ ] Rust toolchain installed (`rustup show`)
- [ ] N-API dependencies available (`cargo install nj-cli`)
- [ ] Access to codex-rs reference code (`.tmp/analysis/codex/codex-rs/`)

---

## Week 1: Feasibility Assessment

### Step 1.1: Analyze Codex Sandbox Implementation
```bash
# Review Seatbelt implementation
cat .tmp/analysis/codex/codex-rs/core/src/seatbelt.rs

# Review Landlock implementation
cat .tmp/analysis/codex/codex-rs/core/src/landlock.rs
```

### Step 1.2: Define API Contract
Create `packages/sandbox-rs/src/lib.rs` with:
```rust
// Core trait for sandbox operations
pub trait SandboxPolicy {
    fn evaluate_file_action(&self, path: &Path, intent: ActionIntent) -> Decision;
    fn execute(&self, cmd: &str, args: &[&str], policy: &Policy) -> Result<Output>;
    fn read(&self, path: &Path) -> Result<Vec<u8>>;
    fn write(&self, path: &Path, data: &[u8]) -> Result<()>;
    fn list(&self, path: &Path) -> Result<Vec<PathBuf>>;
}

pub enum Decision {
    Allow,
    Deny(String),
    NeedsConfirmation(String),
}
```

### Step 1.3: Document Platform Matrix
// turbo
```bash
mkdir -p packages/sandbox-rs/docs
```

Create `packages/sandbox-rs/docs/platform-matrix.md` with isolation strategies per OS.

---

## Week 2: Rust Crate Scaffold

### Step 2.1: Initialize Cargo Project
// turbo
```bash
mkdir -p packages/sandbox-rs
cd packages/sandbox-rs
cargo init --lib
```

### Step 2.2: Add Dependencies to Cargo.toml
```toml
[package]
name = "sandbox-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
libc = "0.2"
thiserror = "1"

[build-dependencies]
napi-build = "2"

[target.'cfg(target_os = "macos")'.dependencies]
sandbox_exec = "0.1"

[target.'cfg(target_os = "linux")'.dependencies]
landlock = "0.3"
seccompiler = "0.4"
```

### Step 2.3: Create N-API Build Script
Create `packages/sandbox-rs/build.rs`:
```rust
fn main() {
    napi_build::setup();
}
```

### Step 2.4: Verify Build
// turbo
```bash
cd packages/sandbox-rs && cargo build
```

---

## Week 3: OS Policy Implementation

### Step 3.1: Implement macOS Seatbelt
Create `packages/sandbox-rs/src/macos.rs`:
- Copy and adapt from `.tmp/analysis/codex/codex-rs/core/src/seatbelt.rs`
- Implement `sandbox-exec` profile generation
- Add path normalization with `realpath`

### Step 3.2: Implement Linux Landlock + Seccomp
Create `packages/sandbox-rs/src/linux.rs`:
- Copy and adapt from `.tmp/analysis/codex/codex-rs/core/src/landlock.rs`
- Add seccomp filter for system call restriction
- Implement namespace isolation

### Step 3.3: Implement Windows AppContainer (Stub)
Create `packages/sandbox-rs/src/windows.rs`:
- Stub implementation returning `Decision::Allow` with warning
- Document fallback to Docker/WSL

### Step 3.4: Path Security Module
Create `packages/sandbox-rs/src/path_security.rs`:
```rust
pub fn normalize_path(path: &Path) -> Result<PathBuf> {
    // 1. Resolve to absolute path
    // 2. Call realpath to resolve symlinks
    // 3. Validate no path escape
    // 4. Validate symlink targets
}
```

### Step 3.5: Run Tests
// turbo
```bash
cd packages/sandbox-rs && cargo test
```

---

## Week 4: TypeScript Integration

### Step 4.1: Create TypeScript Package
// turbo
```bash
mkdir -p packages/sandbox-rs/npm
```

Create `packages/sandbox-rs/npm/package.json`:
```json
{
  "name": "@ku0/sandbox-rs",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": {
    "name": "sandbox-rs",
    "triples": {
      "defaults": true,
      "additional": ["aarch64-apple-darwin"]
    }
  }
}
```

### Step 4.2: Create TypeScript Bindings
Create `packages/sandbox-rs/npm/index.ts`:
```typescript
import { native } from './native';

export interface SandboxPolicy {
  evaluateFileAction(path: string, intent: string): Decision;
  execute(cmd: string, args: string[], policy: Policy): Promise<ExecResult>;
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer): Promise<void>;
  list(path: string): Promise<string[]>;
}

export function createSandbox(config: SandboxConfig): SandboxPolicy {
  return native.createSandbox(config);
}
```

### Step 4.3: Add Feature Flag
Update `packages/agent-runtime/src/sandbox/index.ts`:
```typescript
import { createSandbox as createRustSandbox } from '@ku0/sandbox-rs';
import { DockerSandbox } from './dockerSandbox';

export function createSandbox(config: SandboxConfig): Sandbox {
  if (config.mode === 'rust') {
    return createRustSandbox(config);
  }
  return new DockerSandbox(config);
}
```

### Step 4.4: Build and Test Integration
// turbo
```bash
cd packages/sandbox-rs && npm run build
pnpm test --filter=@ku0/agent-runtime
```

---

## Acceptance Verification

Run these commands to verify completion:

// turbo
```bash
# 1. Startup time benchmark
cd packages/sandbox-rs && cargo bench startup

# 2. Path escape tests
cd packages/sandbox-rs && cargo test path_security

# 3. Platform CI (local)
cd packages/sandbox-rs && cargo test --all-features

# 4. Integration test
pnpm test --filter=@ku0/agent-runtime -- --grep "sandbox"
```

Expected results:
- [ ] Sandbox startup time < 10ms
- [ ] All symlink escape tests pass
- [ ] macOS/Linux tests pass
- [ ] TypeScript integration tests pass

---

## Rollback Plan

If issues arise:
1. Set `runtime.sandbox.mode = docker` in config
2. Remove `@ku0/sandbox-rs` from agent-runtime dependencies
3. Revert changes to `packages/agent-runtime/src/sandbox/index.ts`
