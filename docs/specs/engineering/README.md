\
# LFCC v0.9 RC — Engineering Documentation Pack

**Generated:** 2025-12-31  
**Applies to:** LFCC v0.9 RC

This bundle contains implementation-ready documents for different teams:

## 1) Architecture & Interfaces
- `01_Kernel_API_Specification.md` — lfcc-kernel APIs and module layout
- `02_Policy_Manifest_Schema.md` — JSON Schema + TS interfaces + negotiation pseudocode
- `policy_manifest_v0.9.1.schema.json` - JSON Schema with ai_native_policy (optional extension)
- `03_Shadow_Model_and_Bridge_Architecture.md` — Mode B shadow model and bridge flows

## 2) Frontend Implementation Guides
- `04_Annotation_State_Machine_and_UX_Spec.md` — tokenized timers, visual states, XState reference
- `05_History_Integration_Guide.md` — HISTORY_RESTORE rules and undo/redo integration

## 3) AI Gateway & Backend Specs
- `06_AI_Envelope_Specification.md` — request/response envelopes, 409 conflicts, retry strategy
- `07_AI_Dry_Run_Pipeline_Design.md` — sanitize → normalize → schema dry-run apply

## 4) QA & Testing Documents
- `08_Conformance_Test_Suite_Plan.md` — fuzzing, Mode B semantic double-blind, dirty checks
- `09_DevTools_Manual.md` — debug overlay, force full scan, state visualization

## 5) Algorithm Whitepapers
- `10_Recursive_Canonicalization_Deep_Dive.md`
- `11_Dirty_Region_and_Neighbor_Expansion.md`

## 6) Protocol Clarifications & Extensions
- `12_UTF16_Surrogate_Pair_Handling.md` — UTF-16 surrogate pair detection, validation, error handling
- `13_Chain_Policy_Degradation_Guide.md` — Degradation state machine, migration procedures, UX guidelines
- `14_Concurrent_Operations_Handling.md` — Operation ordering, conflict detection, resolution strategies
- `15_BlockMapping_Verification_Guide.md` — Axiom verification, property-based testing, performance optimization
- `16_Edge_Cases_and_Boundary_Conditions.md` — Empty documents, zero-length spans, limits, edge case handling
- `17_Custom_Types_Extension_Guide.md` — Custom type registration, validation, canonicalization, migration
- `18_Security_Best_Practices.md` — AI validation security, hash collisions, anchor security, relocation boundaries
- `19_Version_Migration_Guide.md` — Version compatibility matrix, migration procedures, backward compatibility
- `20_Platform_Requirements_and_Conformance.md` — UTF-16 encoding, timestamp precision, cross-platform testing
- `21_Fuzzing_Strategy_and_Bug_Reproduction.md` — Seed management, bug reproduction, CI integration
- `22_Anchor_Upgrade_Path.md` — Design for anchor checksum upgrade (CRC32 -> HMAC-SHA256)
- 23_AI_Native_Extension.md - Optional v0.9.1 AI-native extension (gateway v2, policy, governance)

## 7) Governance & Traceability
- `99_Normative_Index.md` — Indexed list of all MUST/REQUIRED clauses with source links
