# LFCC v0.9.2 - Multi-Document Support Proposal

**Status:** Implementable (Verified 2026-01-18)  
**Author:** Keep-Up Team  
**Created:** 2026-01-18  
**Target Version:** LFCC v0.9.2  
**Goal:** Deterministic, policy-gated multi-document AI operations and cross-document references without weakening LFCC v0.9 guarantees (SEC, preconditions, dry-run, fail-closed).

**See also:**
- `docs/specs/LFCC_v0.9_RC.md` (§11 AI Gateway + Dry-Run)
- `docs/specs/engineering/06_AI_Envelope_Specification.md`
- `docs/specs/engineering/23_AI_Native_Extension.md`
- `packages/core/src/kernel/ai/crossDocument.ts` (in-repo scaffold types)

---

## Executive Summary

LFCC v0.9 AI Gateway envelopes are single-document: one `doc_frontier`, one `ops_xml`, one `preconditions[]`. This is sufficient for safe single-doc edits, but blocks higher-level workflows that are common in real systems:

- Quote/cite from Doc B while rewriting Doc A.
- Apply coordinated renames across multiple documents.
- Create stable cross-document references (citations, “related”, “derived”) that remain verifiable after merges.

This proposal introduces a negotiated multi-document extension that:

1) Extends the AI envelope to carry **per-document** frontiers, preconditions, and operations.  
2) Defines deterministic **atomicity modes** for multi-document edits.  
3) Adds first-class **cross-document references** with stable anchors and verification hooks.  
4) Adds policy controls for limits, access control, and audit across multiple documents.

Single-document envelopes remain valid and unchanged.

## 0. Principles (Normative)

- **MD-P-001:** Multi-document operations are an orchestration layer above independent Loro documents; they MUST NOT introduce a new CRDT.
- **MD-P-002:** All document mutations MUST remain explicit LFCC operations (`ops_xml`) and MUST be replayable without an LLM (DET-AI-001..003).
- **MD-P-003:** Preconditions remain span-scoped and MUST be enforced per document (LFCC v0.9 RC §11.1).
- **MD-P-004:** Dry-run sanitize → normalize → schema-apply remains mandatory per target document (LFCC v0.9 RC §11.2).
- **MD-P-005:** Failures MUST be fail-closed for `all_or_nothing` atomicity (no partial apply).

## 1. Terminology

- **Document**: an independent Loro CRDT state with its own frontier and update stream.
- **Policy domain**: a set of documents governed by the same effective LFCC Policy Manifest and editor schema.
- **Target document**: a document that is mutated by this request (`ops_xml` provided).
- **Source document**: a read-only document that MAY be provided to the LLM as context (subject to data-access/redaction policy and audit).
- **Reference document**: a read-only document used only for deterministic validation (anchor resolution, existence checks) and MUST NOT be provided to the LLM as context.
- **Atomicity**:
  - `all_or_nothing`: no document update is committed unless all target docs succeed.
  - `best_effort`: commit successes; report failures; no rollback of prior successes.
- **Cross-document reference**: a stable link from a source anchor to a target anchor, stored outside canonical document text.

## 2. Compatibility, Capabilities, and Policy

### 2.1 Capability Gating (Required)

- **MD-001:** Multi-document envelopes MUST be gated by negotiated capability flags:
  - `ai_gateway_v2 = true` (AI-native envelope support)
  - `multi_document = true` (this proposal)
- **MD-002:** If `multi_document` is not negotiated, gateways MUST reject multi-document envelopes with a structured error (`AI_MULTI_DOCUMENT_UNSUPPORTED`).
- **MD-003:** Gateways MUST apply a deterministic downgrade strategy when `atomicity="all_or_nothing"` is requested but not supported: reject unless `multi_document_policy.allow_atomicity_downgrade=true`, then downgrade to `best_effort` and emit a diagnostic.

### 2.2 Policy Manifest Placement (Recommended)

