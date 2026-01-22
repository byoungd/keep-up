# LFCC v0.9.4 - AI Targeting Resilience Proposal

**Status:** Draft Proposal (Extension-only)  
**Author:** Keep-Up Team  
**Created:** 2026-01-22  
**Target Version:** LFCC v0.9.4 (Optional Extension)  
**Prerequisite:** LFCC v0.9 RC, LFCC v0.9.1 AI-native  
**Goal:** Reduce AI agent targeting failures and retry loops by extending preconditions with multi-signal anchors and deterministic relocation, without weakening LFCC SEC or fail-closed guarantees.

**See also:**
- `docs/specs/lfcc/LFCC_v0.9_RC.md` (§11 AI Gateway + Dry-Run)
- `docs/specs/lfcc/engineering/06_AI_Envelope_Specification.md`
- `docs/specs/lfcc/engineering/11_Dirty_Region_and_Neighbor_Expansion.md`
- `docs/specs/lfcc/engineering/18_Security_Best_Practices.md`

---

## Executive Summary

AI Gateway preconditions in v0.9 are intentionally strict: `doc_frontier` + `if_match_context_hash` per span. This preserves determinism but creates high failure rates and expensive retry loops when documents change rapidly or when minor edits invalidate hashes.

This proposal introduces a negotiated extension that makes targeting more resilient while remaining deterministic and fail-closed:

1) Multi-signal preconditions (hard + soft signals) that are resilient to small, safe shifts.  
2) Deterministic relocation and optional auto-retargeting within policy limits.  
3) Structured diagnostics for failed preconditions to reduce read-retry cycles.

---

## 0. Scope and Non-Goals

**Scope:**
- Extend AI Gateway preconditions with additional signals for deterministic targeting.
- Define a deterministic relocation and candidate selection algorithm.
- Add structured diagnostics for precondition failures.

**Non-Goals:**
- No new CRDT or storage format changes.
- No changes to canonicalization or dry-run rules.
- No changes to op codes or the editor schema.
- No probabilistic or model-dependent targeting.
- No change to storage format for Markdown; optional Markdown payload conversion is defined in §22 only.

---

## 1. Problem Analysis (Observed Failures)

### P1: Fragile Precondition Hashes
`if_match_context_hash` is invalidated by minor local edits or formatting, causing 409s even when the target intent is still valid.

### P2: Retry Loops Under Concurrency
Frequent edits make `doc_frontier` stale, forcing repeated read-relocate-retry cycles with poor UX latency.

### P3: Relocation Ambiguity
Existing guidance allows relocation by text similarity, but without a deterministic and audited selection algorithm, relocation becomes brittle or unsafe.

### P4: Diagnostics Too Coarse
The gateway returns only `AI_PRECONDITION_FAILED`, leaving the agent to re-read large areas to recover context.

---

## 2. Design Principles

1) **Deterministic and fail-closed**: no probabilistic matching, no silent overwrite.  
2) **Policy-gated**: all behavior changes are negotiated and policy-limited.  
3) **Backward compatible**: v0.9 envelopes remain valid and unchanged.  
4) **Minimal diff**: new fields extend existing structures without requiring new op formats.  
5) **Auditable**: retargeting decisions are explicit and reproducible.

---

## 3. Capability Gating and Policy

### 3.1 Capability Flag (Required)

- `capabilities.ai_targeting_v1 = true` MUST be negotiated to enable this extension.
- This extension requires `capabilities.ai_native = true`.

**AT-001:** If `ai_targeting_v1` is not negotiated, requests that include `targeting.version = "v1"` MUST be rejected as a capability mismatch (use `NEGOTIATION_FAILED_CAPABILITY_MISMATCH`).

### 3.2 Policy Manifest Placement (Required)

Add policy block:

```
ai_native_policy.targeting: AiTargetingPolicyV1
```

Implementations MAY mirror this under `extensions.ai_targeting_v1`, but the normative location is `ai_native_policy.targeting`.

### 3.3 AiTargetingPolicyV1 (Normative)

```ts
type AiTargetingPolicyV1 = {
  version: "v1";
  enabled: boolean;
  allow_soft_preconditions: boolean;
  allow_layered_preconditions: boolean;
  allow_auto_retarget: boolean;
  allow_auto_trim: boolean;
  allow_delta_reads: boolean;
  allowed_relocate_policies: Array<
    "exact_span_only" | "same_block" | "sibling_blocks" | "document_scan"
  >;
  default_relocate_policy: "exact_span_only" | "same_block" | "sibling_blocks" | "document_scan";
  max_candidates: number; // >= 1
  max_block_radius: number; // >= 0
  max_relocate_distance: number; // >= 0, UTF-16 code units
  max_weak_preconditions: number; // >= 0
  window_size: { left: number; right: number }; // UTF-16 code units
  neighbor_window: { left: number; right: number }; // UTF-16 code units
  min_soft_matches_for_retarget: number; // >= 0
  min_preserved_ratio: number; // 0.0-1.0
  trim_diagnostics: boolean;
  require_span_id: boolean;
  max_diagnostics_bytes: number;
  rate_limit?: {
    requests_per_minute: number;
    burst_size: number;
    per_agent: boolean;
  };
};
```

