# Sandbox Platform Matrix

| Platform | Isolation | Status | Notes |
| --- | --- | --- | --- |
| macOS | Seatbelt (`sandbox-exec`) | Partial | Generates Seatbelt profiles and runs commands via `sandbox-exec`. |
| Linux | Landlock + seccomp + namespaces | Partial | Landlock enforces write access to allowed roots; seccomp blocks non-UNIX sockets when network is not `full`. |
| Windows | AppContainer | Stub | Currently returns allow decisions; fallback to Docker/WSL required. |

## Enforcement Notes
- Path normalization uses `realpath`-style canonicalization where possible.
- Allowlist network enforcement is not implemented; `allowlist` is treated as `none` for OS-level enforcement.
- Workspace isolation assumes `workingDirectory` is set; otherwise file actions are denied.