For LFCC v0.9.2, add:

1) A capability flag:
   - `capabilities.multi_document: boolean`
2) A policy block inside AI-native policy:
   - `ai_native_policy.multi_document: MultiDocumentPolicyV1`

Implementations MAY additionally mirror the policy under `extensions.multi_document` for forward-compatibility tooling, but the normative location is `ai_native_policy.multi_document` for v0.9.2+.

### 2.3 Multi-Document Policy (Normative Fields)

- **MD-010:** Policy MUST define:
  - `version: "v1"`
  - `enabled: boolean`
  - `max_documents_per_request: number` (>= 1)
  - `max_total_ops: number` (>= 0; counts total LFCC ops across all `ops_xml`)
  - `allowed_atomicity: Array<"all_or_nothing" | "best_effort">`
  - `allow_atomicity_downgrade: boolean`
  - `max_reference_creations: number` (>= 0)
  - `require_target_preconditions: boolean` (default true)
  - `require_citation_preconditions: boolean` (default false; when true, `ref_type="citation"` MUST include `if_match_context_hash`)

Negotiation (recommended):
- `enabled = AND`
- `max_* = min(...)`
- `allowed_atomicity = set_intersection(...)`
- `allow_atomicity_downgrade = AND` (most restrictive)

Notes:
- **MD-010-A (max_total_ops counting):** `max_total_ops` MUST be computed deterministically from the submitted `ops_xml` payloads using the following rules:
  - For each target document entry, parse `ops_xml` as XML.
  - If the root element is `<replace_spans>`, count the number of descendant `<span>` elements that carry a `span_id` attribute (each counts as 1 operation unit).
  - Else, count the number of descendant `<op>` elements (each counts as 1 operation unit).
  - If the XML contains neither `<span span_id="...">` nor `<op>`, count the root element as 1 operation unit.
  - The total is the sum across all target documents.
  - Implementations MAY reject unknown/unsupported op schemas during schema dry-run; counting MUST still follow the rules above for limit enforcement.

### 2.4 Policy-Domain Constraint

- **MD-011:** A multi-document request MUST only include documents within the same policy domain (same effective LFCC Policy Manifest + editor schema). Gateways MUST reject cross-domain bundles to avoid non-deterministic hashing and schema drift.

## 3. Multi-Document AI Envelope (v2 Extension)

### 3.1 Envelope Shape

This extension adds a top-level `documents[]` list. When `documents[]` is present:
- the request is a multi-document request;
- single-doc fields (`doc_frontier`, `ops_xml`, `preconditions`) MUST NOT be used.

Doc frontier representation:
- Canonical form is the LFCC v0.9 frontier object (e.g., `{ "loro_frontier": [...] }`).
- For backward compatibility, implementations MAY accept a legacy `doc_frontier_tag` string in place of `doc_frontier`.
- If a frontier is encoded as a string tag, it MUST be compatible with `crdt_config.frontier_format`. For `loro_op_ids_v1`, use the encoding defined in §3.1.1.

#### 3.1.1 `doc_frontier_tag` Encoding (Legacy; Normative)

This is a legacy string encoding for the canonical `{ "loro_frontier": [...] }` object. It is only intended for backward compatibility.

ABNF:

```
frontier-tag = opid *( "|" opid )
opid         = peer ":" counter
peer         = 1*( ALPHA / DIGIT / "_" / "-" )
counter      = 1*DIGIT
```

Canonical ordering:
- Entries MUST be sorted by `peer` (ASCII lexicographic ascending).
- Duplicate `peer` entries MUST be rejected.

Note: In a valid Loro frontier, each peer appears at most once (representing the highest observed counter for that peer). The `counter` value is not used for ordering between entries.

If an implementation cannot represent a peer id using the `peer` grammar above, it MUST NOT use `doc_frontier_tag` and MUST use the canonical `doc_frontier` object instead.

### 3.2 Request (Example)

