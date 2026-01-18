# Fuzzing Strategy and Bug Reproduction — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2026-01-01  
**Audience:** QA engineers, SDET, platform verification.  
**Source of truth:** LFCC v0.9 RC §13 (Conformance), §1 (QA Conformance Kit)

---

## 0. Purpose

This guide specifies fuzzing strategy, seed management, and bug reproduction procedures for LFCC conformance testing.

---

## 1. Fuzzing Targets

### 1.1 Primary Targets

1. **Determinism:** Same operations → same results
2. **Convergence:** All replicas converge to same state
3. **Annotation Integrity:** No silent drift
4. **BlockMapping Correctness:** Axioms hold
5. **Canonicalization:** Deterministic output

### 1.2 Coverage Goals

- **Operation Coverage:** All operation types tested
- **Structure Coverage:** Nested structures (lists, tables, quotes)
- **Edge Case Coverage:** Empty docs, single chars, limits
- **Concurrency Coverage:** Concurrent operations, interleavings

---

## 2. Seed Management

### 2.1 Seed Generation

**Deterministic Seeds:**
- Base seed: Commit hash + test index
- Reproducible across runs
- Stored with test results

```typescript
function generateSeed(commitHash: string, testIndex: number): number {
  // Combine commit hash and test index deterministically
  const hash = crypto.createHash('sha256')
    .update(commitHash + testIndex.toString())
    .digest();
  return hash.readUInt32BE(0);
}
```

### 2.2 Seed Corpus

**Golden Fixtures:**
- Store failing seeds as golden fixtures
- Include: seed, operations, expected vs actual results
- Version controlled for regression testing

**Seed Corpus Management:**
- Maintain corpus of interesting seeds
- Add seeds that trigger edge cases
- Remove seeds that no longer fail (fixed bugs)

---

## 3. Bug Reproduction

### 3.1 Reproduction Workflow

1. **Capture Failure:**
   - Seed value
   - Operation sequence
   - Expected vs actual results
   - Environment information

2. **Minimize Test Case:**
   - Use delta debugging
   - Remove unnecessary operations
   - Simplify parameters

3. **Create Reproducible Test:**
   - Fixed seed
   - Minimal operation sequence
   - Clear assertions

### 3.2 Minimization Tools

**Delta Debugging:**
- Remove operation ranges
- Simplify parameters
- Reduce document size

**Parameter Simplification:**
- Shorter text
- Smaller spans
- Fewer blocks

### 3.3 Artifact Capture + Replay

Capture a repro artifact when a SEC run fails:
```bash
pnpm tsx scripts/lfcc-fuzz-run.ts --iterations 50 --ops 200 --scenario long-partition --out artifacts/fuzz
```

Replay from a saved artifact JSON (or a directory containing artifacts):
```bash
pnpm tsx scripts/lfcc-fuzz-replay.ts --path artifacts/fuzz/lfcc-fuzz-repro-<timestamp>-long-partition-12345.json
```

---

## 4. Automated Fuzzing in CI

### 4.1 CI Integration

**Fast Gate (PR-blocking):**
- 50 seeds × 200 steps
- Checkpoint every 10 ops
- Moderate structure operations
- Timeout: 5 minutes
- Deterministic seed derived from commit hash (override with `FUZZ_GATE_SEED`)

**Nightly Stress:**
- 500 seeds × 2000 steps
- Heavy structure operations
- Large paste operations
- Timeout: 30 minutes
- Randomized seeds (`FUZZ_GATE_RANDOM_SEED=1`), artifacts retained on failure

For detailed CI seed policy and examples, see `docs/fuzz/ci-seed-policy.md`.

### 4.2 Failure Handling

**On Failure:**
1. Save seed and operations
2. Generate minimal test case
3. Create bug report
4. Block PR (if in fast gate)

---

## 5. Bug Report Template

```typescript
interface BugReport {
  seed: number;
  operations: Operation[];
  expected: CanonNode;
  actual: CanonNode;
  diff: string;
  environment: {
    platform: string;
    version: string;
    commit: string;
  };
  minimized: boolean;
  minimalOperations?: Operation[];
}
```

---

## 6. Implementation Checklist

- [x] Set up fuzzing framework
- [x] Implement seed generation
- [x] Implement seed corpus management
- [ ] Add minimization tools
- [x] Integrate with CI (`scripts/fuzz-gate.sh`)
- [x] Add replay command for fuzz artifacts
- [ ] Set up bug report generation
- [x] Document reproduction procedures

---

## 7. References

- **LFCC Protocol:** §13 Conformance Gates
- **LFCC Protocol:** §1 QA Conformance Kit

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01
