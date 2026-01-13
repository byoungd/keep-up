# Local-First Collaboration Contract (LFCC) v0.9 — Release Candidate

**Status:** Release Candidate (RC)  
**Last updated:** 2025-12-31  
**Primary audience:** Architects and senior engineers building collaborative rich-text editors with annotations and AI assistance.  
**Scope:** Deterministic interoperability rules across: **CRDT engine ⇄ Editor Bridge ⇄ Metadata/Annotations ⇄ LLM Gateway**.

> v0.9 RC closes the remaining “deep water” gaps from v0.8 by making three areas *normative*:
> 1) **Recursive Canonicalization** for nested structures (tables/lists/quotes)  
> 2) **History Integration** (Undo/Redo restore semantics)  
> 3) **AI Payload Dry-Run Sanitization** (schema- and security-safe application)  
>
> It also formalizes a **Conformance Kit** (“lfcc-kernel”) so teams do not re-implement critical algorithms inconsistently.

---

## 0. Non‑Negotiable Guarantees (MUST)

1. **Strong eventual consistency (SEC):** given the same update set, all replicas converge.
2. **No silent drift:** annotations MUST NOT silently reattach to unrelated content.
3. **Deterministic outcomes:** same updates → same:
   - document state,
   - block identity decisions,
   - annotation placements (or identical orphan/partial),
   - rendering keys.
4. **Model‑agnostic AI operations:** never store or rely on token offsets; stable IDs/anchors only.
5. **Local‑first UX:** apply locally immediately; sync asynchronously; offline is first-class.
6. **Fail‑closed shared truth:** if correctness cannot be proven, shared metadata MUST NOT guess.

---

## 1. Global Invariants (MUST)

### 1.1 Canonical Coordinates
**INV-COORD-001:** All positions are **UTF‑16 code unit indices**.  
**INV-COORD-002:** Operations MUST NOT split surrogate pairs; if a boundary lands mid-pair → fail closed.

#### UTF-16 Surrogate Pair Handling (Normative)
**INV-COORD-003:** Surrogate pair detection MUST be performed before any position-based operation.

**Surrogate Pair Ranges:**
- High surrogate: U+D800 to U+DBFF (0xD800-0xDBFF)
- Low surrogate: U+DC00 to U+DFFF (0xDC00-0xDFFF)
- Valid pair: high surrogate followed by low surrogate (exactly 2 code units)

**Detection Algorithm (REQUIRED):**
1. Before any position-based operation, validate that the position is not within a surrogate pair:
   - If `pos` points to a high surrogate (0xD800-0xDBFF), it MUST be the start of a valid pair
   - If `pos` points to a low surrogate (0xDC00-0xDFFF), it MUST be the second unit of a valid pair
   - If `pos` is between a high and low surrogate, the operation MUST fail closed

2. Range operations MUST validate both start and end positions:
   - Both positions must be valid (not mid-pair)
   - If start is high surrogate, end must be at least start+2
   - If end is low surrogate, start must be at most end-2

**Fail-Closed Behavior by Operation Type:**
- **Text edits:** Reject the operation, preserve document state, return error code `SURROGATE_PAIR_VIOLATION`
- **Annotation operations:** Mark annotation as `orphan`, preserve document, log diagnostic
- **Anchor resolution:** Return `null`/`unresolved`, trigger verification checkpoint
- **BlockMapping:** Return `null` for affected positions, preserve document integrity

**Diagnostic Codes:**
- `SURROGATE_PAIR_VIOLATION`: Operation attempted at invalid surrogate pair boundary
- `SURROGATE_PAIR_INVALID`: Detected invalid surrogate pair sequence
- `SURROGATE_PAIR_MID_RANGE`: Range operation spans mid-pair boundary

> See §12 (UTF-16 Surrogate Pair Handling Guide) for detailed implementation examples and test cases.

### 1.2 Persistence
**INV-PERSIST-001:** Persist **stable anchors** only. Absolute indices are derived/cache-only.

### 1.3 Determinism & Fail-Closed
**INV-DET-001:** Same CRDT updates → identical state and placements (or identical orphan/partial).  
**INV-SAFE-001:** If mapping/target cannot be proven, the system MUST NOT guess for shared truth.