Negotiation (normative):
- `enabled = AND`
- `allow_soft_preconditions = AND`
- `allow_layered_preconditions = AND`
- `allow_auto_retarget = AND`
- `allow_auto_trim = AND`
- `allow_delta_reads = AND`
- `allowed_relocate_policies = intersection`
- `default_relocate_policy` = most restrictive in `allowed_relocate_policies` (order: `exact_span_only` > `same_block` > `sibling_blocks` > `document_scan`)
- `max_candidates = min(...)`
- `max_block_radius = min(...)`
- `max_relocate_distance = min(...)`
- `max_weak_preconditions = min(...)`
- `window_size` and `neighbor_window` = min per side
- `min_soft_matches_for_retarget = max(...)` (stricter)
- `min_preserved_ratio = max(...)` (stricter)
- `trim_diagnostics = AND`
- `require_span_id = OR` (stricter)
- `max_diagnostics_bytes = min(...)`
- `rate_limit` (if present on any participant): `requests_per_minute = min(...)`, `burst_size = min(...)`, `per_agent = OR`

**AT-010:** If `enabled=false`, the gateway MUST behave as v0.9 (no targeting extension behavior).

---

## 4. Target Precondition v1

### 4.1 Structure (Normative)

```ts
type AiTargetPreconditionV1 = {
  v: 1;
  span_id?: string; // preferred when available
  block_id: string;
  range?: {
    start: { anchor: string; bias: "left" | "right" };
    end?: { anchor: string; bias: "left" | "right" };
  };
  hard: {
    context_hash?: string;  // LFCC_SPAN_V2
    window_hash?: string;   // LFCC_SPAN_WINDOW_V1
    structure_hash?: string; // LFCC_BLOCK_SHAPE_V1
  };
  soft?: {
    neighbor_hash?: { left?: string; right?: string }; // LFCC_NEIGHBOR_V1
    window_hash?: string; // LFCC_SPAN_WINDOW_V1
    structure_hash?: string; // LFCC_BLOCK_SHAPE_V1
  };
};
```

### 4.2 Requirements (Normative)

- **AT-100:** `block_id` MUST be present.
- **AT-101:** `hard` MUST include at least one of `context_hash` or `window_hash`.
- **AT-102:** If `policy.require_span_id=true`, `span_id` MUST be present.
- **AT-103:** If `range` is present, anchors MUST validate per LFCC v0.9 RC §3.1 and §3.2.
- **AT-104:** Unknown `v` values MUST be rejected.
- **AT-105:** If `soft` signals are provided and `policy.allow_soft_preconditions=false`, the gateway MUST reject the request.

If `range` is omitted, the target range is the full span.
If `range.end` is omitted, the range is a zero-length insertion point at `range.start`.

### 4.3 Compatibility Mapping (Normative)

Legacy v0.9 preconditions map to v1 as follows:

```
{ span_id, if_match_context_hash }
  =>
{ v:1, span_id, block_id, hard: { context_hash: if_match_context_hash } }
```

When mapping, `block_id` MUST be resolved from the current span index; if it cannot be resolved, reject with `AI_PRECONDITION_FAILED`.

---

## 5. Signal Definitions

### 5.1 Context Hash (Existing)

`context_hash` MUST follow LFCC v0.9 RC §6.2 (`LFCC_SPAN_V2`).

### 5.2 Window Hash (New)

`window_hash` is a stable hash of surrounding context, excluding the span interior, to tolerate safe edits within the span.

**Canonical string:**
```
LFCC_SPAN_WINDOW_V1
block_id=<block_id>
left=<left_context>
right=<right_context>
```

Where:
- `left_context` is the last `window_size.left` UTF-16 code units immediately before the span start.
- `right_context` is the first `window_size.right` UTF-16 code units immediately after the span end.
- Text normalization MUST match Appendix A (LF normalization, control stripping).
- If a boundary is out of range, use empty string.

**AT-200:** `window_hash` MUST be SHA-256 over the canonical string above (lower-case hex).

### 5.3 Neighbor Hash (New)

`neighbor_hash` provides a smaller, higher-precision boundary signal. Unlike `window_hash`, neighbor hashes are computed **separately for each side**.

**Canonical string (per side):**
```
LFCC_NEIGHBOR_V1
block_id=<block_id>
side=<left|right>
text=<neighbor_text>
```

