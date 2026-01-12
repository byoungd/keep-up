# AI Envelope Specification (Client ⇄ Gateway) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
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
`doc_frontier` is an opaque string representing the client’s observed CRDT frontier (e.g., encoded version vector).

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
  "doc_frontier": "FRONTIER_ENCODED",
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
- If any precondition fails → **409 Conflict**.
- If payload dry-run fails → **422 Unprocessable Entity** (or policy-defined) with diagnostics.
- Gateway MUST enforce `ai_sanitization_policy.limits` and reject on limit violations.

---

### 2.3 AI-Native Request (v0.9.1 optional)
AI-native implementations use the v2 envelope defined in `23_AI_Native_Extension.md`. Minimal example:

```json
{
  "request_id": "uuid",
  "agent_id": "agent_uuid",
  "doc_frontier": "FRONTIER_ENCODED",
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

## 3. Success Response (200)

When `return_canonical_tree=true`, gateway SHOULD return canonicalized representation of the applied edit (or of the payload after dry-run).

```json
{
  "status": "ok",
  "applied_frontier": "FRONTIER_AFTER_APPLY",
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
  "code": "CONFLICT",
  "current_frontier": "FRONTIER_NOW",
  "failed_preconditions": [
    { "span_id": "span_uuid", "reason": "hash_mismatch" }
  ]
}
```

AI-native error codes and diagnostics are defined in the addendum.

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
  "code": "DRYRUN_REJECTED",
  "reason": "schema_invalid",
  "diagnostics": [
    { "kind": "disallowed_tag", "detail": "<iframe> not allowed" },
    { "kind": "parse_error", "detail": "Editor schema parse failed at ..." }
  ]
}
```

Allowed reasons (non-exhaustive):
- `schema_invalid`
- `limit_exceeded`
