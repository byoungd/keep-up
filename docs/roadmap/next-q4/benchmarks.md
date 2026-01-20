# Q4 KeepUpGym Extensions

Date: 2026-07-10
Owner: QA Engineer
Status: Ready
Dependencies: Q3 Track Z, packages/agent-gym
References: docs/roadmap/next-q4/acceptance-criteria.md

---

## Objective

Extend KeepUpGym to evaluate Q4 capabilities: elastic execution, visual
intelligence, and policy governance. The Q4 suites should be runnable locally
and in CI, with deterministic baselines and clear KPI mapping.

---

## Categories (Locked)

Add Q4-specific categories to GymCategory:

- `execution-scale`: scheduling, backpressure, cancellation.
- `visual-layout`: layout graph extraction and region labeling.
- `visual-diff`: visual regression detection and scoring.
- `policy-safety`: tool policy enforcement and injection defense.

This requires extending `packages/agent-gym/src/types.ts` during implementation.
Also update `packages/agent-gym/src/cli/run.ts` to include the new categories in
`ALL_CATEGORIES`.

Implementation requirements:
- Add `gym:q4:ci` script to `packages/agent-gym/package.json` that runs all Q4
  categories with `--suite easy`, `--min-score` thresholds, and baselines.
- Add Q4 baseline files under `packages/agent-gym/baselines/`.

Required `gym:q4:ci` script (package root):

```bash
tsx src/cli/run.ts --suite easy --category execution-scale --benchmarks benchmarks/q4 --baseline baselines/q4-execution-scale.json --min-score 90 --report reports/q4-execution-scale.json && \
tsx src/cli/run.ts --suite easy --category visual-layout --benchmarks benchmarks/q4 --baseline baselines/q4-visual-layout.json --min-score 90 --report reports/q4-visual-layout.json && \
tsx src/cli/run.ts --suite easy --category visual-diff --benchmarks benchmarks/q4 --baseline baselines/q4-visual-diff.json --min-score 90 --report reports/q4-visual-diff.json && \
tsx src/cli/run.ts --suite easy --category policy-safety --benchmarks benchmarks/q4 --baseline baselines/q4-policy-safety.json --min-score 95 --report reports/q4-policy-safety.json
```

---

## Suite Structure

Benchmarks live under `packages/agent-gym/benchmarks/q4/` with the same
structure as existing suites:

- `packages/agent-gym/benchmarks/q4/easy/`
- `packages/agent-gym/benchmarks/q4/medium/`
- `packages/agent-gym/benchmarks/q4/hard/`

Categories are specified in each scenario file via the `category` field.

Each scenario should include:
- Task description
- Expected outcomes
- Scoring rules (pass/fail, latency, or count thresholds)
- Artifacts to validate (logs, diffs, audit entries)

---

## Naming Conventions

Scenario IDs must follow: `q4-<category>-<index>` (example: `q4-visual-diff-001`).
File names should match the ID (`q4-visual-diff-001.yaml`).

---

## Scenario Format (Authoritative)

Scenario files are JSON-compatible YAML and must satisfy `GymScenario` in
`packages/agent-gym/src/types.ts`:

- `id`, `title`, `category`, `difficulty`, `prompt`
- `expectations[]` with at least one entry
- Optional `setup`, `script`, and `maxTurns`

---

## KPI Mapping

| Category | KPI | Target |
| --- | --- | --- |
| execution-scale | Resume latency (P95) | <1s |
| execution-scale | Task loss rate | 0% |
| visual-layout | Region detection accuracy | >95% |
| visual-diff | False positives | <1% |
| policy-safety | Unsafe command escapes | 0% |
| policy-safety | Policy latency (P95) | <10ms |

---

## Baselines and Reports

- Baselines: `packages/agent-gym/baselines/q4-<category>.json`
- Reports: `packages/agent-gym/reports/q4-<category>.json`

Baselines should be regenerated only when KPIs legitimately improve.

Retention policy:
- Keep the latest 30 reports in `packages/agent-gym/reports/`.
- Archive CI artifacts for 90 days.

---

## Min-Score Thresholds

| Category | Min Score |
| --- | --- |
| execution-scale | 90 |
| visual-layout | 90 |
| visual-diff | 90 |
| policy-safety | 95 |

---

## Commands

Local run per category (repo root):

```bash
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category execution-scale --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-execution-scale.json --min-score 90
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category visual-layout --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-visual-layout.json --min-score 90
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category visual-diff --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-visual-diff.json --min-score 90
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category policy-safety --benchmarks packages/agent-gym/benchmarks/q4 --report packages/agent-gym/reports/q4-policy-safety.json --min-score 95
```

CI gate example (repo root):

```bash
pnpm --filter @ku0/agent-gym gym:run -- --suite easy --category execution-scale --benchmarks packages/agent-gym/benchmarks/q4 --baseline packages/agent-gym/baselines/q4-execution-scale.json --min-score 90 --report packages/agent-gym/reports/q4-execution-scale.json
```

---

## CI Shortcut

From repo root:

```bash
pnpm -C packages/agent-gym gym:q4:ci
```

---

## Data Sources

- Execution-scale: synthetic task graphs and cancellation storms.
- Visual suites: UI fixtures and screenshot baselines with known diffs.
- Policy-safety: curated command injection corpus and tool alias cases.

---

## Decisions (Locked for Implementation)

- Category names above are authoritative for Q4.
- Min-score thresholds are fixed in the table above.
- Retention policy is fixed in the Baselines and Reports section.
