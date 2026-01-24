# Phase 6 Rollout Plan and Feature Flags

Date: 2026-01-24
Owner: Agent Runtime Team
Status: Active

## Feature Flags

| Flag | Values | Default | Purpose |
| --- | --- | --- | --- |
| `COWORK_SANDBOX_MODE` | `auto`  `rust`  `docker`  `process` | `auto` | Select sandbox backend (rust preferred when available). |
| `TOKENIZER_RS_DISABLE_NATIVE` | `1` to disable | unset | Force JS fallback for tokenizer/compressor. |
| `TOKENIZER_RS_NATIVE_PATH` | path | unset | Override tokenizer native binding path. |
| `KU0_STORAGE_ENGINE_RS_NATIVE_PATH` | path | unset | Override storage engine binding path. |
| `KU0_SYMBOL_INDEX_DISABLE_NATIVE` | `1` to disable | unset | Force JS fallback for symbol index. |
| `KU0_SYMBOL_INDEX_NATIVE_PATH` | path | unset | Override symbol index binding path. |
| `KU0_DIFF_RS_DISABLE_NATIVE` | `1` to disable | unset | Force JS fallback for diff. |
| `KU0_DIFF_RS_NATIVE_PATH` | path | unset | Override diff binding path. |
| `KU0_VECTOR_SIMILARITY_DISABLE_NATIVE` | `1` to disable | unset | Force JS fallback for vector similarity. |
| `KU0_VECTOR_SIMILARITY_NATIVE_PATH` | path | unset | Override vector similarity binding path. |
| `JSON_ACCEL_RS_NATIVE_PATH` | path | unset | Override json-accel binding path. |
| `SANDBOX_RS_BINDING_PATH` | path | unset | Override sandbox binding path. |

## Rollout Phases
1) Local opt-in
- Enable `COWORK_SANDBOX_MODE=rust` in dev.
- Verify tool execution + sandbox audits.

2) CI + perf gating
- Capture `pnpm perf:metrics` baseline.
- Use `pnpm perf:gate` against stored baselines for regressions.

3) Dogfood cohort
- Enable rust sandbox for internal users.
- Monitor fallback logs and policy violations.

4) Default enablement
- Keep `COWORK_SANDBOX_MODE=auto` with rust preferred, docker fallback.
- Retain per-crate disable flags for quick rollback.

## Observability Checklist
- Capture perf metrics (`artifacts/perf-metrics.json`).
- Monitor sandbox violations and fallback counts.
- Track tool execution latency and error rates.

## References
- `docs/roadmap/phase-6-rust-native/native-binding-strategy.md`
