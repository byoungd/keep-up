# AI-Native Extension (v0.9.1) - Engineering Addendum

**Applies to:** LFCC v0.9.1 (optional extension)  
**Last updated:** 2026-01-12  
**Audience:** AI platform engineers, gateway maintainers, security, client integrators.  
**Source of truth:** LFCC v0.9 RC Section 11 (AI Gateway) + AI-native proposal.

---

## 0. Goals

1. Add AI-native capabilities without weakening determinism or SEC.
2. Keep v0.9 behavior as the default when AI-native is not negotiated.
3. Provide implementable requirements for identity, governance, and provenance.

---

## 1. Compatibility and Negotiation

AI-native support is **opt-in** and requires explicit policy agreement.

**AIN-001:** AI-native features MUST be gated by negotiated capability flags and policy fields.  
**AIN-002:** If AI-native is not negotiated, implementations MUST fall back to LFCC v0.9 AI behavior.

Recommended capability flags:
- `ai_gateway_v2`
- `ai_native`
- `ai_provenance`
- `ai_data_access`
- `ai_audit`
- `ai_transactions`
- `semantic_merge`
- `multi_agent`

---

## 2. AI Gateway v2 Envelope (AI-native)

### 2.1 Request (Normative Fields)

```json
{
  "request_id": "uuid",
  "agent_id": "agent_uuid",
  "doc_frontier": "FRONTIER_ENCODED",
  "intent_id": "intent_uuid",
  "intent": { "id": "intent_uuid", "category": "rewrite", "summary": "Improve clarity" },
  "preconditions": [
    { "span_id": "span_uuid", "if_match_context_hash": "sha256_hex" }
  ],
  "ops_xml": "<replace_spans annotation=\"anno_uuid\">...</replace_spans>",
  "policy_context": {
    "policy_id": "policy_uuid",
    "redaction_profile": "default"
  }
}
```

**GW-101:** Requests MUST include `request_id`, `agent_id`, `doc_frontier`, `preconditions`, and `ops_xml`.  
**GW-102:** Requests MUST include either `intent_id` or an inline `intent` object.  
**GW-103:** Gateways MUST enforce idempotency for `request_id` within a policy-defined window.

### 2.2 Response (Recommended)

```json
{
  "status": "accepted",
  "applied_frontier": "FRONTIER_AFTER_APPLY",
  "applied_ops": ["op_id_1", "op_id_2"],
  "audit_id": "audit_uuid",
  "dry_run_report": { "stage": "schema_apply", "ok": true }
}
```

---

## 3. Deterministic Execution Model

**DET-AI-001:** AI-generated changes MUST be expressed as explicit LFCC operations.  
**DET-AI-002:** Replicas MUST be able to apply AI operations without invoking an LLM.  
**DET-AI-003:** AI metadata MUST NOT change canonical document state.

---

## 4. Identity, Governance, and Data Access

**SEC-AI-001:** AI requests MUST be authenticated and authorized by policy.  
**SEC-AI-002:** AI read access MUST be filtered by a data access policy before model invocation.

Recommended data access policy fields:
- `max_context_chars`
- `allow_blocks` / `deny_blocks`
- `redaction_strategy` (`mask` or `omit`)
- `pii_handling` (`block`, `mask`, `allow`)
- `allow_external_fetch`

---

## 5. Provenance and Audit

**PROV-001:** AI provenance metadata MUST be stored separately from canonical document state.  
**AUD-001:** AI gateways MUST emit append-only audit records for accepted and rejected requests.

Recommended provenance fields:
- `agent_id`
- `request_id`
- `intent_id`
- `model_id`
- `timestamp_ms`

---

## 6. Multi-Agent Coordination (Optional)

**COORD-001:** Coordination claims MUST be advisory and MUST NOT override LFCC conflict rules.

Recommended coordination primitives:
- `claim` blocks or ranges with timeout
- `handoff` with explicit context transfer
- `release` on completion or timeout

---

## 7. Semantic Merge (Optional)

**MERGE-001:** AI-proposed merges MUST be persisted as explicit LFCC operations.  
**MERGE-002:** Automatic merges MUST respect a policy-defined confidence threshold.

---

## 8. Transactions (Optional)

**TXN-001:** Multi-step AI edits SHOULD be wrapped in transactions when enabled.  
**TXN-002:** Transaction failure MUST follow the negotiated rollback strategy.

---

## 9. Policy Manifest Extension (Reference)

```ts
export type AiNativePolicyV1 = {
  version: "v1";
  gateway: {
    max_ops_per_request: number;
    max_payload_bytes: number;
    idempotency_window_ms: number;
  };
  security: {
    require_signed_requests: boolean;
    agent_token_ttl_ms: number;
    audit_retention_days: number;
    allow_external_models: boolean;
  };
  data_access: {
    max_context_chars: number;
    redaction_strategy: "mask" | "omit";
    pii_handling: "block" | "mask" | "allow";
    allow_external_fetch: boolean;
  };
  determinism: {
    require_explicit_ops: boolean;
  };
  intent_tracking: {
    enabled: boolean;
    require_intent: boolean;
    intent_retention_days: number;
  };
  provenance: {
    enabled: boolean;
    track_inline: boolean;
    require_model_id: boolean;
  };
  semantic_merge: {
    enabled: boolean;
    ai_autonomy: "disabled" | "suggest_only" | "full";
    auto_merge_threshold: number;
  };
  transactions: {
    enabled: boolean;
    default_timeout_ms: number;
    max_operations_per_txn: number;
  };
  ai_opcodes: {
    allowed: string[];
    require_approval: string[];
  };
};
```

Negotiation rules are defined in `docs/specs/engineering/02_Policy_Manifest_Schema.md`.