```json
{
  "request_id": "req_uuid",
  "agent_id": "agent_uuid",
  "intent_id": "intent_uuid",
  "atomicity": "all_or_nothing",
  "documents": [
    {
      "doc_id": "doc_A",
      "role": "target",
      "doc_frontier": { "loro_frontier": ["peerA:10"] },
      "preconditions": [{ "span_id": "span_1", "if_match_context_hash": "sha256_hex" }],
      "ops_xml": "<replace_spans annotation=\"anno_uuid\">...</replace_spans>",
      "options": { "return_canonical_tree": true }
    },
    {
      "doc_id": "doc_B",
      "role": "source",
      "doc_frontier": { "loro_frontier": ["peerB:7"] }
    },
    {
      "doc_id": "doc_C",
      "role": "reference",
      "doc_frontier": { "loro_frontier": ["peerC:3"] }
    }
  ],
  "references": [
    {
      "ref_type": "citation",
      "source": {
        "doc_id": "doc_B",
        "block_id": "b1",
        "start": { "anchor": "B64(...)", "bias": "right" },
        "end": { "anchor": "B64(...)", "bias": "left" },
        "if_match_context_hash": "sha256_hex",
        "excerpt": "quoted text"
      },
      "target": {
        "doc_id": "doc_A",
        "block_id": "b9",
        "anchor": { "anchor": "B64(...)", "bias": "right" }
      }
    }
  ],
  "policy_context": { "policy_id": "policy_uuid" }
}
```

### 3.3 Normative Field Requirements

- **MD-019:** Multi-document requests MUST satisfy the AI-native v2 envelope requirements (GW-101..103), including `request_id`, `agent_id`, and either `intent_id` or `intent`.
- **MD-020:** `documents[]` MUST be non-empty and MUST NOT contain duplicate `doc_id`s.
- **MD-021:** Each document entry MUST include `doc_id`, `role`, and either `doc_frontier` or `doc_frontier_tag` (alias).
- **MD-022:** Entries with `role = "target"` MUST include `ops_xml`.
- **MD-023:** If `multi_document_policy.require_target_preconditions = true`, target entries MUST include non-empty `preconditions[]` for every targeted span.
- **MD-024:** `atomicity` MUST be present and MUST be allowed by policy; otherwise reject (or downgrade if policy allows).
- **MD-025:** Gateways MUST treat the set of documents as unordered for semantics and MUST process targets in a deterministic order (recommended: stable sort by `doc_id`).
- **MD-026:** Gateways MUST enforce `multi_document_policy` limits (`max_documents_per_request`, `max_total_ops`, `max_reference_creations`) and reject with `AI_MULTI_DOCUMENT_LIMIT_EXCEEDED` when violated.

### 3.4 Success Response (Example)

Note: Examples include a numeric `status` field for clarity; implementations MAY omit it and rely on HTTP status, but if present it MUST match the HTTP code.

```json
{
  "status": 200,
  "operation_id": "req_uuid",
  "applied_atomicity": "all_or_nothing",
  "applied_frontiers": {
    "doc_A": { "loro_frontier": ["peerA:12"] },
    "doc_B": { "loro_frontier": ["peerB:7"] }
  },
  "results": [
    { "doc_id": "doc_A", "success": true, "operations_applied": 3, "diagnostics": [] }
  ],
  "created_references": ["ref_req_uuid_0"],
  "diagnostics": []
}
```

### 3.5 Best-Effort Partial Result (Example)

When `atomicity="best_effort"`, gateways MAY return 200 with mixed per-document outcomes. Precondition conflicts are reported per document, while other documents may still be applied.