Where:
- For `side=left`: `neighbor_text` is the last `neighbor_window.left` UTF-16 code units immediately before the span start.
- For `side=right`: `neighbor_text` is the first `neighbor_window.right` UTF-16 code units immediately after the span end.
- Text normalization MUST match §5.2 (LF normalization, control stripping).
- If no text exists on a side (e.g., span at block boundary), the corresponding hash MUST be omitted.

**AT-210:** Each `neighbor_hash.left` and `neighbor_hash.right` MUST be SHA-256 over its respective canonical string (lower-case hex).

### 5.4 Structure Hash (New)

`structure_hash` guards against cross-structure retargeting.

**Canonical string:**
```
LFCC_BLOCK_SHAPE_V1
block_id=<block_id>
type=<block_type>
parent_block_id=<parent_block_id_or_null>
parent_path=<parent_path_or_null>
```

**AT-220:** `structure_hash` MUST be SHA-256 over the canonical string above (lower-case hex).

---

## 6. Deterministic Relocation and Retargeting

### 6.1 Relocation Policies (Normative)

- `exact_span_only`: target span_id + hard signals only; no relocation.
- `same_block`: search only within `block_id`.
- `sibling_blocks`: search within `block_id` and blocks sharing the same parent path within `max_block_radius`.
- `document_scan`: search the entire document, but still apply hard signals.

For `sibling_blocks`, siblings are blocks sharing the same `parent.path`, expanded by up to `max_block_radius` blocks on each side in canonical document order. For `document_scan`, the gateway MUST scan all content blocks regardless of `max_block_radius`.

**AT-300:** If `relocate_policy` is not provided in the request, the gateway MUST use `policy.default_relocate_policy`.

### 6.2 Candidate Generation (Normative)

For each precondition, build a candidate set of spans within the relocation scope.

Candidates are spans with resolvable anchors in the gateway's current document state whose `block_id` is within the relocation scope. Candidates with unresolved anchors MUST be excluded.

**AT-310:** Candidates MUST be generated deterministically and ordered by `span_id` lexicographic ascending before ranking.

### 6.3 Candidate Ranking (Normative)

Define a match vector for each candidate:

```
match_vector = [
  hard.context_hash_match,
  hard.window_hash_match,
  hard.structure_hash_match,
  soft.neighbor_left_match,
  soft.neighbor_right_match,
  soft.window_hash_match,
  soft.structure_hash_match
]
```

Signals not provided in the precondition are treated as `false` for ranking and do not disqualify candidates.

Ranking rules:
1. Compare `match_vector` lexicographically (true > false).
2. Tie-break by `block_distance` (ascending), then `intra_block_distance` (ascending).
3. Tie-break by `span_id` lexicographic ascending.

Distance calculation:
- `block_distance`: absolute count of content blocks between the candidate's `block_id` and the original `block_id` in canonical document order (0 if same block).
- `intra_block_distance`: if `range` is present and the candidate is in the same block, the absolute difference between the candidate start anchor and the original `range.start` in UTF-16 code units; otherwise 0.

Candidates with `intra_block_distance` greater than `policy.max_relocate_distance` MUST be excluded.

**AT-320:** A candidate MUST satisfy all provided `hard` signals to be eligible.

### 6.4 Auto-Retarget (Optional, Policy-Gated)

If `policy.allow_auto_retarget=true` and the request sets `targeting.auto_retarget=true`, the gateway MAY apply the operation to the highest-ranked candidate when:
- The candidate is unique at the top rank, and
- The candidate matches at least `min_soft_matches_for_retarget` soft signals.

**AT-330:** When auto-retargeting occurs, the gateway MUST include a `retargeting` record in the success response (see §7.3).

### 6.5 Fail-Closed Behavior

If no candidate meets `hard` signals, or if the top rank is not unique, the gateway MUST fail the request with `AI_PRECONDITION_FAILED` and include candidate diagnostics (if enabled).

---

## 7. Envelope Extensions

### 7.1 Request Field (Normative)

Add a `targeting` object to AI Gateway requests:

```json
{
  "targeting": {
    "version": "v1",
    "relocate_policy": "same_block",
    "auto_retarget": false,
    "allow_trim": false
  }
}
```

**AT-400:** `targeting.version` MUST be "v1" for this extension.
**AT-401:** `relocate_policy` MUST be within `policy.allowed_relocate_policies`.
**AT-402:** If `auto_retarget=true`, `policy.allow_auto_retarget` MUST be true.
If `allow_trim` is omitted, it MUST default to `false`.

### 7.2 Preconditions Field

When `targeting.version = "v1"`, each entry in `preconditions[]` MUST be `AiTargetPreconditionV1`.

