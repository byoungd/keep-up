# lfcc-kernel API Specification (v0.9 RC)

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Kernel library maintainers, platform architects, editor/bridge maintainers.  
**Source of truth:** LFCC v0.9 RC §14 (Conformance Kit), §8 (Canonicalizer), §7 (BlockMapping/Dirty), §11 (AI Dry-Run).

---

## 0. Design Goals

1. Provide **reference implementations and types** that make LFCC behaviors reproducible across teams/platforms.
2. Make **non-negotiable correctness rules** hard to bypass (compile-time + runtime checks).
3. Support:
   - deterministic canonicalization (recursive tree),
   - annotation display machine tooling (tokenized timers),
   - dirty-region reconciliation and dev compare harness,
   - AI sanitizer + dry-run harness interfaces.

---

## 1. Package Layout (Recommended)

```
lfcc-kernel/
  canonicalizer/
    types.ts
    canonicalize.ts
    normalizeText.ts
    marks.ts
  mapping/
    types.ts
    axioms.ts
    neighborExpansion.ts
  annotations/
    stateMachine.ts
    tokenizedTimers.ts
    types.ts
  ai/
    envelope.ts
    sanitizer.ts
    dryRun.ts
    urlPolicy.ts
  devtools/
    compareHarness.ts
    forceFullScan.ts
    overlayModel.ts
  testing/
    fuzz.ts
    generators.ts
    goldenFixtures.ts
```

---

## 2. Canonicalizer API

### 2.1 Canonical Types (Normative)

```ts
export type CanonMark =
  | "bold" | "italic" | "underline" | "strike" | "code" | "link";

export type CanonNode = CanonBlock | CanonText;

export type CanonBlock = {
  /** Snapshot-local deterministic id for diffs/debug ONLY (MUST NOT replace LFCC block_id) */
  id: string;

  /** Structural role, e.g. "paragraph", "list_item", "table_row", "table_cell" */
  type: string;

  /** Canonicalized attrs with stable key ordering and normalization */
  attrs: Record<string, unknown>;

  /** Ordered children, recursive */
  children: CanonNode[];
};

export type CanonText = {
  text: string;          // LF-normalized text
  marks: CanonMark[];    // sorted by mark_order
  is_leaf: true;
  attrs?: { href?: string };
};
```

**Canonical attribute rules (REQUIRED):**
- Only the `link` mark may carry `attrs.href`.
- `href` MUST pass the URL policy in `ai_sanitization_policy`.
- Unknown attributes MUST be dropped during canonicalization with diagnostics.

### 2.2 Canonicalizer Options

```ts
export type CanonicalizerPolicyV2 = {
  version: "v2";
  mode: "recursive_tree";
  mark_order: CanonMark[];
  normalize_whitespace: boolean;
  drop_empty_nodes: boolean;
};
```

### 2.3 Input Abstraction

The canonicalizer MUST accept a platform-independent input model:

```ts
export type CanonInputNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;                        // e.g. "b", "i", "p", "li", "table"
      attrs: Record<string, string>;
      children: CanonInputNode[];
    };

export type CanonicalizeDocumentInput = {
  /** Root can be block container or an editor schema root */
  root: CanonInputNode;
  /** Optional helpers to map editor-specific nodes to LFCC block types */
  mapTagToBlockType?: (tag: string, attrs: Record<string,string>) => string | null;
};
```

### 2.4 Canonicalize Functions

```ts
export type CanonicalizeResult = {
  root: CanonNode;               // typically a root CanonBlock
  diagnostics: CanonDiag[];      // warnings about dropped nodes, etc.
};

export type CanonDiag =
  | { kind: "dropped_empty_node"; path: string }
  | { kind: "unknown_mark"; tag: string; path: string }
  | { kind: "unknown_block"; tag: string; path: string }
  | { kind: "normalized_whitespace"; path: string };

export function canonicalizeDocument(
  input: CanonicalizeDocumentInput,
  policy: CanonicalizerPolicyV2
): CanonicalizeResult;

export function canonicalizeBlock(
  input: CanonInputNode,
  policy: CanonicalizerPolicyV2
): CanonBlock;
```

### 2.5 Canonical Serialization (Optional)

For deterministic comparisons:

```ts
export function stableStringifyCanon(node: CanonNode): string;
```

Requirements:
- stable object key ordering,
- stable array order (already ordered),
- no whitespace.

---

## 3. BlockMapping + Dirty Region APIs

### 3.1 BlockMapping Interface (Normative)

```ts
export interface BlockMapping {
  mapOldToNew(
    oldBlockId: string,
    oldAbsInBlock: number
  ): { newBlockId: string; newAbsInBlock: number } | null;

  derivedBlocksFrom(oldBlockId: string): string[];

  mergedFrom?(newBlockId: string): string[];
}
```

### 3.2 DirtyInfo (Normative)

```ts
export type DirtyInfo = {
  opCodes: string[];
  touchedBlocks: string[];
  touchedRanges?: Array<{ blockId: string; start: number; end: number }>;
  txnIndex?: number; // deterministic sampling seed
};
```

### 3.3 Neighbor Expansion Helper

```ts
export type NeighborExpansionPolicy = {
  neighbor_expand_k: number; // K blocks on each side
};

export type DocumentBlockOrder = {
  /** Deterministic list of content blocks in document order */
  contentBlockIds: string[];
};

export function expandTouchedBlocks(
  touchedBlocks: string[],
  order: DocumentBlockOrder,
  policy: NeighborExpansionPolicy
): string[];
```