```json
{
  "status": 200,
  "operation_id": "req_uuid",
  "applied_atomicity": "best_effort",
  "results": [
    { "doc_id": "doc_A", "success": true, "operations_applied": 3, "diagnostics": [] },
    {
      "doc_id": "doc_C",
      "success": false,
      "operations_applied": 0,
      "conflict": {
        "code": "AI_PRECONDITION_FAILED",
        "phase": "ai_gateway",
        "retryable": true,
        "current_frontier": { "loro_frontier": ["peerC:5"] },
        "failed_preconditions": [{ "span_id": "span_9", "reason": "hash_mismatch" }]
      },
      "diagnostics": []
    }
  ],
  "diagnostics": [{ "kind": "partial_failure", "detail": "1/2 documents applied" }]
}
```

## 4. Execution Semantics

### 4.1 Per-Document Barriers

- **MD-030:** For each document entry, the gateway MUST advance its internal state to be **at least** the provided `doc_frontier` before any dry-run or apply (LFCC v0.9 RC §11.1 read barrier).

### 4.2 Dry-Run Pipeline

- **MD-031:** For each target document, the gateway MUST run sanitize → normalize → schema dry-run on `ops_xml` before committing any mutations (LFCC v0.9 RC §11.2).
- **MD-032:** Reference verification (anchors resolve; optional reference preconditions hold) MUST occur before commit for `all_or_nothing`.
- **MD-032-A (reference verification timing):** Reference verification MUST occur after all target documents have passed schema dry-run and after all staged mutations have been prepared, but before any commit. For `all_or_nothing`, verification MUST be evaluated against the staged (post-dry-run) shadow state, not against the pre-request state.

### 4.3 Idempotency (Required)

AI-native v2 requires request idempotency (AIN/GW-103). For multi-document:

- **MD-040:** `request_id` MUST be the idempotency key for the entire multi-doc operation.
- **MD-041:** Gateways MUST ensure replaying the same `request_id` does not re-apply any document mutations and returns the recorded results.
- **MD-042:** If a different payload is submitted with the same `request_id`, gateways MUST reject with a non-retryable error (`AI_IDEMPOTENCY_KEY_REUSED`).
- **MD-043:** `operation_id` MUST be stable for the idempotency window (recommended: `operation_id = request_id`).
- **MD-043-A (idempotency window):** When `multi_document_policy.enabled=true`, the negotiated `ai_native_policy.gateway.idempotency_window_ms` MUST be at least 7 days. Implementations MAY support longer windows.

### 4.4 Atomicity

- **MD-050:** `all_or_nothing` requires staging (shadow replicas or transactional snapshots). If staging is unsupported, the gateway MUST reject unless policy allows downgrade.
- **MD-051:** `best_effort` commits per document independently; failures MUST NOT roll back prior successes.
- **MD-053:** Gateways SHOULD tag emitted document updates (transport metadata) with `operation_id` to support UI grouping; this tag MUST NOT affect canonical CRDT state.

## 5. Cross-Document References

### 5.1 Reference Draft Payload

Each entry in `references[]` creates (or updates) an external reference record:

- `ref_type`: `citation` | `continuation` | `related` | `derived` | `bidirectional`
- `source`: `{ doc_id, block_id, start, end, if_match_context_hash?, excerpt? }`
- `target`: `{ doc_id, block_id, anchor }` (point anchor only; range targets are not supported in v0.9.2)

Anchor shapes reuse LFCC stable anchors (§5 in `LFCC_v0.9_RC.md`):

- `AnchorPoint`: `{ "anchor": "B64(...)", "bias": "left" | "right" }`
- `AnchorRange`: `{ "block_id": "uuid", "start": AnchorPoint, "end": AnchorPoint }`

### 5.2 Verification Rules

- **MD-060:** Gateways MUST verify that all reference anchors resolve at the provided frontiers before committing reference creation.
- **MD-061:** If `if_match_context_hash` is present on a source range, gateways MUST verify it against the canonicalized text slice addressed by `{block_id,start,end}` (same hash semantics as LFCC `context_hash`); mismatch is a retryable conflict.
- **MD-062:** References MUST NOT be stored inside canonical document content.
- **MD-063:** Reference IDs MUST be idempotent. If the client does not provide a `ref_id`, the gateway MUST generate deterministic ids derived from `request_id` and stable ordering (e.g., `ref_${request_id}_${index}`).
- **MD-064:** Reference relocation/repair MUST follow the same safety rule as span relocation: it MUST NOT write shared repair updates without explicit user confirmation.