---

## 2. Policy Manifest + Capabilities + Negotiation (REQUIRED)

LFCC requires a versioned **Policy Manifest** and a deterministic **Negotiation Protocol**.

### 2.1 Manifest (Normative Fields)
```json
{
  "lfcc_version": "0.9",
  "policy_id": "uuid",

  "coords": { "kind": "utf16" },
  "anchor_encoding": { "version": "vX", "format": "base64|bytes" },

  "structure_mode": "A|B",

  "block_id_policy": { "version": "v1", "overrides": {} },

  "chain_policy": {
    "version": "v5",
    "defaults": {
      "highlight": { "kind": "strict_adjacency", "max_intervening_blocks": 0 },
      "comment":   { "kind": "required_order",    "max_intervening_blocks": 0 },
      "suggestion":{ "kind": "strict_adjacency",  "max_intervening_blocks": 0 }
    }
  },

  "partial_policy": {
    "version": "v4",
    "defaults": { "highlight": "allow_drop_tail", "comment": "allow_islands", "suggestion": "none" }
  },

  "integrity_policy": {
    "version": "v3",
    "context_hash": { "enabled": true, "mode": "lazy_verify", "debounce_ms": 500 },
    "chain_hash":   { "enabled": true, "mode": "eager" },
    "checkpoint":   { "enabled": true, "every_ops": 200, "every_ms": 5000 }
  },

  "canonicalizer_policy": {
    "version": "v2",
    "mode": "recursive_tree",
    "mark_order": ["bold","italic","underline","strike","code","link"],
    "normalize_whitespace": true,
    "drop_empty_nodes": true
  },

  "history_policy": {
    "version": "v1",
    "trusted_local_undo": true,
    "restore_enters_unverified": true,
    "restore_skip_grace": true,
    "force_verify_on_restore": true
  },

  "ai_sanitization_policy": {
    "version": "v1",
    "sanitize_mode": "whitelist",
    "allowed_marks": ["bold","italic","underline","strike","code","link"],
    "allowed_block_types": ["paragraph","heading","list_item","code","quote","table","table_row","table_cell"],
    "reject_unknown_structure": true,
    "limits": { "max_payload_bytes": 1048576, "max_nesting_depth": 100, "max_attribute_count": 1000 }
  },

  "relocation_policy": {
    "version": "v2",
    "default_level": 1,
    "enable_level_2": false,
    "enable_level_3": false,
    "level_2_max_distance_ratio": 0.10,
    "level_3_max_block_radius": 2
  },

  "dev_tooling_policy": {
    "version": "v2",
    "force_full_scan_button": true,
    "state_visualizer": true
  },

  "capabilities": {
    "cross_block_annotations": true,
    "bounded_gap": true,
    "tables": true,
    "reorder_blocks": true,
    "ai_replace_spans": true
  },

  "conformance_kit_policy": {
    "version": "v1",
    "kernel_recommended": true,
    "kernel_required_in_repo": false
  },

  "extensions": {},
  "v": 1
}
```

### 2.2 Negotiation (REQUIRED)
During handshake, participants compute an **effective manifest**:
- `effective_capabilities` = intersection of all participants’ capabilities.
- for policy parameters:
  - choose **most restrictive** compatible settings (e.g., `max_intervening_blocks = min(...)`).
  - chain kind preference: `strict_adjacency` (most restrictive) > `bounded_gap` > `required_order`.

**NEG-001:** Negotiation MUST be deterministic and commutative.  
**NEG-002:** Disabled features MUST degrade safely (see §12), not hard-refuse, **unless** correctness-critical fields mismatch.

### 2.2.1 Deterministic Negotiation Algorithm (Normative)
1. **Schema validation:** All manifests MUST validate against the v0.9 schema.  
2. **Hard-refusal fields:** All participants MUST match exactly on:
   - `coords.kind`
   - `anchor_encoding.version`
   - `canonicalizer_policy` (version, mode, mark_order, normalize_whitespace, drop_empty_nodes)
   - `history_policy` (all fields)
3. **Unknown fields:** Any unknown top-level field MUST be rejected unless it lives under `extensions`.
4. **Capabilities:** `effective_capabilities = AND` across participants.
5. **Chain policy:** choose most restrictive kind (order above); `max_intervening_blocks = min(...)`.  
   If `effective_capabilities.bounded_gap=false`, force `strict_adjacency`.