---

## 4. Annotation Display Machine APIs

### 4.1 Stored vs Display State Types

```ts
export type StoredAnnoState = "active" | "active_partial" | "orphan" | "hidden" | "deleted";

export type DisplayAnnoState =
  | "active"
  | "active_partial"
  | "active_unverified"
  | "broken_grace"
  | "orphan";
```

### 4.2 Tokenized Timers

```ts
export type GraceToken = string;

export type GraceEntry = {
  annoId: string;
  token: GraceToken;
  expiresAtMs: number;
};

export function newGraceEntry(annoId: string, nowMs: number, graceMs: number): GraceEntry;

export function isGraceTokenCurrent(
  current: GraceEntry | undefined,
  fired: { annoId: string; token: GraceToken }
): boolean;
```

### 4.3 XState Machine Artifact (Reference)

Kernel SHOULD export:
- `lfccAnnoDisplayMachine.ts`
- or `lfccAnnoDisplayMachine.json` (compiled)

```ts
export { lfccAnnoDisplayMachine } from "./stateMachine";
```

---

## 5. AI Sanitizer + Dry-Run Harness APIs

### 5.1 AI Envelope Types

```ts
export type DocFrontier = string; // opaque (e.g., version vector encoding)

export type SpanPrecondition = {
  span_id: string;
  if_match_context_hash: string;  // sha256 hex
};

export type AIRequestEnvelope = {
  doc_frontier: DocFrontier;
  ops_xml: string;               // e.g., <replace_spans>...</replace_spans>
  preconditions: SpanPrecondition[];
  client_request_id?: string;
};

export type AI409Conflict = {
  code: "CONFLICT";
  current_frontier: DocFrontier;
  failed_preconditions: Array<{
    span_id: string;
    reason: "hash_mismatch" | "span_missing" | "unverified";
  }>;
};
```

### 5.1.1 AI-native Envelope Types (Optional)

AI-native integrations extend the v0.9 envelope with idempotency and agent identity.
See `23_AI_Native_Extension.md` for normative requirements.

```ts
export type AIRequestEnvelopeV2 = AIRequestEnvelope & {
  request_id: string;
  agent_id: string;
  intent_id?: string;
  intent?: { id?: string; category: string; summary: string };
  policy_context?: { policy_id?: string; redaction_profile?: string };
};
```

### 5.2 Sanitization Policy

```ts
export type AISanitizationPolicyV1 = {
  version: "v1";
  sanitize_mode: "whitelist";
  allowed_marks: CanonMark[];
  allowed_block_types: string[];
  reject_unknown_structure: boolean;
  limits: {
    max_payload_bytes: number;
    max_nesting_depth: number;
    max_attribute_count: number;
  };
};
```

### 5.3 Sanitizer Interface

```ts
export type SanitizedPayload = {
  sanitized_html?: string;
  sanitized_markdown?: string;
  diagnostics: Array<{ kind: string; detail: string }>;
};

export interface AIPayloadSanitizer {
  sanitize(input: { html?: string; markdown?: string }, policy: AISanitizationPolicyV1): SanitizedPayload;
}
```

### 5.4 Dry-Run Interface

```ts
export type DryRunReport = {
  ok: boolean;
  reason?: string;
  canon_root?: import("../canonicalizer/types").CanonNode;
  diagnostics: Array<{ kind: string; detail: string }>;
};

export interface EditorSchemaValidator {
  /** Must parse and validate deterministically; no editor mutation */
  dryRunApply(input: { html?: string; markdown?: string }): { ok: boolean; error?: string };
}

export async function dryRunAIPayload(
  input: { html?: string; markdown?: string },
  sanitizer: AIPayloadSanitizer,
  validator: EditorSchemaValidator,
  canonicalize: (doc: any) => any,
  policy: AISanitizationPolicyV1
): Promise<DryRunReport>;
```

---

## 6. Dev Compare Harness APIs

```ts
export type DevComparePolicy = {
  dev_compare_mode: "adaptive_with_coverage";
  dev_fullscan_max_blocks: number;
  dev_sample_rate_large_docs: number; // 0..1
  dev_compare_debounce_ms: number;
  dev_idle_fullscan_every_ms: number;
  dev_structural_ops_fullscan_every: number;
};

export type CompareMismatch = {
  kind: "dirty_missed_span" | "hash_mismatch" | "chain_violation";
  anno_id: string;
  span_id?: string;
  detail: string;
};

export interface IntegrityScanner {
  dirtyScan(dirty: DirtyInfo): Promise<CompareMismatch[]>;
  fullScan(): Promise<CompareMismatch[]>;
}

export function shouldRunFullScanNow(params: {
  blockCount: number;
  structuralOpsSinceLastFullScan: number;
  idleMs: number;
  policy: DevComparePolicy;
}): boolean;
```

---

## 7. Versioning Rules

- Kernel exports MUST be versioned and tied to LFCC minor versions during 0.x.
- Any behavior changes MUST bump `canonicalizer_policy.version`, `ai_sanitization_policy.version`, etc.

**KERNEL-VER-001:** Kernel APIs and policy versions MUST evolve together with LFCC.
