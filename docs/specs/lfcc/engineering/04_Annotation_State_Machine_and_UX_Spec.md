\
# Annotation State Machine & UX Specification — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Frontend UI engineers, editor integration engineers, design/UX for collaboration.  
**Source of truth:** LFCC v0.9 RC §9 (State Machine), §10 (Integrity), §13 (Dev tooling).

---

## 0. Goals

1. Make annotation rendering **stable** under rapid edits (no “ghost flicker”).
2. Maintain LFCC safety: **no silent drift**, fail-closed shared truth.
3. Provide a **reference implementation** pattern (XState + tokenized timers).

---

## 1. State Model

### 1.1 Stored (Replicated) States
These are persisted in CRDT metadata:

- `active`
- `active_partial`
- `orphan`
- `hidden`
- `deleted`

### 1.2 Display (UI-only) Overlay States
These are derived locally and MUST NOT be persisted:

- `active_unverified` — fast-path placement pending verification
- `broken_grace` — grace-period display after verification marks stored state orphan

**Rule:** UI states are a view overlay; stored states are the shared truth.

---

## 2. Visual Specification

### 2.1 Recommended Styles (Tokens)

| State | Purpose | Recommended style |
|---|---|---|
| active | verified highlight/comment | solid underline or background highlight |
| active_unverified | pending verification | dotted underline / light hatch overlay + tooltip “validating…” |
| broken_grace | orphaned but grace window | gray dashed underline + tooltip “broken; may repair” |
| orphan | unsafe/unresolvable | no highlight; show badge in side panel / thread list |
| active_partial | partial resolution | highlight resolved spans; mark missing spans with “gap” indicator |

### 2.2 UX Principles
- Never “teleport” an annotation to unrelated text.
- Prefer **stable presence**: transitioning to orphan should not instantly vanish (use grace).
- Always expose the reason in tooltips/logs for debugging.

---

## 3. Tokenized Timer Implementation (Required)

### 3.1 Why tokenized timers
A common bug: a stale timer fires after the annotation recovered, removing it incorrectly.

### 3.2 Implementation contract
When entering `broken_grace`:
1. generate `grace_token = uuid()`
2. store it with `expiresAt` per annotation id
3. start a timer that includes the token

When the timer fires:
- only act if the token still matches the current token stored for that annotation id.

### 3.3 Reference Pseudocode

```ts
type GraceEntry = { token: string; expiresAtMs: number };

const graceByAnno = new Map<string, GraceEntry>();

function enterBrokenGrace(annoId: string, graceMs: number) {
  const token = crypto.randomUUID();
  graceByAnno.set(annoId, { token, expiresAtMs: Date.now() + graceMs });

  setTimeout(() => {
    const cur = graceByAnno.get(annoId);
    if (!cur) return;
    if (cur.token !== token) return; // stale timer
    finalizeGraceExpiry(annoId);
  }, graceMs);
}

function exitBrokenGrace(annoId: string) {
  graceByAnno.delete(annoId); // invalidate token
}
```

---

## 4. XState Reference Machine

> Use the lfcc-kernel artifact if available.

### 4.1 Events
- `FAST_PATH_ENTER`
- `CHECKPOINT_OK`
- `CHECKPOINT_PARTIAL`
- `CHECKPOINT_ORPHAN`
- `REPAIR_OK`
- `HISTORY_RESTORE`
- `GRACE_TIMER_FIRED`

### 4.2 Behavioral Rules
- `active_unverified` must never be AI-writable.
- `HISTORY_RESTORE` enters via `active_unverified` and **skips grace**.
- `CHECKPOINT_ORPHAN` causes stored state orphan; display enters `broken_grace`.

---

## 5. Rendering Keys & Virtualization

### 5.1 Deterministic decoration keys
Decoration keys MUST be stable and deterministic:

Recommended:
```
key = `anno:${anno_id}:span:${span_id}:block:${block_id}`
```

Avoid:
- random ids,
- position-based keys without stable ids.

### 5.2 Virtualization constraints
If rows/blocks are virtualized:
- decoration keys must survive mount/unmount
- rendering must re-resolve anchors on mount and at checkpoints

---

## 6. Checklist (Frontend)

- [ ] Tokenized timers implemented (stale timers no-op)
- [ ] Grace period applied only to display, not stored state
- [ ] `active_unverified` style and tooltip implemented
- [ ] Orphan display strategy (side panel listing) implemented
- [ ] HISTORY_RESTORE handled (skip grace; trigger verify)
- [ ] Deterministic decoration keys
- [ ] Dev overlay exposes state machine context (if enabled)

