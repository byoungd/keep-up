# Phase 6 Sandbox Policy Matrix

Date: 2026-01-24
Owner: Agent Runtime Team
Status: Active

## Runtime Policy Profiles

| Security Preset | Sandbox Config | Rust Policy Profile | Notes |
| --- | --- | --- | --- |
| safe | `type=rust`, `network=none`, `fs=workspace` | `STRICT_POLICY` | Default for restricted tasks. |
| balanced | `type=rust`, `network=allowlist`, `fs=workspace` | `WORKSPACE_POLICY` | Default for Cowork runtime. |
| power | `type=none`, `network=full`, `fs=none` | N/A | Sandbox disabled unless explicitly forced. |
| developer | `type=none`, `network=full`, `fs=none` | N/A | Sandbox disabled unless explicitly forced. |

## Rust Policy Profiles (sandbox-rs)

| Profile | Filesystem | Network | Commands |
| --- | --- | --- | --- |
| `STRICT_POLICY` | workspace read, blocked sensitive paths, no symlinks/hidden files | disabled | whitelist only |
| `WORKSPACE_POLICY` | workspace read/write, allow symlinks + hidden files | allowlist domains | blacklist dangerous commands |

## OS Enforcement Matrix

| OS | Filesystem Isolation | Network Isolation | Notes |
| --- | --- | --- | --- |
| macOS | Seatbelt profiles | Seatbelt network filters | Uses `seatbelt_*.sbpl` policies. |
| Linux | Landlock + seccomp + namespaces | seccomp + allowlist checks | Requires kernel support (Landlock >= 5.13). |
| Windows | AppContainer | AppContainer network rules | Fallback to Docker/WSL when unavailable. |

## Fallback Rules
- If Rust sandbox binding is unavailable, fall back to Docker (if available).
- If Docker is unavailable, fall back to process execution with permission checks.

## References
- `packages/sandbox-rs/src/policies/index.ts`
- `docs/roadmap/phase-6-rust-native/track-ad-sandbox-sidecar.md`
