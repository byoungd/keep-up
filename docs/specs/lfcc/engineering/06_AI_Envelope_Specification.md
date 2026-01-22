# AI Envelope Specification (Client ⇄ Gateway) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2026-01-14  
**Audience:** Backend engineers, AI engineers, client integrators.  
**Source of truth:** LFCC v0.9 RC §11 (AI Gateway), §8 (Canonicalizer), §10 (Integrity).

**See also:** `23_AI_Native_Extension.md` (optional v0.9.1 AI-native addendum).

---

## 0. Principles

1. AI requests MUST be **causally pinned** to a document frontier.
2. AI writes MUST include **span-level preconditions** (`if_match_context_hash`).
3. AI payloads MUST be **dry-run sanitized** before application.
4. Failures MUST be fail-closed; never partially apply a mixed-validity response.

---

## 1. Common Types

### 1.1 Frontier
`doc_frontier` is a Loro frontier object representing the client’s observed CRDT boundary.

```json
{ "loro_frontier": ["peer:counter", "..."] }
```

Notes:
- `loro_frontier` entries MUST be deterministically ordered (peer id, then counter).
- The format MUST match `crdt_config.frontier_format` from the manifest.

### 1.2 Precondition
```json
{
  "span_id": "uuid",
  "if_match_context_hash": "sha256_hex"
}
```

---

## 2. Request Envelope (JSON)

### 2.1 Replace Spans Request (Example)

```json
{
  "doc_frontier": { "loro_frontier": ["peer:counter"] },
  "client_request_id": "uuid",
  "ops_xml": "<replace_spans annotation=\"anno_uuid\">...</replace_spans>",
  "preconditions": [
    { "span_id": "span_uuid", "if_match_context_hash": "sha256_hex" }
  ],
  "options": {
    "return_canonical_tree": true
  }
}
```

### 2.2 Semantics
- Gateway MUST ensure its doc state is **at least** `doc_frontier` causally (read-your-writes barrier).
- If any precondition fails → **409 Conflict** with `code = AI_PRECONDITION_FAILED` (Appendix C).
- If payload dry-run fails → **422 Unprocessable Entity** with `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`.
- Sanitization and limit failures MUST use **400** with `AI_PAYLOAD_REJECTED_SANITIZE` or `AI_PAYLOAD_REJECTED_LIMITS`.
- Gateway MUST enforce `ai_sanitization_policy.limits` and reject on limit violations.
- All errors MUST use the Appendix C error envelope.

---

### 2.3 AI-Native Request (v0.9.1 optional)
AI-native implementations use the v2 envelope defined in `23_AI_Native_Extension.md`. Minimal example:

```json
{
  "request_id": "uuid",
  "agent_id": "agent_uuid",
  "doc_frontier": { "loro_frontier": ["peer:counter"] },
  "intent_id": "intent_uuid",
  "preconditions": [
    { "span_id": "span_uuid", "if_match_context_hash": "sha256_hex" }
  ],
  "ops_xml": "<replace_spans annotation=\"anno_uuid\">...</replace_spans>",
  "policy_context": { "policy_id": "policy_uuid" }
}
```

Notes:
- v2 adds request idempotency, agent identity, and intent tracking.
- v2 retains v0.9 preconditions and dry-run requirements.

### 2.4 Multi-Document Request (v0.9.2 optional)

Multi-document AI requests bundle per-document frontiers, preconditions, and ops into a single AI-native v2 envelope. This is an optional extension and MUST be negotiated via capabilities and policy.

See: `docs/specs/lfcc/proposals/LFCC_v0.9.2_Multi_Document_Support.md`.

Minimal example:

```json
{
  "request_id": "uuid",
  "agent_id": "agent_uuid",
  "intent_id": "intent_uuid",
  "atomicity": "all_or_nothing",
  "documents": [
    {
      "doc_id": "doc_A",
      "role": "target",
      "doc_frontier": { "loro_frontier": ["peerA:10"] },
      "preconditions": [{ "span_id": "span_1", "if_match_context_hash": "sha256_hex" }],
      "ops_xml": "<replace_spans annotation=\"anno_uuid\">...</replace_spans>"
    },
    {
      "doc_id": "doc_B",
      "role": "source",
      "doc_frontier": { "loro_frontier": ["peerB:7"] }
    }
  ],
  "policy_context": { "policy_id": "policy_uuid" }
}
```

Normative notes:
- Gateways MUST enforce the read barrier per document (each doc state is at least its provided frontier).
- 409 is reserved for `AI_PRECONDITION_FAILED` (LFCC v0.9 RC Appendix C). Multi-document conflicts MUST be reported per document.
- `all_or_nothing` MUST be fail-closed (no partial apply). `best_effort` MAY return 200 with mixed per-document outcomes.

### 2.5 AI Targeting Resilience (v0.9.4 optional)

AI Targeting Resilience extends the request envelope with multi-signal preconditions, deterministic relocation, and auto-recovery. This is an optional extension and MUST be negotiated via `capabilities.ai_targeting_v1`.

See: `docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md`.

#### 2.5.1 Targeting Field

When `ai_targeting_v1` is negotiated, requests MAY include a `targeting` field:

```json
{
  "targeting": {
    "version": "v1",
    "relocate_policy": "same_block",
    "auto_retarget": true,
    "allow_trim": false
  }
}
```

