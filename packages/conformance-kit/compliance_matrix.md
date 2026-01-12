# LFCC v0.9 RC Conformance Compliance Matrix

**Version:** 0.9.0  
**Date:** 2026-01-01  
**Status:** Active

---

## Compliance Levels

| Level | Symbol | Description |
|-------|--------|-------------|
| **REQUIRED** | 🔴 | Must pass to claim "LFCC v0.9 Compliant" |
| **RECOMMENDED** | 🟡 | Should pass for production deployment |
| **OPTIONAL** | 🟢 | For advanced features and extensions |

---

## 1. Core Protocol Features

### 1.1 BlockMapping Axioms (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `BM-DET-001` | BlockMapping is deterministic for identical inputs | 🔴 REQUIRED |
| `BM-LOC-001` | BlockMapping satisfies locality (bounded distance) | 🔴 REQUIRED |
| `BM-MON-001` | BlockMapping satisfies monotonicity (position ordering) | 🔴 REQUIRED |
| `BM-COV-001` | BlockMapping provides full coverage for KEEP-ID edits | 🔴 REQUIRED |

### 1.2 Deterministic Negotiation (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `NEG-DET-001` | `negotiate()` is deterministic for identical inputs | 🔴 REQUIRED |
| `NEG-COM-001` | `negotiate()` is commutative (order-independent) | 🔴 REQUIRED |
| `NEG-REJ-001` | Mismatched critical fields cause hard rejection | 🔴 REQUIRED |
| `NEG-INT-001` | Capabilities are correctly intersected | 🔴 REQUIRED |
| `NEG-CHN-001` | Chain policy resolves to most restrictive | 🔴 REQUIRED |

### 1.3 Anchor Integrity (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `ANC-ENC-001` | `encodeAnchor()` includes checksum | 🔴 REQUIRED |
| `ANC-DEC-001` | `decodeAnchor()` validates checksum | 🔴 REQUIRED |
| `ANC-DEC-002` | `decodeAnchor()` returns null on checksum mismatch | 🔴 REQUIRED |
| `ANC-RND-001` | Encode/decode roundtrip preserves data | 🔴 REQUIRED |

### 1.4 Canonicalizer (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `CAN-DET-001` | Canonicalizer is deterministic | 🔴 REQUIRED |
| `CAN-ATTR-001` | Only `link` marks may have `href` attribute | 🔴 REQUIRED |
| `CAN-URL-001` | `href` enforces URL policy (http/https/mailto) | 🔴 REQUIRED |
| `CAN-STRIP-001` | Invalid attributes are stripped with diagnostics | 🔴 REQUIRED |

---

## 2. Security Features

### 2.1 AI Sanitization (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `AI-LIM-001` | Enforces `max_payload_bytes` limit | 🔴 REQUIRED |
| `AI-LIM-002` | Enforces `max_nesting_depth` limit | 🔴 REQUIRED |
| `AI-LIM-003` | Enforces `max_attribute_count` limit | 🔴 REQUIRED |
| `AI-SAN-001` | Sanitizer rejects malicious payloads | 🔴 REQUIRED |

### 2.2 Relocation Security (RECOMMENDED 🟡)

| Test ID | Description | Level |
|---------|-------------|-------|
| `REL-LVL-001` | Relocation respects level boundaries | 🟡 RECOMMENDED |
| `REL-CONF-001` | Level 2/3 relocations require confirmation | 🟡 RECOMMENDED |

---

## 3. Integrity Verification

### 3.1 Checkpoint Verification (REQUIRED 🔴)

| Test ID | Description | Level |
|---------|-------------|-------|
| `CHK-DET-001` | Checkpoint verification is deterministic | 🔴 REQUIRED |
| `CHK-CTX-001` | Context hash validates span integrity | 🔴 REQUIRED |

### 3.2 Divergence Detection (RECOMMENDED 🟡)

| Test ID | Description | Level |
|---------|-------------|-------|
| `DIV-DET-001` | Shadow-editor divergence is detected | 🟡 RECOMMENDED |
| `DIV-REC-001` | Recovery strategy handles divergence | 🟡 RECOMMENDED |

---

## 4. Edge Cases (RECOMMENDED 🟡)

| Test ID | Description | Level |
|---------|-------------|-------|
| `EDGE-EMPTY-001` | Empty document handled correctly | 🟡 RECOMMENDED |
| `EDGE-SINGLE-001` | Single character document handled | 🟡 RECOMMENDED |
| `EDGE-SURR-001` | UTF-16 surrogate pairs handled | 🔴 REQUIRED |
| `EDGE-DIRTY-001` | DirtyInfo covers modified ranges | 🟡 RECOMMENDED |

---

## 5. Performance (RECOMMENDED 🟡)

| Test ID | Description | Level |
|---------|-------------|-------|
| `PERF-BM-001` | BlockMapping <10ms for 10k blocks | 🟡 RECOMMENDED |
| `PERF-NEG-001` | Negotiation <5ms for 3 manifests | 🟡 RECOMMENDED |

---

## 6. Fuzzing Survival (OPTIONAL 🟢)

| Test ID | Description | Level |
|---------|-------------|-------|
| `FUZZ-ANC-001` | Anchor decode survives random input | 🟢 OPTIONAL |
| `FUZZ-CAN-001` | Canonicalizer survives malformed docs | 🟢 OPTIONAL |
| `FUZZ-NEG-001` | Negotiation survives malformed manifests | 🟢 OPTIONAL |

---

## Compliance Certification

### Minimum Requirements for "LFCC v0.9 Compliant"

1. **All 🔴 REQUIRED tests must pass** (28 tests)
2. No crashes or panics on any input (fail-closed is acceptable)
3. Determinism verified via property-based testing (≥50 runs)

### Production Deployment Recommendation

1. All 🔴 REQUIRED tests pass
2. All 🟡 RECOMMENDED tests pass
3. Performance targets met

---

## Test Execution

```bash
# Run all required tests
pnpm test:conformance --level=required

# Run all tests (required + recommended + optional)
pnpm test:conformance --level=all

# Generate compliance report
pnpm test:conformance --report
```