### 7.3 Success Response (Retargeting)

If auto-retargeting occurs, the response MUST include:

```json
{
  "retargeting": [
    {
      "requested_span_id": "span_1",
      "resolved_span_id": "span_9",
      "match_vector": [true, true, true, false, false, false, false]
    }
  ]
}
```

---

## 8. Diagnostics and Error Envelope

When a precondition fails, the gateway SHOULD include a structured diagnostic entry:

```json
{
  "code": "AI_PRECONDITION_FAILED",
  "phase": "ai_gateway",
  "retryable": true,
  "diagnostics": [
    {
      "kind": "ai_targeting_candidates_v1",
      "code": "AI_TARGETING_AMBIGUOUS",
      "stage": "targeting",
      "detail": "No unique match; top candidates returned",
      "candidates": [
        {
          "span_id": "span_9",
          "block_id": "block_3",
          "match_vector": [true, true, true, false, false, false, false],
          "block_distance": 0,
          "intra_block_distance": 12
        }
      ]
    }
  ]
}
```

**AT-500:** Candidate diagnostics MUST be limited to `policy.max_candidates` and `policy.max_diagnostics_bytes`.

---

## 9. Security and Privacy Considerations

- Candidate diagnostics MUST NOT include raw text or anchors; only hashed signals and IDs.  
- `document_scan` MUST be disabled by default in policy to avoid data leakage.  
- `window_size` and `neighbor_window` SHOULD be kept small enough to limit context exposure while preserving targeting robustness.  
- Hash strings MUST include stable prefixes (above) to prevent cross-protocol collisions.

---

## 10. Backward Compatibility

- If `targeting` is absent, behavior is unchanged (v0.9 strict preconditions).
- Gateways MAY accept legacy preconditions and internally map them to v1 if `ai_targeting_v1` is enabled.
- When `ai_targeting_v1` is disabled, requests using v1 MUST be rejected.

---

## 11. Conformance Tests (Normative)

Implementations MUST include test vectors for:

- `window_hash` and `neighbor_hash` canonicalization and hashing.
- Deterministic candidate ranking (tie-breakers included).
- Auto-retarget allow/deny behavior under policy.
- `max_candidates` and `max_diagnostics_bytes` enforcement.
- Legacy precondition mapping to v1.

---

## 12. Implementation Notes (Non-Normative)

- Prefer computing `window_hash` from canonicalized inline text for stability.
- Cache block text normalization to avoid repeated UTF-16 slicing.
- Emit `retargeting` logs to support audit and regression analysis.

---

## 13. Layered Preconditions (Strong + Weak Separation)

### 13.1 Motivation

The current model treats all preconditions as fail-closed. This proposal extends preconditions to distinguish **strong constraints** (must match or reject) from **weak constraints** (may trigger auto-recovery).

### 13.2 Request Field (Normative)

When `layered_preconditions` is present, the request MUST omit `preconditions`. If both are provided, reject with `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`.

```ts
type LayeredPreconditions = {
  strong: AiTargetPreconditionV1[];  // MUST match or 409
  weak?: WeakPreconditionV1[];        // MAY fail with auto-recovery
};

type WeakPreconditionV1 = AiTargetPreconditionV1 & {
  on_mismatch: "relocate" | "trim_range" | "skip";
  max_relocate_distance?: number;    // UTF-16 code units, capped by policy.max_relocate_distance
};
```

### 13.3 Requirements (Normative)

- **AT-600:** The gateway MUST validate that every `strong` and `weak` entry maps to a span targeted by `ops_xml`; unmapped entries MUST be rejected as `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`.
- **AT-601:** The gateway MUST process `strong` constraints first. If any `strong` constraint fails, the request MUST be rejected with 409 before evaluating `weak` constraints.
- **AT-602:** For each failed `weak` constraint, the gateway MUST apply the `on_mismatch` recovery strategy:
  - `relocate`: Use the targeting v1 relocation algorithm (§6) with the weak precondition as input; cap `max_relocate_distance` by `policy.max_relocate_distance`. If no unique match is found, reject with `AI_PRECONDITION_FAILED` and diagnostic code `AI_WEAK_RECOVERY_FAILED`.
  - `trim_range`: Apply the auto-trimming algorithm (§15). This requires `targeting.allow_trim=true` and a `range` in the precondition. If trimming fails, reject with `AI_PRECONDITION_FAILED` and the corresponding trimming diagnostic code.
  - `skip`: Remove the span target from the operation. If all targets are removed, reject with `AI_PRECONDITION_FAILED` and a diagnostic code `AI_TARGETING_ALL_SKIPPED`.
