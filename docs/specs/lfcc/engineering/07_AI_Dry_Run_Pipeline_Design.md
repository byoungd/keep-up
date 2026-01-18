# AI Dry-Run Pipeline Design (Sanitize → Normalize → Schema Apply) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2026-01-13  
**Audience:** Backend engineers, AI platform engineers.  
**Source of truth:** LFCC v0.9 RC §11.2 (Dry-Run), §8 (Canonicalizer).

**See also:** `23_AI_Native_Extension.md` (optional v0.9.1 AI-native addendum).

---

## 0. Objective

Prevent AI from:
- injecting unsafe content (XSS, scripts, event handlers),
- producing unsupported editor schema structures,
- crashing the editor/bridge,
- producing non-deterministic structures.

Dry-run is **mandatory** for any AI payload that would mutate the editor.

---

## 1. Pipeline Overview

```mermaid
flowchart LR
  A[AI Payload] --> S[Sanitize (Whitelist)]
  S --> N[Normalize (Canonicalize)]
  N --> P[Schema Dry-Run Apply]
  P -->|ok| OK[Apply to Document]
  P -->|fail| R[Reject Fail-Closed]
```

### 1.1 AI-Native Preflight (Optional)
If AI-native is negotiated, perform envelope validation before sanitize/normalize:
- verify request idempotency window
- verify agent identity and policy context
- enforce explicit ops requirement for deterministic replay

See `23_AI_Native_Extension.md` for normative requirements.

---

## 2. Stage 1: Sanitize (Whitelist)

### 2.1 Inputs
- AI output fragments: HTML or Markdown (prefer structured XML ops)
- policy: `ai_sanitization_policy`

### 2.2 Rules (Normative baseline)
- Follow Appendix B (Sanitization Profile) in LFCC v0.9 RC.
- Remove or reject disallowed tags/blocks/marks/attrs per policy.
- Disallow script/style/event handlers.
- Enforce URL policy (`^(https?|mailto):[^\\s]+$`) and forbid `javascript:`, `data:`, `vbscript:`.
- Enforce `ai_sanitization_policy.limits`:
  - `max_payload_bytes`
  - `max_nesting_depth`
  - `max_attribute_count`

### 2.3 Output
A sanitized payload plus diagnostics:
- dropped nodes/attrs
- normalized URLs

**Fail-closed triggers:**
- if `reject_unknown_structure=true` and unknown tags remain
- if the payload becomes empty when it should not
- if any limits are exceeded

---

## 3. Stage 2: Normalize (Canonicalize)

### 3.1 Purpose
Convert sanitized payload into LFCC canonical tree:
- removes DOM nesting variability,
- produces deterministic structure,
- catches unknown marks/blocks deterministically.

### 3.2 Mechanism
- parse sanitized payload into an input tree
- run LFCC canonicalizer v2 (recursive)

### 3.3 Fail-closed triggers
- canonicalizer cannot map a required block type
- unknown marks not allowed by policy
- malformed structure causes parse errors

---

## 4. Stage 3: Schema Dry-Run Apply

### 4.1 Purpose
Ensure the editor can accept the payload deterministically without mutation.

### 4.2 Implementation options
- run editor schema parse in a sandbox document (no UI)
- run a headless instance of the editor parser only
- validate against a typed schema representation

### 4.3 Fail-closed triggers
- schema parse error
- results in non-serializable nodes
- produces editor-internal “repair” behaviors that are non-deterministic

---

## 5. Outputs and Contracts

### 5.1 On success
- return `canon_root` (canonical tree)
- return sanitized payload (optional)
- return updated frontier after apply

### 5.2 On failure
- return structured diagnostics
- do not apply any mutation
- use Appendix C error codes:
  - `AI_PAYLOAD_REJECTED_SANITIZE`
  - `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION`
  - `AI_PAYLOAD_REJECTED_LIMITS`

---

## 6. Security Checklist

- [ ] URL policy enforced
- [ ] script/style/event handler blocked
- [ ] payload size limits applied (to avoid resource abuse)
- [ ] canonicalizer failures are safe (no partial apply)
- [ ] schema dry-run cannot mutate shared state