### 5.3 Reference Store Contract (Normative Minimal)

To be interoperable, cross-document references MUST be persisted in a separately-replicated dataset using a stable record shape. The storage backend is implementation-defined (v0.9.3 may standardize it further), but the logical record contract below is normative.

**MD-065:** The reference store MUST converge under SEC and MUST be scoped to a policy domain.

**CrossDocReferenceRecord (logical shape):**

```json
{
  "ref_id": "ref_uuid",
  "ref_type": "citation|continuation|related|derived|bidirectional",
  "source": { "doc_id": "doc_id", "block_id": "block_id", "start": { "anchor": "B64(...)", "bias": "right" }, "end": { "anchor": "B64(...)", "bias": "left" }, "if_match_context_hash": "sha256_hex|null" },
  "target": { "doc_id": "doc_id", "block_id": "block_id", "anchor": { "anchor": "B64(...)", "bias": "right" } },
  "created_at_ms": 0,
  "created_by": { "agent_id": "agent_uuid", "request_id": "req_uuid" },
  "verified_at_ms": 0,
  "v": 1
}
```

**MD-066:** If a reference record is updated, the resolution MUST be deterministic (recommended: compare `created_by.agent_id`, then `created_by.request_id` as a stable tie-breaker).

## 6. Conflicts and Errors

### 6.1 409 Conflicts (Preconditions)

LFCC v0.9 reserves 409 for `AI_PRECONDITION_FAILED` only (Appendix C).

- **MD-070:** For `all_or_nothing`, if any precondition fails, the gateway MUST return a 409 `AI_PRECONDITION_FAILED` and MUST NOT commit any document mutations.
- **MD-071:** For `best_effort`, gateways MUST return 200 with per-document outcomes, even if all target documents fail preconditions. Precondition failures MUST be represented per document in `results[].conflict`.
- **MD-072:** If a reference precondition fails (e.g., `if_match_context_hash` mismatch), the 409 response (for `all_or_nothing`) MUST include a `failed_references` entry in the corresponding `failed_documents[]` item. `failed_references[].ref_index` MUST refer to the zero-based index within the request’s `references[]` array.
- **MD-073:** For `best_effort`, gateways SHOULD report precondition conflicts in `results[].conflict` using the same shapes as `failed_documents[]` (including `failed_preconditions` and `failed_references` when present).

Example (409):

```json
{
  "code": "AI_PRECONDITION_FAILED",
  "phase": "ai_gateway",
  "retryable": true,
  "failed_documents": [
    {
      "doc_id": "doc_B",
      "current_frontier": { "loro_frontier": ["peerB:9"] },
      "failed_references": [{ "ref_index": 0, "reason": "hash_mismatch" }]
    }
  ]
}
```

### 6.2 Extension Error Codes

This proposal introduces new AI-gateway error codes (to be added alongside Appendix C when adopted):

- `AI_MULTI_DOCUMENT_UNSUPPORTED` (400, `phase=negotiation|ai_gateway`, retryable=false)
- `AI_MULTI_DOCUMENT_LIMIT_EXCEEDED` (400, `phase=ai_gateway`, retryable=false)
- `AI_MULTI_DOCUMENT_ATOMICITY_UNSUPPORTED` (400, `phase=ai_gateway`, retryable=false)
- `AI_REFERENCE_INVALID` (422, `phase=ai_gateway`, retryable=false)
- `AI_IDEMPOTENCY_KEY_REUSED` (400, `phase=ai_gateway`, retryable=false)
- `AI_DOCUMENT_FORBIDDEN` (403, `phase=ai_gateway`, retryable=false)