6. **Partial policy:** choose most restrictive per kind: `none` > `allow_drop_tail` > `allow_islands`.
7. **Integrity policy:** for `context_hash`/`chain_hash` mode, choose `eager` if any participant requires it; `checkpoint` cadence uses `min(every_ops)` and `min(every_ms)`.
8. **Relocation policy:** `default_level = min(...)`; `enable_level_2/3 = AND`; `level_2_max_distance_ratio = min(...)`; `level_3_max_block_radius = min(...)`.
9. **AI sanitization policy:** `allowed_marks` and `allowed_block_types` use intersection; `reject_unknown_structure = AND`; `limits` use min across participants.

### 2.3 Non‑Negotiable Mismatches (Hard Refusal)
If any participant differs on:
- coordinate system (UTF‑16),
- anchor encoding/version,
- block identity policy version (incompatible),
then co-edit MUST be refused (read-only is allowed).

---

## 3. Core Data Model (REQUIRED)

### 3.1 Blocks (REQUIRED)
Blocks are structural units (paragraphs, headings, list items, code blocks, table cells, etc.).

```json
{
  "block_id": "uuid",
  "type": "paragraph|heading|list_item|code|quote|table_cell|custom",
  "range": { "start_anchor": "B64(...)", "end_anchor": "B64(...)" },
  "attrs": {},
  "parent": { "block_id": "uuid|null", "path": "string|null" },
  "v": 2
}
```

### 3.2 Annotations (REQUIRED)
Cross-block annotations MUST use SpanList.

```json
{
  "id": "uuid",
  "kind": "highlight|comment|suggestion|custom",
  "thread_id": "uuid|null",

  "target": {
    "mode": "multi_block_spanlist",
    "spans": [
      {
        "span_id": "uuid",
        "block_id": "uuid",
        "start": { "anchor": "B64(...)", "bias": "right" },
        "end":   { "anchor": "B64(...)", "bias": "left" },
        "context_hash": "sha256_hex|null",
        "v": 2
      }
    ],
    "chain": {
      "policy": { "kind": "strict_adjacency|required_order|bounded_gap", "max_intervening_blocks": 0 },
      "order": ["block_id_1","block_id_2"],
      "chain_hash": "sha256_hex",
      "v": 3
    }
  },

  "payload": {},
  "status": { "state": "active|active_partial|orphan|hidden|deleted", "reason": "string|null" },
  "v": 4
}
```

**SPAN-001:** Each span MUST be within exactly one block.  
**SPAN-002:** Span order MUST be preserved; no reordering.

---

## 4. Block Identity + Operation Taxonomy (REQUIRED)

### 4.1 Operation Codes (REQUIRED)
Each editor transaction MUST be classified by op codes (deterministically):
- `OP_TEXT_EDIT`, `OP_MARK_EDIT`, `OP_BLOCK_SPLIT`, `OP_BLOCK_JOIN`, `OP_BLOCK_CONVERT`,
  `OP_LIST_REPARENT`, `OP_TABLE_STRUCT`, `OP_REORDER`, `OP_PASTE`, `OP_IMMUTABLE_REWRITE`

#### 4.1.1 Concurrent Structural Operations (REQUIRED)
When multiple structural operations target the same or overlapping blocks, implementations MUST apply deterministic ordering.

**Operation Ordering Rules:**
1. Operations are ordered by: `(block_id, operation_type, timestamp)` where:
   - `block_id`: Lexicographic ordering
   - `operation_type`: Predefined priority (splits before joins, joins before converts)
   - `timestamp`: CRDT logical timestamp (for tie-breaking)

2. **Conflict Detection:**
   - Detect overlapping structural operations (e.g., split and join on same block)
   - If conflicts detected: fail-closed (reject later operation) OR require explicit resolution
   - Resolution strategy: policy-controlled (default: fail-closed)

3. **Cascading Operations:**
   - When block A is split, operations targeting block A must be resolved before applying split
   - BlockMapping MUST account for all pending structural changes
   - No operation may target a block that is being structurally modified