- `version`: MUST be `"v1"`.
- `relocate_policy`: One of `exact_span_only`, `same_block`, `sibling_blocks`, `document_scan`. Defaults to policy `default_relocate_policy`.
- `auto_retarget`: If `true` and policy allows, gateway MAY apply ops to relocated span.
- `allow_trim`: If `true` and policy allows, gateway MAY trim range when span has shifted.

#### 2.5.2 Precondition v1 Format

When `targeting.version = "v1"`, preconditions use an extended format:

```json
{
  "v": 1,
  "span_id": "span_uuid",
  "block_id": "block_uuid",
  "range": {
    "start": { "anchor": "B64(...)", "bias": "right" },
    "end": { "anchor": "B64(...)", "bias": "left" }
  },
  "hard": {
    "context_hash": "sha256_hex",
    "window_hash": "sha256_hex",
    "structure_hash": "sha256_hex"
  },
  "soft": {
    "neighbor_hash": { "left": "sha256_hex", "right": "sha256_hex" },
    "window_hash": "sha256_hex"
  }
}
```

- `block_id` is REQUIRED.
- At least one `hard` signal MUST be provided.
- If `range` is omitted, the target is the full span.
- If `range.end` is omitted, the range is a zero-length insertion point.

#### 2.5.3 Layered Preconditions

When using layered preconditions, the request MUST use `layered_preconditions` instead of `preconditions`:

```json
{
  "layered_preconditions": {
    "strong": [
      { "v": 1, "span_id": "s1", "block_id": "b1", "hard": { "context_hash": "..." } }
    ],
    "weak": [
      {
        "v": 1, "span_id": "s2", "block_id": "b1", "hard": { "context_hash": "..." },
        "on_mismatch": "relocate",
        "max_relocate_distance": 100
      }
    ]
  }
}
```

- `strong`: MUST match or request fails.
- `weak`: May fail with automatic recovery via `on_mismatch` (`relocate`, `trim_range`, `skip`).
- `preconditions` and `layered_preconditions` are mutually exclusive; providing both is an error.

#### 2.5.4 Range-Aware Span Attributes

For range-aware operations (required for auto-trimming), `<replace_spans>` MAY include per-span anchors:

```xml
<replace_spans annotation="anno_uuid">
  <span span_id="span_1"
        start_anchor="B64(...)"
        start_bias="right"
        end_anchor="B64(...)"
        end_bias="left">
    Replacement content
  </span>
</replace_spans>
```

- `start_anchor` + `start_bias`: Optional anchor for range start.
- `end_anchor` + `end_bias`: Optional anchor for range end.
- If anchors are absent, the op targets the full span (range-opaque).
- When `targeting.allow_trim=true`, trimming applies only to range-aware ops.

#### 2.5.5 Delta Reads Response

When `options.return_delta=true`, success and error responses include:

```json
{
  "delta": {
    "frontier_delta": {
      "from_frontier": { "loro_frontier": ["..."] },
      "to_frontier": { "loro_frontier": ["..."] }
    },
    "affected_spans": [
      {
        "span_id": "span_1",
        "block_id": "block_1",
        "new_context_hash": "sha256_hex",
        "status": "updated"
      }
    ],
    "stale_blocks": [],
    "delta_truncated": false
  }
}
```



## 3. Success Response (200)

When `return_canonical_tree=true`, gateway SHOULD return canonicalized representation of the applied edit (or of the payload after dry-run).

```json
{
  "status": "ok",
  "applied_frontier": { "loro_frontier": ["peer:counter"] },
  "canon_root": {
    "type": "paragraph",
    "id": "canon_1",
    "attrs": {},
    "children": [
      { "is_leaf": true, "text": "Hello", "marks": ["bold"] }
    ]
  },
  "diagnostics": [
    { "kind": "sanitized_drop", "detail": "Dropped <script> tag" }
  ]
}
```

Notes:
- `canon_root` uses LFCC canonical tree types (§8).
- Returning canonical output is useful for client preview and for deterministic verification.

---

AI-native responses may include `applied_ops` and `audit_id` (see addendum).

## 4. Conflict Response (409)

```json
{
  "code": "AI_PRECONDITION_FAILED",
  "phase": "ai_gateway",
  "retryable": true,
  "current_frontier": { "loro_frontier": ["peer:counter"] },
  "failed_preconditions": [
    { "span_id": "span_uuid", "reason": "hash_mismatch" }
  ]
}
```

AI error codes and diagnostics are defined in Appendix C.

Allowed reasons:
- `hash_mismatch`
- `span_missing`
- `unverified`

---

## 5. Client Retry Guidance (Normative-Recommended)

On 409:
1) **Rebase**: fetch/apply updates to `current_frontier`  
2) **Relocate**:
   - Level 1 exact match by `context_hash` (default)
   - Level 2/3 only if enabled in manifest  
3) **Retry** up to `max_retries`  
4) **Abort** with user-facing message if relocation fails.

Relocation MUST NOT write shared repair updates without user confirmation.

---

## 6. Error Response for Dry-Run Rejection (422)

```json
{
  "code": "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION",
  "phase": "ai_gateway",
  "retryable": false,
  "diagnostics": [
    { "kind": "disallowed_tag", "detail": "<iframe> not allowed" },
    { "kind": "parse_error", "detail": "Editor schema parse failed at ..." }
  ]
}
```

Other error codes:
- `AI_PAYLOAD_REJECTED_SANITIZE` (400)
- `AI_PAYLOAD_REJECTED_LIMITS` (400)
