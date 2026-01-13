# LFCC v0.9.3 RC: Architect's Deep Review

**Status:** Final Architectural Critique
**Date:** 2026-01-14
**Author:** AI Architect
**Objective:** Push LFCC to v1.0 Perfection

---

## Executive Summary

LFCC v0.9.3 RC is **architecturally sound** but has **specification gaps** that will cause interoperability failures in real-world deployments. This review identifies **7 Critical Areas** requiring clarification or enhancement before v1.0 release.

| # | Area | Severity | Issue |
|---|------|----------|-------|
| 1 | Negotiation | HIGH | Missing `structure_mode` negotiation rules |
| 2 | Block ID Policy | MEDIUM | `overrides` schema undefined |
| 3 | History | HIGH | Undo/Redo of structural ops undefined |
| 4 | Canonicalizer | MEDIUM | `CanonNode.id` generation algorithm missing |
| 5 | AI Gateway | HIGH | `doc_frontier` format undefined |
| 6 | Conformance Kit | LOW | No normative test vectors |
| 7 | Extensions | MEDIUM | No extension negotiation protocol |

---

## 1. Negotiation: `structure_mode` Ambiguity

### Current Spec (§2.1)
```json
"structure_mode": "A|B"
```
### Gap
- §2.2 (Negotiation Algorithm) does not define how `structure_mode` is negotiated.
- **Question:** If Client A uses Mode A (Editor-Primary) and Client B uses Mode B (CRDT-Primary), what happens?

### Recommendation
Add to §2.2.1:
> **structure_mode:** All participants MUST match exactly. Mode A and Mode B are semantically incompatible. Mismatch → Hard Refusal.

---

## 2. Block ID Policy: `overrides` Schema Undefined

### Current Spec (§2.1 / §4.2)
```json
"block_id_policy": { "version": "v1", "overrides": {} }
```
### Gap
The `overrides` object is never defined. What keys/values are valid? Example given is `{}`.

### Recommendation
Add normative definition to §4.2:
```json
"overrides": {
  "OP_BLOCK_CONVERT": "KEEP_ID",  // Override default REPLACE_ID for converts
  "OP_LIST_REPARENT": "KEEP_ID"
}
```
Valid values: `"KEEP_ID" | "REPLACE_ID"`.

---

## 3. History: Structural Undo/Redo Edge Cases

### Current Spec (§9.3)
Covers `HISTORY_RESTORE` for annotations. Does NOT cover:
- What if user undoes a Block Split?
- What if user undoes a Block Join?
- What happens to annotations that spanned the joined block?

### Recommendation
Add §9.3.2:
> **HISTORY-STRUCT-001:** Undo of `OP_BLOCK_SPLIT` MUST restore the original block_id. The "new" block_id from split is retired.
> **HISTORY-STRUCT-002:** Undo of `OP_BLOCK_JOIN` MUST restore both original block_ids in their original positions.
> **HISTORY-STRUCT-003:** All affected annotations MUST re-enter `active_unverified` and trigger checkpoint.

---

## 4. Canonicalizer: `CanonNode.id` Generation

### Current Spec (§8.1)
```ts
type CanonBlock = {
  id: string; // deterministic snapshot-local id (NOT LFCC block_id)
  ...
};
```
### Gap
How is this `id` generated? Is it a hash? A counter? If different implementations use different algorithms, canonicalized outputs will differ.

### Recommendation
Add to §8.1:
> **CANON-ID-001:** `CanonNode.id` MUST be a deterministic integer counter starting at 0, assigned in depth-first pre-order traversal. Example: root=0, first child=1, ...

---

## 5. AI Gateway: `doc_frontier` Format

### Current Spec (§11.1)
> AI write requests MUST include: `doc_frontier` (observed)

### Gap
What is `doc_frontier`? Is it:
- A CRDT version vector?
- A Lamport timestamp?
- A document checksum?

### Recommendation
Add normative definition to §11.1:
> **doc_frontier:** A JSON object representing the CRDT's observed state boundary.
> For Loro: `{ "loro_frontier": ["OpId1", "OpId2", ...] }`
> For Yjs: `{ "yjs_state_vector": "base64_encoded_sv" }`
> For Automerge: `{ "automerge_heads": ["hash1", "hash2"] }`
> Implementations MUST define the frontier format in the manifest under `crdt_config.frontier_format`.

---

## 6. Conformance Kit: No Normative Test Vectors

### Current Spec (§14)
Describes kernel modules but provides no concrete test inputs/outputs.

### Gap
Without normative test vectors, two implementations can pass their own tests but fail cross-implementation checks.

### Recommendation
Add Appendix E: **Normative Test Vectors**
- Canonicalizer: Input HTML → Expected `CanonNode` tree (JSON)
- Checksum: Input doc → Expected `LFCC_DOC_V1` hash
- BlockMapping: Input operation → Expected mapping output
- Sanitizer: Malicious input → Expected sanitized output

---

## 7. Extensions: No Negotiation Protocol

### Current Spec (§2.1)
```json
"extensions": {}
```
### Gap
How do two clients negotiate extensions? If Client A has `extensions: { "my_ext": {...} }` and Client B does not, what happens?

### Recommendation
Add §2.2.10:
> **Extensions Negotiation:**
> - Unknown extensions in peer manifest are silently ignored (not hard-refused).
> - `effective_extensions = intersection` where both clients support same extension with compatible version.
> - Extensions MUST declare `version` and `min_compatible_version`.
> - Example:
>   ```json
>   "extensions": {
>     "math_blocks": { "version": "1.2", "min_compatible_version": "1.0" }
>   }
>   ```

---

## Summary: Action Items for v0.9.4 (Pre-1.0)

1. **§2.2.1:** Add `structure_mode` → Hard Refusal rule.
2. **§4.2:** Define `block_id_policy.overrides` schema.
3. **§9.3.2:** Add structural undo/redo rules (`HISTORY-STRUCT-*`).
4. **§8.1:** Define `CanonNode.id` generation algorithm (`CANON-ID-001`).
5. **§11.1:** Define `doc_frontier` format normatively.
6. **Appendix E:** Add normative test vectors.
7. **§2.2.10:** Add extensions negotiation protocol.

---

## Conclusion

LFCC v0.9.3 is **feature-complete** but **specification-incomplete**. Addressing the 7 gaps above will make it truly production-ready for v1.0.
