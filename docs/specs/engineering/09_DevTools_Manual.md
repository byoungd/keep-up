\
# DevTools Manual (LFCC Overlay) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Internal tools engineers, frontend platform engineers, QA.  
**Source of truth:** LFCC v0.9 RC §13 (Dev tooling), §9 (state visualization).

---

## 0. Purpose

Provide a consistent debug overlay and tools to:
- inspect block boundaries and IDs,
- inspect annotation span placement and states,
- run integrity checks on demand,
- diagnose dirty-region misses and canonicalization differences.

---

## 1. Enabling Dev Tools

### 1.1 Policy Toggle
Set manifest `dev_tooling_policy`:
- `force_full_scan_button=true`
- `state_visualizer=true`

### 1.2 Runtime Flag
Recommended:
- URL param `?lfccDev=1`
- or localStorage `LFCC_DEV=1`

---

## 2. Overlay Panels

### 2.1 Block Inspector
Shows for the hovered block:
- `block_id`
- `type`
- parent path (for nested containers)
- start/end anchors (truncated)
- neighbors (K expansion list)

### 2.2 Annotation Inspector
Shows:
- `anno_id`, `span_id`, target block_id
- stored state (active/orphan/partial)
- display state (active_unverified/broken_grace)
- context_hash + chain_hash
- last verify time + reason

### 2.3 State Machine Visualizer (Required when enabled)
Displays:
- current state per annotation
- grace token and expiration
- pending timers count
- events received (checkpoint, restore, repair)

---

## 3. Force Full Integrity Scan (Required)

### 3.1 Button Behavior
When pressed:
1. run full reconcile scan (all annotations)
2. run full verification checkpoint
3. run diff against last dirty-region scan results
4. present a report:
   - mismatched spans
   - chain violations
   - hash mismatches
   - mapping failures

### 3.2 Output
- a UI report
- a structured JSON blob for copy/paste into bug reports

---

## 4. Canonicalization Debugging

Provide a “Compare Canon Trees” panel:
- show shadow canonical tree
- show editor canonical tree
- highlight first difference path

---

## 5. Performance Controls (Dev)

- allow “pause full-scan compares”
- show CPU time per scan
- provide deterministic sampling seed display

---

## 6. Bug Report Template (Recommended)

Include:
- manifest + effective negotiated manifest
- txn index + op codes
- dirty info
- canonical diff snippet
- scan report JSON

