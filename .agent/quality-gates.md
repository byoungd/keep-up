# Quality Gates Framework

> Linear-level quality through automated gates, agent collaboration, and strict standards.

## Project: Keep-Up

This framework applies to the Keep-Up monorepo (`@ku0/*`, `@ku0/*` packages).

## Overview

This framework defines the quality gates that protect product quality as features grow. Every code change must pass through these gates before merging.

---

## Gate Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                     RELEASE GATE (Manual)                       │
│  Full E2E + Performance + Visual Regression + Security Audit    │
├─────────────────────────────────────────────────────────────────┤
│                      PR GATE (CI Required)                      │
│  Lint + Type + Unit + Category E2E + UI Gate                    │
├─────────────────────────────────────────────────────────────────┤
│                    COMMIT GATE (Pre-commit)                     │
│  Biome Format + Lint-staged + Type-aware Lint                   │
├─────────────────────────────────────────────────────────────────┤
│                   AGENT GATE (Before Code)                      │
│  Plan Review + Architecture Check + Standard Compliance         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Gate 1: Agent Gate (Pre-Implementation)

**Trigger**: Before any code is written

### 1.1 Architecture Review
- [ ] Read relevant spec documents in `docs/product/`
- [ ] Check LFCC compliance requirements
- [ ] Verify no duplicate implementations exist
- [ ] Confirm pattern alignment with existing code

### 1.2 Plan Validation
- [ ] `implementation_plan.md` created and reviewed
- [ ] Breaking changes identified and documented
- [ ] Migration path defined for data changes
- [ ] Performance impact assessed

### 1.3 Standard Compliance Check
- [ ] Verify against `CODING_STANDARDS.md`
- [ ] Check CRDT standard (Loro only)
- [ ] Confirm accessibility requirements
- [ ] Review security implications

---

## Gate 2: Commit Gate (Pre-commit Hook)

**Trigger**: `git commit`

### Automated Checks (via Husky + lint-staged)
```bash
# .husky/pre-commit
pnpm biome check --write --staged
pnpm lint-staged
```

### lint-staged Configuration
```json
{
  "*.{ts,tsx}": [
    "biome check --write",
    "biome format --write"
  ],
  "*.{json,md}": [
    "biome format --write"
  ]
}
```

### Zero-Tolerance Rules
| Rule | Severity | Action |
|------|----------|--------|
| `noExplicitAny` | ERROR | Block commit |
| `noUnusedVariables` | ERROR | Block commit |
| `noUnusedImports` | ERROR | Block commit |
| `useConst` | ERROR | Block commit |
| `button type` | ERROR | Block commit |
| `aria-label` (icon buttons) | ERROR | Block commit |

---

## Gate 3: PR Gate (CI Required)

**Trigger**: Pull Request opened/updated

### 3.1 Static Analysis (Parallel)
```yaml
jobs:
  lint:
    - biome check
    - format:check

  typecheck:
    - tsc --noEmit (all packages)

  build:
    - turbo build
```

### 3.2 Unit Tests
```yaml
test:
  - vitest run --coverage
  - coverage threshold: 70% (core), 50% (ui)
```

### 3.3 Test Strategy

| Focus | Approach |
|-------|----------|
| Unit Logic | `vitest run` |
| UI Components | Component Tests (Vitest) |
| Integration | `scripts/ui-gate.sh` (mocked backend) |

### 3.4 UI Integration Gate
```bash
bash scripts/ui-gate.sh
# Runs: Unit + Playwright critical path + Conformance (optional)
```

### 3.5 Core Package Gate
```bash
# For changes to packages/core
pnpm --filter @ku0/core test
# Pack validation (no __tests__ in dist)
```

---

## Gate 4: Release Gate (Manual)

**Trigger**: Before release/tag

### 4.1 Release Testing
```bash
pnpm test:unit:ci
# Full E2E suite is on apps/reader branch
```

### 4.2 Performance Gate
```bash
pnpm perf:gate
# Compare against baseline, fail if >10% regression
```

### 4.3 Visual Regression
```bash
pnpm test:visual
# Compare screenshots against baseline
```

### 4.4 Security Checklist
- [ ] No new dependencies with known vulnerabilities
- [ ] No secrets in code
- [ ] No XSS vectors in AI output handling
- [ ] No SQL injection in queries

### 4.5 Accessibility Audit
- [ ] axe-core scan passes
- [ ] Keyboard navigation verified
- [ ] Screen reader tested (VoiceOver/NVDA)

---

## Quality Metrics

### Coverage Thresholds
| Package | Min Coverage | Target |
|---------|-------------|--------|
| `packages/core` | 70% | 85% |
| `packages/lfcc-bridge` | 60% | 75% |
| `apps/cowork` | 30% | 50% |

### Performance Budgets
| Metric | Budget | Critical |
|--------|--------|----------|
| FCP | < 1.5s | < 2.0s |
| LCP | < 2.5s | < 3.0s |
| TTI | < 3.5s | < 5.0s |
| Bundle Size (main) | < 500KB | < 750KB |

### Complexity Limits
| Metric | Limit |
|--------|-------|
| Cognitive Complexity | ≤ 15 per function |
| File Length | ≤ 400 lines |
| Function Parameters | ≤ 5 |
| Nesting Depth | ≤ 4 levels |

---

## Enforcement

### CI Configuration
All gates are enforced in `.github/workflows/ci.yml`:
- `lint` job: Format + Lint
- `typecheck` job: TypeScript validation
- `build` job: Build verification
- `test` job: Unit + E2E
- `core_release_gate` job: Core package validation
- `ui_gate` job: UI integration validation

### Branch Protection
```yaml
main:
  required_status_checks:
    - lint
    - typecheck
    - build
    - test
    - ui_gate
  required_reviews: 1
  dismiss_stale_reviews: true
```

---

## Escalation Path

### Gate Failure Resolution

1. **Commit Gate Failure**
   - Fix locally with `pnpm lint:fix`
   - Re-run `pnpm biome check --write`

2. **PR Gate Failure**
   - Check CI logs for specific failure
   - Run targeted tests locally: `pnpm test:unit`
   - Reproduce with: unit test watch mode

3. **Release Gate Failure**
   - Performance: Run `pnpm perf:baseline` to update baseline if justified
   - Visual: Update snapshots with `pnpm test:visual:update` if intentional
   - Release: Ensure unit/integration tests pass on main branch

### Override Policy
- **Never bypass** commit hooks without Tech Lead approval
- **Emergency hotfix**: Tag with `[HOTFIX]`, require 2 reviewers
- **Gate exceptions**: Document in PR, require architect sign-off
