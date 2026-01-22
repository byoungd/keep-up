# LFCC Version Index

**Last updated:** 2026-01-22
**Maintainer:** Keep-Up Team

---

## Version Summary

| Version | Type | Status | Document |
|---------|------|--------|----------|
| **v0.9 RC** | Core | ✅ Stable | `LFCC_v0.9_RC.md` |
| **v0.9.1** | Extension | ✅ Stable | `proposals/LFCC_v0.9.1_AI_Native_Enhancement.md` |
| **v0.9.2** | Extension | ✅ Implementable | `proposals/LFCC_v0.9.2_Multi_Document_Support.md` |
| **v0.9.3** | Extension | 📝 Draft | `proposals/LFCC_v0.9.3_Reference_Store_Backend.md` |
| **v0.9.4** | Extension | 📝 Draft | `proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md` |
| **v0.9.5+** | Extension | 📋 Planned | Range targets, reference grouping |

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

## v0.9.3 (Reference Store Backend)

**Status:** Draft  
**Prerequisite:** v0.9.2 (Multi-Document)  
**Capability Flag:** N/A (infrastructure, not capability-gated)

### Features

- Loro "workspace graph" document for reference storage
- SEC convergence for cross-document references
- Reference lifecycle: create/update/delete/verify
- Append-only audit log for lifecycle transitions
- Query interface for reference lookups
- Sync protocol using standard Loro updates

### Key Requirements

| ID | Requirement |
|----|-------------|
| RS-001 | Reference store MUST converge under SEC |
| RS-010 | Workspace graph document structure |
| RS-011 | LoroMap with LWW semantics |
| RS-013 | Deterministic ref-store doc_id |
| RS-020-025 | Reference lifecycle operations |
| RS-030-032 | Sync protocol requirements |
| RS-040 | State transitions audit logging |

### Key Documents

- Proposal: `proposals/LFCC_v0.9.3_Reference_Store_Backend.md`

---

## v0.9.4 (AI Targeting Resilience)

**Status:** Draft  
**Prerequisite:** v0.9.1 (AI-Native)  
**Capability Flag:** `capabilities.ai_targeting_v1 = true`

### Features

- Multi-signal preconditions (context hash + window hash + neighbor hash + structure hash)
- Deterministic relocation algorithm with policy-controlled scope
- Layered preconditions (strong constraints + weak constraints with auto-recovery)
- Delta reads API for incremental state refresh
- Conflict auto-trimming with preserved ratio thresholds
- SDK encapsulation for read→think→act loop
- Enhanced diagnostics with fine-grained error codes
- Observability metrics and audit logging
- Optional deterministic Markdown payload conversion

### Key Requirements

| ID | Requirement |
|----|-------------|
| AT-001 | Capability mismatch rejection for v1 targeting |
| AT-100-105 | Precondition v1 field requirements |
| AT-200-220 | Signal hash specifications (window, neighbor, structure) |
| AT-300-330 | Relocation policies and candidate ranking |
| AT-600-604 | Layered preconditions (strong/weak separation) |
| AT-700-703 | Delta reads API requirements |
| AT-800-803 | Conflict auto-trimming requirements |
| AT-900 | SDK normalization preview requirement |
| AT-1000-1002 | Enhanced diagnostics requirements |
| AT-1100 | Rate limiting response requirement |
| AT-1200-1202 | Markdown payload conversion requirements |

### Key Documents

- Proposal: `proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md`

---

## v0.9.5 (Markdown Content Mode)

**Status:** Draft  
**Prerequisite:** v0.9.4 (AI Targeting Resilience)  
**Capability Flag:** `capabilities.markdown_content_mode = true`

### Features

- Parallel content mode for Markdown documents (source-preserving)
- New `md_*` block types (frontmatter, code_fence, heading, etc.)
- Line-range and semantic targeting for Markdown files
- Frontmatter parsing and targeted updates (YAML/TOML/JSON)
- Code fence language filtering and syntax-aware targeting
- Source-preserving and normalized canonicalization modes
- Markdown-specific sanitization and parser profiles

### Key Requirements

| ID | Requirement |
|----|-------------|
| MCM-001-003 | Capability gating and extension enablement |
| MCM-100-102 | Line model requirements |
| MCM-110-113 | Parsing profile and frontmatter requirements |
| MCM-120-121 | Block identity requirements |
| MCM-200-211 | Targeting and precondition requirements |
| MCM-300-303 | Canonicalization requirements |
| MCM-400-408 | Sanitization and URL policy requirements |
| MCM-450-451 | Validation (syntax/frontmatter) requirements |
| MCM-500-509 | Operation application requirements |
| MCM-600-601 | Policy negotiation requirements |
| MCM-700-703 | Delta response requirements |

### Key Documents

- Proposal: `proposals/LFCC_v0.9.5_Markdown_Content_Mode.md`

---

## v0.9.6+ (Planned)

### Deferred Items

- Range targets (targeting span ranges instead of points)
- Reference grouping and bulk operations
- Advanced semantic merge strategies
- Cross-file wikilink tracking


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