- **AT-603:** The response MUST include a `weak_recoveries` array documenting each recovery action taken.
- **AT-604:** If `policy.allow_layered_preconditions=false` or `policy.allow_soft_preconditions=false`, requests with `layered_preconditions` MUST be rejected.

### 13.4 Recovery Response (Normative)

```json
{
  "status": 200,
  "weak_recoveries": [
    {
      "span_id": "span_5",
      "recovery_action": "relocate",
      "original_block_id": "block_3",
      "resolved_block_id": "block_4",
      "block_distance": 1,
      "intra_block_distance": 42
    },
    {
      "span_id": "span_7",
      "recovery_action": "trim_range",
      "original_range": {
        "start": { "anchor": "B64(...)", "bias": "right" },
        "end": { "anchor": "B64(...)", "bias": "left" }
      },
      "trimmed_range": {
        "start": { "anchor": "B64(...)", "bias": "right" },
        "end": { "anchor": "B64(...)", "bias": "left" }
      }
    }
  ]
}
```

---

## 14. Delta Reads API (Incremental Refresh)

### 14.1 Motivation

After a successful or failed operation, agents need to refresh their local state. Returning a full document tree is inefficient. This section defines an incremental refresh response.

### 14.2 Request Option (Normative)

Add to request envelope:

```json
{
  "options": {
    "return_delta": true,
    "delta_scope": "affected_only" | "affected_with_neighbors"
  }
}
```

If `delta_scope` is omitted, it MUST default to `affected_only`. Delta responses MAY be included for both success (200) and precondition failures (409).

### 14.3 Delta Response Structure (Normative)

```ts
type DeltaResponse = {
  frontier_delta: {
    from_frontier: DocFrontier;
    to_frontier: DocFrontier;
    ops_count?: number;
  };
  affected_spans: Array<{
    span_id: string;
    block_id: string;
    new_context_hash?: string;
    new_range?: {
      start: { anchor: string; bias: "left" | "right" };
      end: { anchor: string; bias: "left" | "right" };
    };
    status: "updated" | "relocated" | "deleted" | "created";
  }>;
  neighbor_spans?: Array<{
    span_id: string;
    block_id: string;
    context_hash: string;
  }>;
  stale_blocks?: string[];   // Blocks requiring full refresh
  delta_truncated?: boolean;
};
```

On success, `frontier_delta.to_frontier` MUST equal the `applied_frontier`. On 409, it MUST equal `current_frontier` from the error envelope.
If `ops_count` is present, it MUST represent the number of Loro ops between `from_frontier` and `to_frontier` as observed by the gateway.

### 14.4 Requirements (Normative)

- **AT-700:** When `return_delta=true`, the response MUST include `frontier_delta` and `affected_spans`.
- **AT-701:** `affected_spans` MUST include all spans touched by the operation, plus spans invalidated by structural changes. For `status="deleted"`, `new_context_hash` MUST be omitted.
- **AT-702:** When `delta_scope="affected_with_neighbors"`, the response MUST include `neighbor_spans` computed with deterministic neighbor expansion and radius `policy.max_block_radius`.
- **AT-703:** If incremental information cannot be computed deterministically or would exceed implementation limits, the response MUST set `delta_truncated=true` and set `stale_blocks` to the affected block ids (or `["*"]` to indicate full refresh).

---

## 15. Conflict Auto-Trimming

### 15.1 Motivation

When a target span has shifted but the edit intent is still valid, auto-trimming allows the operation to proceed on the intersection of the original and current ranges.

### 15.2 Policy Controls (Normative)

Auto-trimming is controlled by `AiTargetingPolicyV1` fields defined in §3.3:
`allow_auto_trim`, `min_preserved_ratio`, and `trim_diagnostics`.

### 15.3 Trimming Algorithm (Normative)

Range-aware ops are those that explicitly encode a per-span target range using anchors. For `<replace_spans>`, this proposal defines optional `start_anchor` and `end_anchor` attributes on each `<span>` element. These anchors MUST use the negotiated anchor encoding and checksum rules. If these attributes are absent, the op is considered range-opaque.

1. Require `range.start` and `range.end` in the precondition and resolve them against the current document state. If resolution fails, reject.
2. Resolve the current range of the target span from its anchors.
3. Compute the intersection of the resolved precondition range and the current span range.
4. If the intersection is empty, reject with `AI_PRECONDITION_FAILED`.
5. If `intersection_length / original_length >= min_preserved_ratio`, apply the trimmed operation; otherwise reject with `AI_PRECONDITION_FAILED`.
6. If the underlying op does not support range targeting, reject with `AI_PRECONDITION_FAILED` and include a diagnostic code `AI_TARGETING_TRIM_UNSUPPORTED`.

Lengths are computed in UTF-16 code units.

### 15.4 Requirements (Normative)