Gateways MUST continue to use existing LFCC v0.9 AI errors for payload safety:
- `AI_PAYLOAD_REJECTED_SANITIZE` (400)
- `AI_PAYLOAD_REJECTED_LIMITS` (400)
- `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` (422)

## 7. Governance, Security, and Data Access

- **MD-080:** Authorization MUST be evaluated per `doc_id`. For `all_or_nothing`, any forbidden target document MUST reject the entire request. For `best_effort`, forbidden target documents MUST be reported as failures and other authorized target documents MAY proceed.
- **MD-081:** Data-access redaction MUST be applied per document before model invocation (SEC-AI-002).
- **MD-082:** Audit records MUST include `request_id`, `operation_id`, `agent_id`, `intent_id`, `atomicity`, and per-document results.
- **MD-083:** Quotas and limits MUST account for total documents + total operations across the request.

## 8. Implementation Notes (Mapping to Current Repo)

- This repo already defines `CrossDocumentOperation`, `DocumentOperations`, `AtomicityLevel`, and `CrossDocReference` in `packages/core/src/kernel/ai/crossDocument.ts`.
- Implementations will need a multi-doc envelope parser/validator, plus staging support for `all_or_nothing`.
- Current in-repo types treat `DocFrontier` as an opaque string and use `code: "CONFLICT"` for 409s; the protocol docs use `AI_PRECONDITION_FAILED`. If adopted, reconcile these to avoid mixed envelopes.
- Current in-repo cross-doc anchors use `{block_id, offset, version}`; this proposal aligns anchors with LFCC stable anchor encoding (`B64(...)` + bias) to reuse existing verification and relocation semantics.

## 9. Conformance Requirements (Recommended → Required by Policy)

Add conformance vectors/tests for:

1) **All-or-nothing**: one target doc fails preconditions → no target doc is mutated.  
2) **Best-effort**: one target doc fails → other targets commit; response reports partial failure deterministically.  
3) **Idempotency**: replay the same `request_id` yields identical results and does not re-apply.  
4) **Limits**: reject when `max_documents_per_request` / `max_total_ops` exceeded.  
5) **Reference verification**: unresolved anchors reject (422) and `if_match_context_hash` mismatch returns a 409 `AI_PRECONDITION_FAILED` (retryable).  
6) **Deterministic ordering**: document processing order does not affect results or generated reference ids.
7) **Legacy frontier tag**: parsing and normalization of `doc_frontier_tag` follows §3.1.1 ABNF and ordering.

## 10. Rollout Plan (Suggested)

1) **Schema + negotiation**: add `capabilities.multi_document` and `ai_native_policy.multi_document`.  
2) **Envelope + gateway**: parse/validate multi-doc envelopes, per-doc dry-run, aggregated conflicts.  
3) **Atomicity**: implement staging for `all_or_nothing`; downgrade only if policy allows.  
4) **References**: persist `CrossDocReference` in a replicated store; implement verification and diagnostics.  
5) **Runtime**: add orchestrator helpers for multi-doc retries and audit grouping.  
6) **Conformance + E2E**: add targeted multi-doc tests (recommended: `pnpm test:e2e:features`).

## 11. Decisions and Deferred Items

Decisions (v0.9.2):
- **Citations preconditions:** `if_match_context_hash` SHOULD be provided for `ref_type="citation"`. If `multi_document_policy.require_citation_preconditions=true`, it becomes REQUIRED.
- **Transactions:** `all_or_nothing` does not require `ai_transactions=true`; staging strategy is an implementation detail as long as fail-closed semantics are preserved.
- **Result scope:** `results[]` MUST include all target documents and MAY omit non-target documents. If a non-target document is included, `operations_applied` MUST be 0.

Deferred to v0.9.3+:
- Standardize the physical reference store backend (e.g., a dedicated Loro “workspace graph” document) beyond the logical record contract in §5.3.