**Example:**
```
Operation 1: Split block X at offset 10
Operation 2: Join block X with block Y (received concurrently)

Resolution:
- If Operation 1 timestamp < Operation 2: Apply split first, then join operates on resulting blocks
- If Operation 2 timestamp < Operation 1: Reject Operation 1 (block X no longer exists as single unit)
```

> See §14 (Concurrent Operations Handling) for detailed algorithms and conflict resolution strategies.

### 4.2 Block Identity State Machine (REQUIRED)
Implementations MUST follow KEEP-ID / REPLACE-ID / retirement rules:
- Split: left keeps id; right gets new id
- Join: result keeps left/top id; right/bottom retired
- Convert/reparent/table structural replacement: replace id unless overridden in manifest

**BLOCKID-001:** Any override MUST be versioned in `block_id_policy.overrides` and gated by tests.

---

## 5. Stable Anchors (REQUIRED)

Adapters MUST provide:
- `anchorFromAbsolute(absIndex, bias)` → stable bytes
- `absoluteFromAnchor(anchor)` → absIndex or unresolved/truncated

**ANCHOR-ENC-001:** Anchor encoding MUST be stable and versioned.
**ANCHOR-ENC-002:** Anchor encoding MUST include a checksum; decoders MUST verify it and reject invalid anchors (return unresolved).

---

## 6. Chain Policies + Hashes (REQUIRED)

### 6.1 Chain Policies
- `strict_adjacency`: chain blocks must exist and be adjacent (no intervening content blocks)
- `required_order`: chain blocks must exist and keep relative order
- `bounded_gap(max_intervening_blocks)`: relative order + limited intervening blocks

#### 6.1.1 Chain Policy Degradation (REQUIRED)
When negotiation results in a more restrictive chain policy, existing annotations MUST be migrated deterministically.

**Degradation State Machine:**
1. **bounded_gap(max=N) → strict_adjacency:**
   - Annotations with gaps > 0 become `active_partial` (if `partial_policy` allows) or `orphan`
   - Re-verify all affected annotations at next checkpoint
   - User notification: "Some annotations may be affected by capability reduction"

2. **required_order → strict_adjacency:**
   - All multi-block annotations re-verified
   - Annotations violating strict adjacency become `active_partial` or `orphan`
   - User notification required

3. **required_order → bounded_gap:**
   - Annotations with gaps exceeding new `max_intervening_blocks` become `active_partial` or `orphan`
   - Re-verify at checkpoint

**Negotiation-Time Validation:**
- Before accepting effective manifest, check all existing annotations against new policy
- Generate migration plan listing affected annotations
- If migration would orphan >X% of annotations (policy-controlled threshold), may require user confirmation

> See §13 (Chain Policy Degradation Guide) for detailed state machine diagrams and migration procedures.

### 6.2 Hash Specifications (Normative)
`chain_hash` = SHA-256 over canonical string:
```
LFCC_CHAIN_V2
policy=<kind>:<max_intervening_blocks>
blocks=<block_id_1>,<block_id_2>,...,<block_id_n>
```

`context_hash` = SHA-256 over:
```
LFCC_SPAN_V2
block_id=<block_id>
text=<exact UTF-16 slice at creation, LF-normalized>
```

---

## 7. BlockMapping + Dirty-Region Reconciliation (REQUIRED)

### 7.1 BlockMapping Interface (REQUIRED)
```ts
interface BlockMapping {
  mapOldToNew(oldBlockId: string, oldAbsInBlock: number):
    | { newBlockId: string; newAbsInBlock: number }
    | null;

  derivedBlocksFrom(oldBlockId: string): string[];
  mergedFrom?(newBlockId: string): string[];
}
```

### 7.2 Axioms (MUST)
- **Determinism:** Given the same operation and document state, `mapOldToNew` MUST return the same result across all replicas.
- **Locality:** Mapping MUST NOT use heuristics or jump to non-adjacent positions. Positions map to nearby positions only.
- **Monotonicity:** If `posA < posB` in the old block, then `mapOldToNew(posA).newAbsInBlock <= mapOldToNew(posB).newAbsInBlock` (if both exist).
- **Coverage:** For KEEP-ID edits (text/mark edits within a block), all positions in the old block MUST have valid mappings.
- **Deletion semantics:** Negative deltas represent delete intervals in old coordinates; positions inside a deleted interval MUST map to `null`. Monotonicity and coverage apply to non-null results.

