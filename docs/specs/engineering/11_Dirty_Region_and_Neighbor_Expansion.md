\
# Algorithm Whitepaper: Dirty Region & Neighbor Expansion — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Collaboration platform engineers, SDET, performance engineers.  
**Source of truth:** LFCC v0.9 RC §7 (DirtyInfo), §6 (Chain policies), §10 (Integrity), §13 (Dev compare).

---

## 0. Why dirty-region?

Full reconciliation of all annotations on every keystroke is O(N) over spans and becomes too costly for long documents.

Dirty-region aims for O(affected spans) while preserving correctness.

---

## 1. DirtyInfo (Minimal Affected Set)

The bridge emits:
- op codes (what kind of edit)
- touchedBlocks (which blocks structurally or textually changed)
- optional touchedRanges per block

DirtyInfo is a **hint**, but LFCC requires defensive measures:
- deterministic neighbor expansion
- dev full scan compare / coverage

---

## 2. Neighbor Expansion (K)

### 2.1 Motivation
Many ops have localized but non-obvious effects:
- joins affect previous block end + next block start
- list reparent changes ordering and adjacency constraints
- table struct ops affect neighboring cells in traversal order

If developers omit a neighbor block, spans can fail to reconcile and become orphan incorrectly.

### 2.2 Algorithm
Given:
- `touchedBlocks`
- `contentBlockIds` in deterministic doc order
- `K = neighbor_expand_k`

Compute `expandedBlocks`:
- include each touched block
- include up to K blocks on left and right in doc order

Then reconcile spans whose chain intersects `expandedBlocks`.

---

## 3. Chain-aware Impact

### 3.1 strict_adjacency
If any block in chain changes, its neighbors likely matter because adjacency constraints can break.

### 3.2 bounded_gap
A chain may remain valid even with small insertions; still must re-check constraint counts near touched area.

### 3.3 required_order
Reordering operations must trigger chain re-validation across the entire chain segment intersecting expanded blocks.

---

## 4. Adaptive-with-Coverage Dev Checking

To prevent missed bugs in sampling:
- deterministic sampling (seeded)
- periodic full scans on idle and structural ops
- forced full scan button

Over time, this provides coverage guarantees while keeping dev machines responsive.

---

## 5. Practical Performance Tips

- perform reconcile in a worker (when possible)
- batch remote updates
- debounce checkpoints
- cache anchor resolutions with invalidation on touched blocks

---

## 6. Common Bugs and How LFCC Catches Them

### Bug: missed neighbor expansion
Symptom: annotations orphan unexpectedly or only on certain ops.

Detection:
- dev dirty vs full scan compare mismatch

### Bug: non-deterministic block order
Symptom: different clients expand to different neighbors.

Detection:
- determinism fuzz; canonicalizer mismatch; conformance gates fail

