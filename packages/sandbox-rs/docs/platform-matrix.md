# Sandbox Platform Matrix

| Platform | Isolation | Status | Notes |
| --- | --- | --- | --- |
| macOS | Seatbelt (`sandbox-exec`) | Stub | Generates Seatbelt profiles and runs commands via `sandbox-exec`. |
| Linux | Landlock + seccomp + namespaces | Stub | Landlock/sccomp hooks are placeholders pending full enforcement. |
| Windows | AppContainer | Stub (fail-closed) | Restricted policies return an error so callers can fall back to Docker/WSL. |

## Enforcement Notes
- Path normalization uses `realpath`-style canonicalization where possible.
- Allowlist network enforcement is not implemented; treat `allowlist` as `none` until policy support lands.
- Workspace isolation assumes `workingDirectory` is set; otherwise file actions are denied.
- Windows restricted sandbox configs fail fast to avoid unsafe execution.