- **AT-800:** Auto-trimming MUST only apply when `policy.allow_auto_trim=true` and the request sets `targeting.allow_trim=true`.
- **AT-801:** The trimmed range MUST be deterministically computed from anchor resolution at the current frontier.
- **AT-802:** When trimming occurs, the response MUST include a `trimming` record:

```json
{
  "trimming": [
    {
      "span_id": "span_3",
      "original_length": 100,
      "trimmed_length": 75,
      "preserved_ratio": 0.75
    }
  ]
}
```

- **AT-803:** If trimming would result in an empty or semantically invalid operation, or if the op is not range-aware, the gateway MUST reject rather than apply an empty or ambiguous edit.

---

## 16. SDK Encapsulation (Read→Think→Act)

### 16.1 Motivation

Agents should not need to handle LFCC protocol details directly. This section defines a recommended SDK interface that encapsulates rebase, relocate, and retry logic.

### 16.2 Recommended SDK Interface (Non-Normative)

```ts
interface AgentEditSession {
  // Agent produces intent, SDK handles LFCC mechanics
  submitIntent(
    intent: EditIntent,
    targets: SpanReference[],
    options?: SubmitOptions
  ): Promise<EditResult>;

  // Observe current state with optional refresh
  refreshSpans(spanIds: string[]): Promise<SpanState[]>;

  // Preview normalization before commit (local dry-run)
  previewNormalization(payload: AIPayload): Promise<NormalizationPreview>;
}

interface SubmitOptions {
  maxRetries?: number;         // Default: 3
  autoRelocate?: boolean;      // Default: true if policy allows
  autoTrim?: boolean;          // Default: false
  minPreservedRatio?: number;  // Default: 0.5
}

interface EditResult {
  success: boolean;
  appliedFrontier?: DocFrontier;
  recoveries?: WeakRecovery[];
  trimming?: TrimRecord[];
  retries?: number;
  finalError?: AIError;
}
```

### 16.3 SDK Behavior Requirements (Recommended)

1. On 409 with `retryable=true`, automatically rebase to `current_frontier` and relocate failed spans.
2. Use layered preconditions: put critical spans in `strong`, tolerance-allowed spans in `weak`.
3. Apply exponential backoff with jitter between retries.
4. Log all retry attempts with full diagnostics for observability.
5. Surface trimming decisions to the agent for acceptance (unless auto-accepted by policy).

### 16.4 Normalization Preview (Normative)

- **AT-900:** If an SDK is provided, it MUST expose a local preview API that runs canonicalization and sanitization without committing:

```ts
interface NormalizationPreview {
  canonicalized: CanonNode[];
  rewritten_spans: Array<{
    span_id: string;
    original_text: string;
    normalized_text: string;
  }>;
  sanitized_elements: Array<{
    element: string;
    action: "stripped" | "modified";
    reason: string;
  }>;
  schema_valid: boolean;
  warnings: string[];
}
```

---

## 17. Enhanced Diagnostics

### 17.1 Motivation

The current `AI_PRECONDITION_FAILED` response lacks stage-specific detail. This section defines fine-grained diagnostic codes.

### 17.2 Diagnostic Subcodes (Normative)

When `ai_targeting_v1` is enabled, the top-level error `code` MUST remain the v0.9 RC value:
- 409: `AI_PRECONDITION_FAILED`
- 400: `AI_PAYLOAD_REJECTED_SANITIZE` or `AI_PAYLOAD_REJECTED_LIMITS`
- 422: `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`

Additional detail is provided via `diagnostics[].code` subcodes:

| Subcode | Parent Code | HTTP | Stage | Description |
|---------|-------------|------|-------|-------------|
| `AI_TARGETING_NO_CANDIDATES` | `AI_PRECONDITION_FAILED` | 409 | targeting | No spans matched hard signals |
| `AI_TARGETING_AMBIGUOUS` | `AI_PRECONDITION_FAILED` | 409 | targeting | Multiple candidates tied at top rank |
| `AI_TARGETING_TRIMMED_BELOW_THRESHOLD` | `AI_PRECONDITION_FAILED` | 409 | targeting | Auto-trim ratio below `min_preserved_ratio` |
| `AI_TARGETING_TRIM_UNSUPPORTED` | `AI_PRECONDITION_FAILED` | 409 | targeting | Op does not support range-aware trimming |
| `AI_TARGETING_ALL_SKIPPED` | `AI_PRECONDITION_FAILED` | 409 | targeting | All weak targets were skipped |
| `AI_WEAK_RECOVERY_FAILED` | `AI_PRECONDITION_FAILED` | 409 | targeting | Weak constraint recovery failed |
| `DRYRUN_SANITIZE_DISALLOWED_TAG` | `AI_PAYLOAD_REJECTED_SANITIZE` | 400 | sanitize | Payload contained disallowed HTML tag |
| `DRYRUN_SANITIZE_UNSAFE_URL` | `AI_PAYLOAD_REJECTED_SANITIZE` | 400 | sanitize | Payload contained unsafe URL |
| `DRYRUN_NORMALIZE_MARK_CONFLICT` | `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` | 422 | normalize | Conflicting marks after canonicalization |
| `DRYRUN_SCHEMA_PARSE_ERROR` | `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` | 422 | schema | Editor schema could not parse payload |
| `DRYRUN_SCHEMA_NESTING_EXCEEDED` | `AI_PAYLOAD_REJECTED_LIMITS` | 400 | schema | Payload exceeded max nesting depth |
| `DRYRUN_MARKDOWN_UNSUPPORTED` | `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` | 422 | normalize | Markdown conversion unavailable |

