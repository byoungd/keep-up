# Track G: AI Envelope and LFCC Alignment

Owner: Tech Lead + Runtime Developer + QA  
Status: Planned  
Spec Reference:
- `docs/specs/lfcc/LFCC_v0.9_RC.md` Section 11
- `docs/specs/lfcc/proposals/LFCC_v0.9.2_Multi_Document_Support.md`
- `docs/specs/lfcc/proposals/LFCC_v0.9.3_Reference_Store_Backend.md`

## Objective
Enforce AI Envelope and LFCC alignment per `docs/specs/agent-runtime-spec-2026.md` Sections 5.8 and 10, implementing:
1. **Targeting Safety** vs **Payload Safety** separation (v0.9 RC §11)
2. **Multi-Document AI operations** (v0.9.2)
3. **Reference Store Backend** with SEC convergence (v0.9.3)

## Scope
- AI Gateway enforcement for document mutations
- Targeting Safety: `doc_frontier` and `if_match_context_hash` preconditions
- Payload Safety: 3-step Dry-Run Sanitization pipeline
- Multi-Document: per-document frontiers, atomicity modes, cross-doc references
- Reference Store: Loro workspace graph with SEC convergence

## Non-Goals
- SOP role design (Track E)
- Model routing (Track F)
- CRDT engine internals (Loro-specific; out of application scope)

## Responsibilities
- **TL:** Define validation policy, failure modes, and manifest defaults
- **Dev:** Implement gateway, dry-run pipeline, multi-doc coordinator, reference store
- **QA:** Validate conflict handling, fail-closed behavior, SEC convergence

---

## Key Deliverables

### 1. AI Envelope Request Format (v0.9 RC)
- `doc_frontier` (Loro OpId format: `peer:counter`)
- `if_match_context_hash` per targeted span
- Target IDs: `block_id` and `span_id` only (no token offsets)

### 2. Dry-Run Sanitization Pipeline (v0.9 RC §11.2)
- **Sanitize (Whitelist):** Enforce `ai_sanitization_policy` (allowed marks, block types, limits)
- **Normalize:** Recursive canonicalization via `lfcc-kernel` canonicalizer
- **Schema Dry-Run:** Apply payload to sandbox transaction; reject if unparseable

### 3. Multi-Document Support (v0.9.2)
- Per-document frontiers, preconditions, and `ops_xml`
- Atomicity modes: `all_or_nothing`, `best_effort`
- Cross-document references with stable anchors
- Policy: `max_documents_per_request`, `max_total_ops`, `max_reference_creations`

### 4. Reference Store Backend (v0.9.3)
- Loro "workspace graph" document for reference storage
- `CrossDocReferenceRecord` with SEC convergence
- Reference lifecycle: CREATE → VERIFY → UPDATE → DELETE
- Query interface: `getReferencesFromDoc`, `getReferencesToDoc`

---

## Tasks

### Phase 1: Gateway Foundation (v0.9 RC)
1. [ ] Define AI Envelope request schema (`doc_frontier`, `if_match_context_hash`, target IDs)
2. [ ] Implement AI Gateway middleware that intercepts all AI mutation requests
3. [ ] Validate `doc_frontier` against current CRDT frontier before apply

### Phase 2: Dry-Run Pipeline (v0.9 RC)
4. [ ] Integrate `lfcc-kernel` Sanitizer module (whitelist, URL policy, limits)
5. [ ] Integrate `lfcc-kernel` Canonicalizer (recursive tree mode, v2)
6. [ ] Implement Schema Dry-Run harness using editor's sandbox transaction API
7. [ ] Wire 3-step pipeline; fail-closed on any step failure

### Phase 3: Error Handling & Retry (v0.9 RC)
8. [ ] Implement 409 Conflict with `AI_PRECONDITION_FAILED`
9. [ ] Implement Smart Retry (Rebase → Relocate → Retry with exponential backoff)
10. [ ] Ensure all AI failures use protocol error codes (Appendix C)

### Phase 4: Multi-Document Envelope (v0.9.2)
11. [ ] Parse/validate multi-doc envelopes with `documents[]`
12. [ ] Implement per-document dry-run and aggregated conflicts
13. [ ] Implement staging for `all_or_nothing` atomicity
14. [ ] Add idempotency handling (`request_id` as idempotency key, 7-day window)

### Phase 5: Reference Store Backend (v0.9.3)
15. [ ] Create Loro workspace graph document structure (RS-010)
16. [ ] Implement `ReferenceStore` interface:
    - `createReference`, `updateReferenceStatus`, `refreshVerification`
    - `getReference`, `getReferencesFromDoc`, `getReferencesToDoc`
17. [ ] Implement reference lifecycle state machine (active ↔ orphan ↔ deleted)
18. [ ] Wire sync protocol (export/import updates)
19. [ ] Add error codes: `REF_STORE_NOT_CONFIGURED`, `REF_ANCHOR_UNRESOLVED`, etc.

### Phase 6: Testing & Validation
20. [ ] Unit tests for AI envelope validation
21. [ ] Unit tests for Dry-Run pipeline steps
22. [ ] Integration tests for 409 Conflict and retry
23. [ ] Multi-doc tests: atomicity, idempotency, limits
24. [ ] Reference store tests: SEC convergence, lifecycle, sync

---

## Acceptance Criteria

### v0.9 RC Compliance
- All AI edits pass through gateway with required fields
- Invalid payloads fail closed before editor mutation
- `doc_frontier` or `context_hash` mismatch returns 409

### v0.9.2 Compliance
- Multi-doc envelopes parsed with per-document preconditions
- `all_or_nothing`: one fail → none commit
- `best_effort`: partial success reported correctly

### v0.9.3 Compliance
- Reference store converges under SEC (RS-001)
- Reference lifecycle operations work correctly (RS-020-025)
- Sync round-trip preserves state (RS-030-032)

## Required Tests
- Unit: AI envelope, Sanitizer, Canonicalizer
- Integration: 409 Conflict, retry, multi-doc atomicity
- Conformance: SEC convergence, reference lifecycle, sync

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-g`
- Run required tests, commit, open PR
