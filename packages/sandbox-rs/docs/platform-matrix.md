# Sandbox Platform Matrix

| Platform | Isolation | Status | Notes |
| --- | --- | --- | --- |
| macOS | Seatbelt (`sandbox-exec`) | Stub | Generates Seatbelt profiles and runs commands via `sandbox-exec`. |
| Linux | Landlock + seccomp + namespaces | Stub | Landlock/sccomp hooks are placeholders pending full enforcement. |
| Windows | AppContainer | Stub | Currently returns allow decisions; fallback to Docker/WSL required. |

## Enforcement Notes
- Path normalization uses `realpath`-style canonicalization where possible.
- Allowlist network enforcement is not implemented; treat `allowlist` as `none` until policy support lands.
- Workspace isolation assumes `workingDirectory` is set; otherwise file actions are denied.
