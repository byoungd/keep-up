# LFCC Version Index

**Last updated:** 2026-01-18
**Maintainer:** Keep-Up Team

---

## Version Summary

| Version | Type | Status | Document |
|---------|------|--------|----------|
| **v0.9 RC** | Core | ✅ Stable | `LFCC_v0.9_RC.md` |
| **v0.9.1** | Extension | ✅ Stable | `proposals/LFCC_v0.9.1_AI_Native_Enhancement.md` |
| **v0.9.2** | Extension | ✅ Implementable | `proposals/LFCC_v0.9.2_Multi_Document_Support.md` |
| **v0.9.3+** | Extension | 📋 Planned | Reference store backend standardization |

---

## v0.9 RC (Core Specification)

**Status:** Release Candidate
**Scope:** Deterministic interoperability rules for CRDT ⇄ Editor Bridge ⇄ Metadata/Annotations ⇄ LLM Gateway

### Non-Negotiable Guarantees

1. **SEC**: Strong eventual consistency
2. **No silent drift**: Annotations fail-closed if uncertain
3. **Determinism**: Same updates → identical state
4. **Model-agnostic AI**: Stable IDs/anchors only
5. **Local-first UX**: Offline is first-class
6. **Fail-closed**: Shared truth never guesses

### Key Documents

- Core: `LFCC_v0.9_RC.md`
- Schema: `engineering/02_Policy_Manifest_Schema.md`
- Conformance: `engineering/08_Conformance_Test_Suite_Plan.md`

---

## v0.9.1 (AI-Native Extension)

**Status:** Optional Extension
**Prerequisite:** v0.9 RC
**Capability Flag:** `capabilities.ai_native = true`

### Features

- AI Gateway v2 envelope support
- Intent tracking and provenance
- Semantic merge with AI autonomy levels
- Multi-agent coordination
- Data access and redaction policies

### Key Documents

- Proposal: `proposals/LFCC_v0.9.1_AI_Native_Enhancement.md`
- Engineering: `engineering/23_AI_Native_Extension.md`
- Schema: `engineering/policy_manifest_v0.9.1.schema.json`

---

## v0.9.2 (Multi-Document Extension)

**Status:** Implementable (Verified 2026-01-18)
**Prerequisite:** v0.9.1 (AI-Native)
**Capability Flag:** `capabilities.multi_document = true`

### Features

- Per-document frontiers, preconditions, and operations
- Atomicity modes: `all_or_nothing`, `best_effort`
- Cross-document references with stable anchors
- Policy controls for limits and access

### Key Requirements

| ID | Requirement |
|----|-------------|
| MD-010 | MultiDocumentPolicyV1 with version, enabled, limits |
| MD-010-A | Deterministic ops counting algorithm |
| MD-025 | Deterministic target processing order |
| MD-032-A | Reference verification timing (post-dry-run, pre-commit) |
| MD-043-A | 7-day minimum idempotency window |
| MD-050 | Staging required for all_or_nothing |
| MD-065 | CrossDocReferenceRecord logical shape |

### Key Documents

- Proposal: `proposals/LFCC_v0.9.2_Multi_Document_Support.md`
- Verification: `proposals/verification_0.9.2.md`
- Schema: `engineering/02_Policy_Manifest_Schema.md` (§1.2.1, §3.2)

---

## v0.9.3+ (Planned)

### Deferred Items from v0.9.2

- Standardize physical reference store backend (e.g., Loro "workspace graph" document)
- Range targets for cross-document references

---

## Conformance Testing

### Required for "LFCC v0.9.2 Compliant"

1. All v0.9 RC conformance tests pass
2. All v0.9.1 AI-Native conformance tests pass (if enabled)
3. Multi-document specific tests:
   - All-or-nothing atomicity (one fail → none commit)
   - Best-effort partial results
   - Idempotency replay
   - Limit enforcement
   - Reference verification
   - Deterministic ordering

See: `engineering/08_Conformance_Test_Suite_Plan.md`

---

## Version Negotiation

```ts
// Effective version = min(all participants)
// Extensions = intersection of capabilities

const effectiveVersion = negotiateVersion(manifests);
// "0.9"   → core only
// "0.9.1" → core + AI-native
// "0.9.2" → core + AI-native + multi-document
```

See: `engineering/02_Policy_Manifest_Schema.md` §3