### 17.3 Structured Diagnostic Entry (Normative)

```ts
type DiagnosticEntry = {
  kind: string;
  code: string;           // Diagnostic subcode (see §17.2)
  stage: "targeting" | "precondition" | "sanitize" | "normalize" | "schema";
  detail: string;
  span_id?: string;
  node_path?: string[];   // For schema errors
  suggestion?: string;    // Recovery hint
};
```

### 17.4 Requirements (Normative)

- **AT-1000:** All error responses MUST include at least one `DiagnosticEntry`.
- **AT-1001:** Diagnostics MUST be limited to `policy.max_diagnostics_bytes`.
- **AT-1002:** Diagnostics MUST NOT include raw document text; use hashes and span IDs only.

---

## 18. Observability and Metrics

### 18.1 Recommended Metrics (Non-Normative)

Implementations SHOULD expose the following metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `lfcc_ai_request_total` | Counter | `status`, `atomicity` | Total AI requests processed |
| `lfcc_ai_request_duration_ms` | Histogram | `stage` | Request duration by stage |
| `lfcc_ai_precondition_failures` | Counter | `reason`, `policy` | Precondition failures by reason |
| `lfcc_ai_retarget_total` | Counter | `policy`, `success` | Auto-retarget attempts |
| `lfcc_ai_trim_total` | Counter | `success` | Auto-trim attempts |
| `lfcc_ai_weak_recovery_total` | Counter | `action`, `success` | Weak constraint recoveries |
| `lfcc_ai_retry_rounds` | Histogram | `agent_id` | Retry rounds per request |
| `lfcc_ai_relocate_distance` | Histogram | `policy` | Relocation distances |

### 18.2 Audit Log Schema (Recommended)

```ts
type OperationAuditLog = {
  request_id: string;
  agent_id: string;
  intent_id?: string;
  timestamp_ms: number;
  stages: {
    input: {
      ops_xml_hash: string;
      preconditions_count: number;
      targeting_version?: string;
    };
    sanitized?: {
      stripped_count: number;
      modified_count: number;
    };
    normalized?: {
      canon_tree_hash: string;
    };
    targeting?: {
      candidates_evaluated: number;
      retargets: number;
      trims: number;
      weak_recoveries: number;
    };
    applied?: {
      ops_applied: number;
      frontier_after: string;
    };
  };
  outcome: "success" | "precondition_failed" | "sanitize_failed" | "schema_failed";
  duration_ms: number;
};
```

---

## 19. Request Throttling and Batching

### 19.1 Motivation

High-frequency edits from agents can cause thrashing. This section defines client-side throttling guidance and server-side rate limiting.

### 19.2 Client Throttling (Recommended)

- Agents SHOULD debounce rapid edits (recommended: 100-500ms) and batch into single requests.
- Agents SHOULD use the delta reads API to minimize refresh overhead.
- When conflict rate exceeds a threshold (e.g., >50% in last 10 requests), agents SHOULD increase the debounce interval.

### 19.3 Server Rate Limiting (Normative)

Rate limiting is controlled by `AiTargetingPolicyV1.rate_limit` (see §3.3).

- **AT-1100:** When rate limit is exceeded, the gateway MUST return 429 with `AI_RATE_LIMIT` as the top-level code and include `retry_after_ms` in the response.

---

## 20. Implementation Priorities

This section provides implementation guidance based on impact and complexity.

### 20.1 Priority Matrix

| Priority | Feature | Complexity | Impact | Dependencies |
|----------|---------|------------|--------|--------------|
| **P0** | Multi-signal preconditions (§4) | Medium | High | None |
| **P0** | Deterministic relocation (§6) | Medium | High | §4 |
| **P0** | Enhanced diagnostics (§17) | Low | High | None |
| **P1** | Layered preconditions (§13) | Medium | High | §4 |
| **P1** | Delta reads API (§14) | Medium | Medium | None |
| **P1** | SDK encapsulation (§16) | Medium | High | §4, §6, §13 |
| **P2** | Conflict auto-trimming (§15) | Medium | Medium | §4, §6 |
| **P2** | Observability metrics (§18) | Low | Medium | None |
| **P2** | Markdown payload conversion (§22) | Medium | Medium | Markdown parser |
| **P3** | Request throttling (§19) | Low | Low | None |