**Verification Requirements:**
- Implementations MUST provide property-based tests verifying all axioms for each operation type
- BlockMapping generation MUST be deterministic and reproducible
- Performance: Mapping generation MUST complete in O(N) time where N is the number of affected blocks
- Edge cases: Handle empty blocks, single-character blocks, and maximum block size limits

**Formal Verification:**
- Split operations: Left block preserves all positions [0, splitOffset); right block maps positions [splitOffset, length) to [0, length-splitOffset)
- Join operations: Left block preserves positions [0, leftLength); right block positions map to [leftLength, leftLength+rightLength)
- Convert/reparent: All positions map deterministically based on structural transformation rules

**Mapping Generation Algorithm (Normative):**
1. For each operation type, define explicit mapping rules
2. For nested structures (tables, lists), handle parent-child relationships
3. Cache mappings for repeated queries within same transaction
4. Validate all mapped positions (including surrogate pair checks)

**Property-Based Testing Requirements:**
- For each operation type, generate random valid operations
- Verify determinism: same operation → same mapping
- Verify monotonicity: test with various position pairs
- Verify coverage: all positions in affected blocks have mappings
- Verify locality: mapped positions are near original positions

> See §15 (BlockMapping Verification Guide) for detailed verification procedures and property-based testing requirements.

### 7.3 DirtyInfo (REQUIRED)
Bridge MUST expose minimal affected structure:

```ts
type DirtyInfo = {
  opCodes: string[];
  touchedBlocks: string[];
  touchedRanges?: Array<{ blockId: string; start: number; end: number }>;
  txnIndex?: number; // for deterministic sampling seeds
};
```

### 7.4 Deterministic Neighbor Expansion (MUST)
Reconciliation MUST expand `touchedBlocks` by `K` neighbor content blocks on both sides (manifest controlled).

### 7.5 DEV Defensive Compare (Conformance‑critical)
Dev builds MUST support adaptive-with-coverage checks plus a manual “Force Full Scan” (see §13).

---

## 8. Canonicalizer Spec v2 — Recursive Canonicalization (REQUIRED)

v0.9 defines the canonical form used for:
- Mode B conformance checks
- Shadow model semantic equivalence
- AI payload normalization and schema checks (dry-run)

### 8.1 Canonical Output Types (Normative)
```ts
type CanonMark = "bold"|"italic"|"underline"|"strike"|"code"|"link";

type CanonNode = CanonBlock | CanonText;

type CanonBlock = {
  id: string;              // deterministic snapshot-local id (NOT LFCC block_id)
  type: string;            // "paragraph", "table_row", "list_item", ...
  attrs: Record<string, any>;
  children: CanonNode[];   // recursive children
};

type CanonText = {
  text: string;
  marks: CanonMark[];
  is_leaf: true;
  attrs?: { href?: string };
};
```

**Canonical attribute rules (REQUIRED):**
- Only the `link` mark may carry `attrs.href`.
- `href` MUST pass the URL policy in `ai_sanitization_policy`.
- Unknown attributes MUST be dropped during canonicalization with diagnostics.

**CANON-RECURSIVE-001:** Canonicalizer MUST traverse the document tree recursively.  
**CANON-CONTAINER-001:** For container blocks (tables/lists), semantic equivalence depends on the ordered sequence of canonical children.

### 8.2 Algorithm (Normative)
Canonicalization is **recursive Flatten–Sort–Trim**:

1) **Traverse blocks recursively**
- Normalize `type` and `attrs` (stable ordering, LF normalization where relevant).
- Canonicalize children.

2) **Inline flattening**
- While descending inline nodes, maintain an **active mark set** and mark attrs.
- Treat mark nesting order as irrelevant (mark set semantics).

3) **Sort marks**
- Convert mark sets to ordered arrays using `canonicalizer_policy.mark_order`.

4) **Trim**
- Drop empty wrappers and empty text segments (policy-controlled).
- Merge adjacent `CanonText` if `marks` and `attrs` match.

