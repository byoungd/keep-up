# KeepUpGym

KeepUpGym runs deterministic agent benchmarks and scores the results for CI gating.

## Commands

- `pnpm --filter @ku0/agent-gym gym:run -- --suite easy`
- `pnpm --filter @ku0/agent-gym gym:ci`

Reports are written to `packages/agent-gym/reports/latest.json`.

## Benchmarks

Scenario files live in `packages/agent-gym/benchmarks/` and are JSON-compatible YAML
(plain JSON stored with a `.yaml` extension for deterministic parsing).

## External Benchmarks

Import SWE-bench JSONL into a normalized suite:

```
pnpm --filter @ku0/agent-gym gym:swe:import -- --input /path/to/swe-bench.jsonl --output reports/swe-bench.json
```

Run SWE-bench tasks directly via the adapter:

```
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --adapter swe-bench --benchmarks /path/to/swe-bench.jsonl --adapter-default-category cross-file --adapter-default-difficulty hard
```