### 20.2 Rollout Plan

1. **Phase 1 (Core Targeting):** Implement §3-6 (capability, policy, preconditions v1, relocation).
2. **Phase 2 (Diagnostics):** Implement §8, §17 (error envelope, enhanced codes).
3. **Phase 3 (Resilience):** Implement §13 (layered), §14 (delta), §15 (trimming).
4. **Phase 4 (SDK):** Implement §16 (SDK interface) and §18 (metrics).
5. **Phase 5 (Optimization):** Implement §19 (throttling) based on production metrics.

---

## 21. Conformance Test Vectors

Implementations MUST pass the following test categories:

### 21.1 Precondition Tests

1. `window_hash` canonical string generation with LF normalization.
2. `neighbor_hash` boundary handling (start/end of block).
3. `structure_hash` with nested parent paths.
4. Legacy precondition mapping to v1.

### 21.2 Relocation Tests

1. Deterministic candidate ordering (lexicographic + distance + span_id).
2. Auto-retarget success when unique top-rank candidate.
3. Auto-retarget rejection when tied candidates.
4. Policy `max_candidates` and `max_block_radius` enforcement.

### 21.3 Layered Precondition Tests

1. Strong failure blocks weak evaluation.
2. Weak `relocate` recovery within `max_relocate_distance`.
3. Weak `trim_range` with `min_preserved_ratio` threshold.
4. Weak `skip` excludes span without failing request.

### 21.4 Delta Reads Tests

1. `affected_spans` includes all touched spans.
2. `neighbor_spans` respects `max_block_radius`.
3. `stale_blocks` returned when incremental computation fails.
4. `delta_truncated=true` triggers `stale_blocks` with `["*"]` or affected block ids.

### 21.5 Trimming Tests

1. Trim succeeds when `preserved_ratio >= min_preserved_ratio`.
2. Trim fails when ratio below threshold.
3. Trim rejects when result would be empty operation.

### 21.6 Diagnostics Tests

1. 409 responses retain top-level `AI_PRECONDITION_FAILED` with targeting subcodes in `diagnostics[].code`.
2. 400/422 responses retain top-level `AI_PAYLOAD_REJECTED_*` with dry-run subcodes in `diagnostics[].code`.
3. Diagnostics never include raw document text.

### 21.7 Markdown Payload Tests

1. `format="markdown"` uses deterministic conversion and produces canonical output when supported.
2. Unsupported Markdown conversion rejects with `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` and `DRYRUN_MARKDOWN_UNSUPPORTED`.
3. Disallowed Markdown elements are stripped or rejected per `ai_sanitization_policy`.

---

## 22. Markdown Payload Support (Optional)

### 22.1 Motivation

AI programming workflows and agent artifacts are commonly expressed in Markdown. The current gateway pipeline sanitizes Markdown but does not guarantee deterministic conversion to a canonical tree. This section defines the requirements to treat Markdown as a first-class AI payload format while preserving LFCC determinism.

### 22.2 Requirements (Normative)

- **AT-1200:** Gateways that accept `format="markdown"` MUST convert Markdown to HTML using a deterministic parser with raw HTML disabled. Conversion MUST occur before sanitize → normalize → schema apply.
- **AT-1201:** If deterministic conversion is unavailable, the gateway MUST reject the request with `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` and diagnostic subcode `DRYRUN_MARKDOWN_UNSUPPORTED`.
- **AT-1202:** Markdown elements that map to disallowed blocks/marks MUST be stripped or rejected according to `ai_sanitization_policy.reject_unknown_structure` and `allowed_block_types`/`allowed_marks`.

---

## 23. Version History

- **v0.9.4-draft (2026-01-22):** Initial proposal for AI targeting resilience.
- **v0.9.4-draft.2 (2026-01-22):** Added layered preconditions (§13), delta reads (§14), conflict auto-trimming (§15), SDK encapsulation (§16), enhanced diagnostics (§17), observability (§18), throttling (§19), and implementation priorities (§20).
- **v0.9.4-draft.3 (2026-01-22):** Clarified diagnostics compatibility, layered precondition semantics, delta responses, and added optional Markdown payload requirements (§22).
- **v0.9.4-draft.4 (2026-01-22):** Added missing `max_weak_preconditions` and `allow_delta_reads` to policy (§3.3). Aligned `neighbor_hash` to use per-side canonical strings (§5.3).