**CANON-ALGO-001:** Marks MUST be treated as a set during flattening; nesting order must not affect output.  
**CANON-ALGO-002:** `CanonBlock.children` order MUST be deterministic and reflect semantic order.

### 8.3 Quirk Handling (Normative)
- `<br>` normalizes to `\n` in text leaves (within the same block model).
- `&nbsp;` may normalize to space if semantically equivalent (policy).
- Redundant wrappers (e.g., empty `<span>`) must be ignored when `drop_empty_nodes=true`.

**CANON-QUIRK-001:** These are canonicalizer rules, not ad‑hoc regex.

---

## 9. Annotation Display State Machine (REQUIRED)

### 9.1 Stored vs Display State (Normative)
- **Stored (replicated):** `active | active_partial | orphan | hidden | deleted`
- **Display (UI-only overlay):** may include `active_unverified` and `broken_grace`

**STATE-001:** `active_unverified` and `broken_grace` MUST NOT be persisted.

### 9.2 Tokenized Timers (REQUIRED)
When entering `broken_grace`, UI must create a grace token; timer firing must verify the token still matches.

**TIMER-001:** Timers MUST be tokenized; stale timers MUST no-op.

### 9.3 History Integration (NEW, REQUIRED)

#### 9.3.1 Event: `HISTORY_RESTORE`
A local undo/redo that restores a prior state.

**HISTORY-001:** Restored annotations MUST enter display via `active_unverified`.  
**HISTORY-002:** Restored annotations MUST NOT generate new IDs; they MUST revive stable UUIDs.  
**HISTORY-003:** Restore MUST skip `broken_grace` (no grace UI for restore).  
**HISTORY-004:** Restore MUST trigger a high-priority lazy verification checkpoint immediately (or ASAP).

> Rationale: local undo is “trusted” in intent, but not globally authoritative under collaboration; verification reconciles remote interleavings.

---

## 10. Integrity Verification (Lazy + Checkpoints) (REQUIRED)

- Fast path may resolve anchors without hashes and display `active_unverified`.
- Checkpoints MUST verify:
  - context hash (if enabled),
  - chain policy + chain hash (if enabled),
  - then transition stored state to `active|active_partial|orphan`.

**CHECKPOINT-001:** A checkpoint must yield deterministic verified state on all replicas given same updates.

### 10.1 Performance Requirements (Normative)
**PERF-001:** Hot path operations (text edits, mark edits) MUST complete in <10ms for documents with up to 10,000 blocks.

**PERF-002:** Checkpoint verification MUST be throttled:
- Minimum interval between checkpoints: `integrity_policy.checkpoint.every_ms` (default 5000ms)
- Maximum checkpoint duration: 100ms for documents with <1000 annotations
- Use incremental verification: only verify spans in dirty regions plus K neighbors
- Defer non-critical verifications to idle time

**PERF-003:** Canonicalization performance targets:
- Single block canonicalization: <1ms
- Full document (10k blocks): <50ms
- Incremental canonicalization (cached subtrees): <5ms per edit

**PERF-004:** Neighbor expansion MUST be O(K * N) where K is expansion radius and N is number of touched blocks. For large documents, implementations MAY use adaptive K based on document size and annotation density.

---

## 11. AI Gateway + Dry‑Run Sanitization (REQUIRED when AI ops enabled)

LFCC separates **targeting safety** from **payload safety**.

### 11.1 Targeting Safety (Recap)
AI MUST target stable IDs only:
- block_id
- span_id (if `ai_replace_spans` enabled)

AI write requests MUST include:
- `doc_frontier` (observed)
- `if_match_context_hash` per targeted span

If any precondition fails → reject with **409 Conflict**.

### 11.2 AI Payload Dry‑Run (NEW, REQUIRED)

Before applying any AI-generated content, the bridge MUST perform a **dry-run pipeline**:

1) **Sanitize (Whitelist)**
- Strip or reject disallowed tags/blocks/marks/attrs per `ai_sanitization_policy`.
- Disallow script/style/event handlers.
- Enforce safe URL policy for links.

2) **Normalize**
- Canonicalize the payload using the canonicalizer (at least enough to produce a valid Canon tree / leaf spans).
- If canonicalization fails → reject.

