# Architecture Decision Record: Migrating Desktop Shell to Tauri

**Date**: 2026-01-23
**Status**: Proposed
**Context**: The project currently uses a minimal Electron shell (`apps/desktop`) to wrap the `cowork` web application. Simultaneously, there is a strategic initiative ("Phase 6") to move compute-intensive and security-critical logic to Rust (`packages/*-rs`).

## Executive Summary

We recommend **migrating to Tauri 2.0** immediately. 

The current Electron implementation is thin (< 100 lines of logic), making migration low-cost. The project's heavy investment in Rust (16+ crates) aligns perfectly with Tauri's architecture, allowing for a strictly superior security model, drastically reduced resource footprint, and direct integration with our native accelerators without N-API overhead in the desktop context.

## 1. Comparative Analysis

### 1.1 Resource Efficiency
| Metric | Electron (Current) | Tauri (Proposed) | Impact |
|--------|-------------------|------------------|--------|
| **Bundle Size** | ~120 MB | ~10-15 MB | **~90% Reduction** |
| **Memory (Idle)** | ~180 MB | ~40 MB | **~75% Reduction** |
| **Startup Time** | Slow (Node init) | Instant (Native) | Better UX |

### 1.2 Architecture & Synergy
*   **Current (Electron)**: The desktop app runs a Node.js process. To use our high-performance components (`sandbox-rs`, `tokenizer-rs`), we rely on N-API bindings. This adds a serialization/bridge layer.
*   **Proposed (Tauri)**: The process *is* Rust. We can statically link our existing `packages/*-rs` crates directly into the app binary.
    *   **Benefit**: Zero-overhead calls between UI and core logic.
    *   **Benefit**: Simplifies the build pipeline (no `.node` file management for the desktop app).
    *   **Benefit**: Shared type definitions via robust Rust<->TS bridges.

### 1.3 Security (Critical for Agent Runtime)
The `manus/cowork` runtime executes autonomous code. Security is paramount.
*   **Electron**: Requires careful configuration (`contextIsolation`, `sandbox`, disabling `nodeIntegration`). Historically prone to misconfiguration.
*   **Tauri**: Secure by default.
    *   **Isolation**: No Node.js runtime in the webview.
    *   **IPC**: Explicit Allowlist (Permissions) for every command.
    *   **CSP**: Strict Content Security Policy injected automatically.
    *   **Origin**: capabilities to restrict API access by URL.

## 2. Technical Alignment

### 2.1 WebKit vs Chromium
Tauri uses the OS native webview (WebKit on macOS).
*   **Risk**: `apps/cowork` is currently developed tailored to Chrome (V8).
*   **Mitigation**: The app uses standard React/Vite. We likely only need minor CSS adjustments or polyfills for Safari compatibility.
*   **Validation**: We should run `apps/cowork` in Safari to verify basic functionality before committing.

### 2.2 Native Capabilities
Our spec `cowork-desktop-integration.md` requires:
1.  **File System Access**: Granting/revoking folder access.
    *   *Tauri Solution*: `fs` plugin with strict scope configuration.
2.  **Shell Execution**: Running agent commands.
    *   *Tauri Solution*: `shell` plugin. Can be wrapped securely to use our `sandbox-rs` logic directly.
3.  **Local Server**: Hosting the agent runtime.
    *   *Tauri Solution*: `sidecar` or running the server logic directly in the main Rust process (preferred for performance).

## 3. Migration Plan

Since `apps/desktop` is currently just a shell with `main.mjs` and `preload.mjs`, the migration is straightforward.

**Phase 1: Proof of Concept (Day 1)**
1.  Initialize `apps/desktop-tauri` using `cargo create-tauri-app`.
2.  Configure it to point to the local `cowork` dev server (`http://localhost:3000`).
3.  Verify the app loads and renders correctly on macOS.

**Phase 2: Core Integration**
1.  Replace `electron` IPC with Tauri Commands.
2.  Integrate `sandbox-rs` directly into the Tauri Rust backend.
3.  Set up GitHub Actions to build `.dmg`.

**Phase 3: Deprecation**
1.  Remove `apps/desktop` (Electron).
2.  Rename `apps/desktop-tauri` to `apps/desktop`.

## 4. Recommendation

**Proceed with Phase 1 immediately.**
The cost of inaction is accumulating technical debt in Electron (IPC handlers, preload scripts) that will eventually need to be rewritten in Rust anyway to meet our performance/security goals.

### Decision Matrix
*   **Go with Tauri if**: You value security, performance, and have Rust expertise (Verified: Project has significant Rust code).
*   **Stay with Electron if**: You strictly require exact Chrome behavior on all OSs or rely heavily on Node.js-only libraries in the main process that cannot be ported to Rust.

**Verdict**: **Migrate to Tauri.**
