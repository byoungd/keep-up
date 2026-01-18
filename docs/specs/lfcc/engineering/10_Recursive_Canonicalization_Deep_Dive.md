\
# Algorithm Whitepaper: Recursive Canonicalization Deep Dive — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Platform architects, editor engine engineers, SDET.  
**Source of truth:** LFCC v0.9 RC §8.

---

## 0. Why recursive canonicalization?

Inline normalization alone cannot represent:
- nested lists inside table cells,
- blockquotes containing mixed blocks,
- complex container reorderings.

A canonical tree provides:
- a stable semantic representation independent of DOM quirks,
- a robust basis for Mode B conformance checks,
- a normal form for AI payload validation.

---

## 1. Canonical Tree Model

- Structural nodes: `CanonBlock`
- Leaf nodes: `CanonText`

Container semantics:
- A container’s meaning is the **ordered sequence** of canonical children.
- Canonicalizer must preserve deterministic child ordering.

---

## 2. Step-by-step Algorithm (Recursive Flatten–Sort–Trim)

### 2.1 Input normalization
Convert the editor/DOM representation into an abstract node tree:
- element nodes with tag + attrs + children
- text nodes

### 2.2 Block boundary recognition
A mapping function determines which tags are blocks:
- paragraph, heading, list_item, table_row, table_cell, quote, code, etc.

For each block node:
1) normalize type
2) canonicalize attrs (stable key ordering, normalize booleans/enums)
3) canonicalize children recursively

### 2.3 Inline flattening inside a block
During traversal, maintain:
- `activeMarkSet` (a set)
- `activeAttrs` (e.g. href for links)

Rules:
- mark nesting order is irrelevant (set semantics)
- `<b><i>x</i></b>` and `<i><b>x</b></i>` yield same mark set

Emit segments as you encounter text:
- `{ text, marks: activeMarkSet, attrs: activeAttrs }`

### 2.4 Sorting marks
Convert sets → arrays using policy mark order. This is essential for deterministic comparisons.

### 2.5 Trimming and merging
- drop empty text segments
- drop wrappers that contribute no semantics
- merge adjacent text nodes with identical marks/attrs to avoid fragmentation

---

## 3. Handling Tables and Lists

### 3.1 Tables
Represent as nested blocks:
- table
  - table_row[]
    - table_cell[]
      - block children (paragraph/list/quote...)

This supports “list inside cell” naturally.

### 3.2 Lists
Represent as:
- list container (optional depending on editor model)
  - list_item[]
    - children blocks (paragraph, nested list, etc.)

List nesting becomes recursion, not indentation metadata.

---

## 4. Canonical IDs

`CanonBlock.id` is snapshot-local:
- used for diff paths and debugging
- deterministic: derived from traversal path (e.g., `r/0/2/1`), or a stable hash of that path

It MUST NOT replace LFCC persistent `block_id`.

---

## 5. Deterministic Comparison

Preferred:
- compare canonical object trees directly (deep equal)

Optional:
- stable stringify for snapshots/diffs

---

## 6. Failure Modes and Diagnostics

Canonicalizer should produce diagnostics:
- dropped empty wrappers
- unknown tags/marks
- whitespace normalization decisions

These become test outputs and aid debugging.