3) **Schema Dry‑Run Apply**
- Apply the sanitized+normalized payload to a schema validator / editor parser in a sandbox transaction.
- If the editor cannot parse/accept it deterministically → reject.

**AI-SANITIZE-001:** Bridge MUST reject or sanitize AI payloads containing non-canonical structure or marks before applying.  
**AI-DRYRUN-001:** Dry-run MUST be performed before any real editor mutation.  
**AI-DRYRUN-002:** Failure MUST be fail-closed (no partial apply).

### 11.3 Smart Retry Guidance (Client, SHOULD)
On 409:
- Rebase to gateway frontier
- Relocate targets (Level 1 by default; Level 2/3 manifest-gated)
- Retry up to `max_retries`
- Otherwise abort with user-visible message.

Relocation MUST NOT write shared repair updates without explicit user confirmation.

---

## 12. Compatibility Degradation (REQUIRED)

If negotiation disables a feature:
- disable editing of that feature (read-only UI) rather than refusing the entire session,
- unless correctness-critical mismatches exist (§2.3).

Examples:
- if cross-block annotations disabled: existing remain read-only; cannot create/repair.
- if bounded_gap disabled: validate as strict_adjacency.

---

## 13. Developer Tooling + Conformance (REQUIRED)

### 13.1 Developer Overrides (REQUIRED)
**DEV-UX-001:** Debug overlay MUST provide **“Force Full Integrity Scan”**:
- full reconcile scan
- full checkpoint verify
- diff report vs dirty-region results

### 13.2 State Machine Visualization (REQUIRED when enabled)
**DEV-VIS-001:** Dev overlay MUST expose:
- display state (active_unverified / broken_grace)
- grace tokens + expiration
- pending timer count
- last checkpoint result + reason
- AI eligibility (verified only)

### 13.3 Conformance Gates (CI-Ready)
Minimum required gates:
- negotiation determinism
- block identity conformance for each op code
- BlockMapping axioms
- SpanList structural ops reconcile (split/join/reparent/table/reorder)
- canonicalizer equivalence on nested structures
- history restore semantics (HISTORY_RESTORE)
- AI preconditions + dry-run sanitization
- rendering determinism under virtualization

---

## 14. LFCC Conformance Kit (“lfcc-kernel”) (RECOMMENDED; may be required by policy)

To avoid divergent re-implementations, LFCC defines a recommended reference library: **lfcc-kernel**.

### 14.1 Kernel Modules (Recommended)
1) **Canonicalizer**
- `canonicalizeDocument(input): CanonNode`
- `canonicalizeBlock(input): CanonBlock`
- includes v2 recursive canonicalization algorithm and mark ordering

2) **Annotation Display Machine**
- XState machine definition (TS/JSON)
- tokenized timer helpers

3) **BlockMapping Interfaces + Helpers**
- type definitions
- property-based tests for axioms (monotonicity/locality/coverage)

4) **AI Sanitizer + Dry‑Run Harness**
- whitelist sanitizer
- canonicalizer-based normalization
- schema dry-run runner interface

5) **Dev Compare Harness**
- adaptive-with-coverage comparator
- deterministic sampling with reproducible seeds
- “force full scan” report generator

### 14.2 Versioning
**KERNEL-VER-001:** Kernel APIs and policies MUST be versioned in lockstep with LFCC minor versions (0.x) and with stable 1.x when LFCC reaches 1.0.

---

## 15. Change Log

- **v0.9 (RC):** Adds recursive canonicalization (CanonNode tree), HISTORY_RESTORE semantics, AI dry-run sanitization, and formalizes the lfcc-kernel conformance kit concept.
- **v0.9.1 (RC Update):** Clarifies UTF-16 surrogate pair handling (§1.1), adds performance requirements (§10.1), and enhances BlockMapping verification requirements (§7.2).

---

## 16. Supplementary Documentation

- **§17:** Custom Types Extension Guide — Registration, validation, canonicalization
- **§18:** Security Best Practices — AI validation, hash collisions, anchor security
- **§19:** Version Migration Guide — Compatibility matrix, migration procedures
- **§20:** Platform Requirements and Conformance — Encoding, timestamp, precision specifications
- **§21:** Fuzzing Strategy and Bug Reproduction — Seed management, CI integration  

---
