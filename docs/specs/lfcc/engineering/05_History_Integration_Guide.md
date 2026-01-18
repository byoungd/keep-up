\
# History Integration Guide (Undo/Redo) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Editor core engineers, collaboration integrators.  
**Source of truth:** LFCC v0.9 RC §9.3 (HISTORY_RESTORE), §10 (Integrity), §11 (AI safety).

---

## 0. Problem Statement

Undo/Redo restores a prior local snapshot, but in collaborative systems:
- remote replicas may have modified the same region,
- the restored snapshot may no longer be globally “verified”.

LFCC v0.9 resolves this by making restore **trusted in intent** but **not globally authoritative**.

---

## 1. Normative Rules (Recap)

- **HISTORY-001:** Restored annotations enter display via `active_unverified`.
- **HISTORY-002:** Restore MUST revive stable UUIDs (no new IDs).
- **HISTORY-003:** Restore MUST skip `broken_grace`.
- **HISTORY-004:** Restore MUST trigger a high-priority lazy verification checkpoint ASAP.

---

## 2. Implementation Model

### 2.1 Detecting Undo/Redo
Depending on editor:
- ProseMirror: detect `history` plugin meta or `tr.getMeta("history")`
- Slate: operation type `undo`/`redo`
- TipTap: `editor.commands.undo()` / `redo()` event hooks

Bridge MUST mark the transaction with:
- op codes including `OP_IMMUTABLE_REWRITE` or a dedicated `OP_HISTORY_RESTORE`
- `DirtyInfo.touchedBlocks` derived from the restored diff

### 2.2 Restoring Annotation Objects
Store annotation objects in CRDT map keyed by `anno_id`.

Undo should:
- revert the map entry to its prior value
- preserve the same `anno_id` and `span_id` values
- never allocate new ids on restore

**Anti-pattern:** deleting and recreating annotations (breaks stable references).

---

## 3. State Transitions on Restore

### 3.1 Display State
On restore:
- set display to `active_unverified`
- do not enter `broken_grace`

### 3.2 Checkpoint Priority
Immediately schedule a checkpoint verify:
- bypass standard debounce if configured (`force_verify_on_restore`)
- but still use lazy verify path if supported

Rationale:
- confirms that restored anchors still match current doc after remote interleavings

---

## 4. Edge Cases

### 4.1 Restore conflicts with remote edits
Possible outcomes after verify:
- `active` (clean restore)
- `active_partial` (some spans resolved)
- `orphan` (unsafe)

UI must explain:
- “Restored highlight could not be verified due to remote edits.”

### 4.2 Nested container restores (tables/lists)
DirtyInfo MUST include affected container blocks (table_cell/list_item), and neighbor expansion will reconcile span chains.

---

## 5. Testing Checklist

- [ ] Restored annotations keep same UUIDs
- [ ] Restore enters `active_unverified` (no grace)
- [ ] Verify is triggered immediately
- [ ] Remote edit interleavings are tested (fuzz)
- [ ] No stale grace timers remove restored annotations

