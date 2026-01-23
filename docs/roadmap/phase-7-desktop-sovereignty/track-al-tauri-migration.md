# Track AL: Tauri Shell Migration

> **Priority**: P0
> **Status**: Ready
> **Owner**: Desktop Platform Team
> **Dependencies**: None
> **Estimated Effort**: 2 weeks

---

## Overview

Replace the existing `apps/desktop` (Electron) with a new Tauri 2.0 application. Establish the build pipeline for cross-platform distribution.

---

## Problem Definition

| Problem | Current Implementation | Impact |
| :--- | :--- | :--- |
| Large bundle size | Electron bundles Chromium (~120MB) | Slow downloads, storage |
| High memory usage | Node.js + Chromium processes | ~200MB idle |
| Node.js attack surface | `preload.mjs` with `contextBridge` | Security complexity |

---

## Deliverables

### D1: Tauri Project Scaffold
- `apps/desktop-tauri/` directory with standard Tauri 2.0 structure
- `src-tauri/Cargo.toml` linking workspace crates
- `tauri.conf.json` configured for dev and production


### D2: Rust Crate Refactoring
- Update `packages/*-rs/native/Cargo.toml` to use `crate-type = ["rlib", "cdylib"]`
- Ensure core logic is separated from N-API bindings (e.g. `lib.rs` has logic, `napi.rs` has bindings)
- Create a Cargo Workspace at `apps/desktop-tauri/src-tauri` including these paths


### D3: Production Build
- Static asset loading from `apps/cowork/dist`
- `.dmg` (macOS), `.msi` (Windows), `.deb`/`.AppImage` (Linux)

### D4: CI/CD Pipeline
- GitHub Actions workflow for Tauri builds
- Artifact signing stubs (notarization for macOS)

---

## Technical Design

### Directory Structure
```
apps/desktop-tauri/
├── src/                    # Frontend entry (if needed)
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri configuration
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   └── lib.rs          # Commands module
│   └── icons/              # App icons
├── package.json            # pnpm scripts
└── tsconfig.json           # TypeScript config (if hybrid)
```

### tauri.conf.json Key Settings
```json
{
  "productName": "KeepUp",
  "identifier": "com.keepup.desktop",
  "build": {
    "devUrl": "http://localhost:3000/en/app",
    "frontendDist": "../../apps/cowork/dist"
  },
  "app": {
    "windows": [{
      "title": "KeepUp",
      "width": 1280,
      "height": 800,
      "minWidth": 960,
      "minHeight": 640
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'"
    }
  }
}
```

---

## Implementation Plan

| Day | Deliverable | Tasks |
| :--- | :--- | :--- |
| 1 | D1 Scaffold | Run `pnpm create tauri-app`, configure workspace |
| 2 | D2 Dev Integration | Set `devUrl`, test hot-reload, add retry logic |
| 3-4 | Window Features | Menu bar, window state persistence, deep linking |
| 5-6 | D3 Production | Configure `frontendDist`, test static build |
| 7-8 | D4 CI/CD | GitHub Actions workflow, artifact uploads |
| 9-10 | Polish | Safari CSS fixes, notarization prep, documentation |

---

## Affected Code

| Path | Change Type | Description |
| :--- | :--- | :--- |
| `apps/desktop-tauri/` | **NEW** | New Tauri application |
| `apps/desktop/` | Deprecate | Mark for removal after validation |
| `.github/workflows/desktop.yml` | **NEW** | Tauri build workflow |
| `package.json` (root) | Modify | Add `tauri:dev`, `tauri:build` scripts |

---

## Acceptance Criteria

- [ ] `pnpm tauri dev` launches and displays `apps/cowork` UI
- [ ] `pnpm tauri build` produces a working `.dmg` on macOS
- [ ] Hot-reload works (change in cowork -> reflected in Tauri window)
- [ ] Window state (size, position) persists across restarts
- [ ] `cowork://` deep link opens the app (macOS)
- [ ] CI workflow builds artifacts for all 3 platforms
- [ ] Bundle size < 25MB (before signing)
- [ ] Idle memory usage < 80MB

---

## Rollout Plan

- **Feature Flag**: `DESKTOP_SHELL=tauri` environment variable
- **Week 1**: Internal team uses Tauri builds
- **Week 2**: Beta channel users opt-in
- **Week 3**: Tauri becomes default, Electron deprecated

---

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| Keep Electron | Chrome DevTools, mature | Large bundle, high memory | Rejected |
| Neutralino.js | Very small | Limited APIs, less mature | Rejected |
| Tauri 2.0 | Rust native, small, secure | WebKit differences | **Chosen** |

---

## Constraints & Risks

| Risk | Mitigation |
| :--- | :--- |
| WebKit CSS differences | Safari smoke test before merge; polyfills if needed |
| Missing Electron APIs | Map to Tauri plugins; document gaps |
| Code signing complexity | Start with unsigned dev builds; add signing in Phase 7.1 |

---

## References

- [Tauri 2.0 Documentation](https://tauri.app/start/)
- [Tauri Evaluation](../../architecture/tauri-evaluation.md)
- [Current Electron App](file:///Users/han/Documents/Code/Parallel/keep-up/apps/desktop/src/main.mjs)

---

## Commands

### Setup
```bash
# Navigate to apps directory
cd apps

# Create Tauri app
pnpm create tauri-app desktop-tauri --template vanilla-ts

# Install dependencies
cd desktop-tauri && pnpm install
```

### Development
```bash
# Start Cowork dev server first
pnpm dev:cowork

# Then start Tauri in another terminal
pnpm --filter @ku0/desktop-tauri tauri dev
```

### Build
```bash
# Build production
pnpm --filter @ku0/desktop-tauri tauri build
```

### Test
```bash
# Verify bundle size
du -sh apps/desktop-tauri/src-tauri/target/release/bundle/dmg/*.dmg

# Verify memory usage (macOS)
open apps/desktop-tauri/src-tauri/target/release/bundle/dmg/*.dmg
# Then check Activity Monitor
```
