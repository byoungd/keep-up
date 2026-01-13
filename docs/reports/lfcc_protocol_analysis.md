# LFCC Protocol Analysis and Improvement Report

**Status:** Draft report (non-normative)  
**Scope:** Analysis and improvement recommendations for LFCC v0.9 RC without modifying the protocol text.

## 1. Executive Summary
This report analyzes LFCC v0.9 RC to surface determinism risks, interoperability gaps, and operational edge cases. It preserves the current protocol by presenting recommendations separately, so protocol changes can be reviewed and adopted explicitly.

## 2. Observed Strengths
1. **Deterministic core:** Canonicalization and BlockMapping axioms anchor the protocol to reproducible semantics.
2. **Fail-closed safety:** Preconditions, context hashes, and dry-run pipelines prevent silent drift.
3. **Negotiation discipline:** Manifest-driven negotiation enables multi-implementation interoperability without ad-hoc conditionals.

## 3. Risks and Failure Modes
1. **Frontier ambiguity:** `doc_frontier` can be interpreted as a clock, hash, or vector, causing inconsistent 409 handling.
2. **Timestamp determinism gaps:** Operation ordering depends on logical timestamps; inconsistent tie-breaking diverges outcomes.
3. **Cross-encoding drift:** UTF-16 is mandated, but import pipelines may normalize differently.
4. **Partial-policy ambiguity:** `active_partial` vs `orphan` can diverge if dirty-region scopes differ.
5. **AI payload boundary cases:** Sanitization can accept structurally valid but semantically destructive payloads.
6. **Persistence transparency:** Without a versioned storage envelope, anchors and metadata can serialize differently.
7. **Telemetry gaps:** Non-standard diagnostics reduce reproducibility in distributed debugging.

## 4. Proposed Clarifications (Non-Normative)
The following clarifications are recommended for future protocol updates:

### 4.1 Deterministic Frontier Serialization
Define `doc_frontier` as a causal version vector serialized deterministically:
```
<replica_id_1>:<counter_1>|<replica_id_2>:<counter_2>|... (sorted by replica_id)
```
If the CRDT does not expose a vector clock, derive one from causal metadata in canonical order.

### 4.2 Timestamp Ordering
Require logical timestamps to be:
1) monotonic per replica,
2) totally ordered by `(lamport_ts, replica_id)` for ties,
3) serialized as fixed-width integers or base-10 strings without locale formatting.

### 4.3 UTF-16 Normalization
Normalize external inputs to UTF-16 **before** computing anchors or hashes. Document a single normalization form (NFC recommended) and apply it consistently at all import boundaries.

### 4.4 Partial vs Orphan Transitions
Only derive `active_partial` vs `orphan` from chain policy checks, span-level anchor resolution, and manifest partial-policy rules. Avoid UI heuristics (visibility or viewport) in replicated state decisions.

### 4.5 AI Semantic Shape Checks
Extend sanitization with semantic constraints:
- list items cannot be direct children of a table cell unless schema allows,
- table rows should have consistent cell counts unless ragged rows are permitted,
- heading levels should not skip more than one level within a single AI payload (policy-controlled).

## 5. Targeted Improvements
### 5.1 Deterministic Negotiation Extensions
Recommend derived fields in the effective manifest to remove ambiguity:
```json
{
  "effective": {
    "clock_encoding": "vector_clock_v1",
    "timestamp_order": "lamport_then_replica",
    "text_normalization": "nfc_utf16"
  }
}
```

### 5.2 Storage Envelope Contract
Introduce a versioned persistence envelope:
```json
{
  "lfcc_storage_version": "1.0",
  "crdt_snapshot": "<opaque-bytes>",
  "anchors": "<opaque-bytes>",
  "annotations": "<json>",
  "manifest_id": "uuid"
}
```
This enables deterministic rehydration and mismatch detection.

### 5.3 Checkpoint Determinism
Ensure dirty-region expansion is derived solely from `touchedBlocks`, manifest neighbor radius `K`, and `txnIndex` (as a deterministic seed). Avoid viewport-based or randomized scanning in replicated verification outcomes.

### 5.4 AI Payload Guardrails
Add explicit guardrails (policy-controlled):
- **MAX-NODES:** canonicalized node count (default 50k).
- **MAX-TEXT-RUN:** maximum single text node length (default 100k UTF-16 units).
- **MAX-TABLE-CELLS:** cap total table cells (default 10k).

### 5.5 Conflict Resolution Transparency
Recommend a structured conflict report for fail-closed rejections:
```json
{
  "op_id": "uuid",
  "conflict_kind": "structural_overlap|stale_frontier|anchor_unresolved",
  "block_ids": ["..."],
  "resolution": "rejected|rebased|user_action_required"
}
```

## 6. Migration Guidance (Non-Breaking)
1. **Phase 1 (Telemetry):** add deterministic frontier serialization and conflict reports without changing behavior.
2. **Phase 2 (Enforcement):** enforce AI semantic checks and storage envelope versioning.
3. **Phase 3 (Conformance):** require derived fields in negotiation; fail-closed if absent.

## 7. Notes on Adoption
This report is intentionally separated from the protocol text to allow independent review and controlled incorporation into future LFCC revisions.
