# LFCC Proposal: Academic Protocol Enhancements

> **Status:** Proposed
> **Date:** 2026-01-29
> **Target Package:** `@ku0/core`, `@ku0/lfcc-bridge`
> **Related:** OpenAI Prism Analysis, Phase 11 Gateway Surfaces

## 1. Context & Motivation

OpenAI's "Prism" feature has demonstrated the power of an AI-native workspace dedicated to scientific writing. To support academic workflows and compete with tools like Prism, we extend the LFCC protocol's semantic understanding to include scientific primitives: **LaTeX Mathematics** and **Structured Citations**.

## 2. Detailed Specification

### 2.1 Core Types (`packages/core/src/markdown/types.ts`)

We will introduce new block types to the semantic index.

```typescript
// Existing types...

export type MarkdownLatexBlock = {
  kind: "latex";
  line_range: LineRange;
  content: string; // The raw latex string between $$ markers
};

export type MarkdownCitationNode = {
  kind: "citation";
  line_range: LineRange;
  keys: string[]; // Parsed citation keys, e.g. ["doe2023", "smith2024"]
  raw: string;    // Full raw string, e.g. "[@doe2023; @smith2024]"
};

// Update MarkdownSemanticIndex
export type MarkdownSemanticIndex = {
  line_count: number;
  headings: MarkdownHeadingBlock[];
  code_fences: MarkdownCodeFenceBlock[];
  // [NEW]
  latex_blocks: MarkdownLatexBlock[]; // Track $$ blocks
  citations: MarkdownCitationNode[];  // Track detailed citation usage
  frontmatter?: MarkdownFrontmatterBlock;
  frontmatter_data?: unknown;
  frontmatter_error?: MarkdownOperationError;
};

// Update MarkdownPreconditionV1 Semantic Selector
export type MarkdownPreconditionV1 = {
  // ...
  semantic?: {
    kind: "heading" | "code_fence" | "frontmatter" | "frontmatter_key" | "latex" | "citation"; // Added latex, citation
    // ... existing fields
    // [NEW] Selectors for academic types
    latex_hash?: string; // Optional: target by content hash for stability
    citation_key?: string; // Target specific citation key occurrence
  };
};
```

### 2.2 Parsing Logic (`packages/core/src/markdown/semantic.ts`)

#### A. LaTeX Block Parsing
We must distinguish between Code Fences and LaTeX Blocks. LaTeX blocks use `$$`.

**Regex Pattern:**
```typescript
// Matches a line that is solely $$ (with optional whitespace)
// Note: We deliberately do NOT support inline starting of math block (e.g. $$ E=mc^2 $$ on one line)
// for semantic block stability, similar to code fences.
const LATEX_BLOCK_START = /^\s{0,3}\$\$\s*$/;
```

**Parsing Loop Integration:**
Inside `buildMarkdownSemanticIndex` loop:
```typescript
// ...
const fence = parseCodeFence(lines, i);
if (fence) {
  // ...
}

// [NEW] Check for LaTeX Block
const latex = parseLatexBlock(lines, i);
if (latex) {
  latexBlocks.push(latex.block);
  i = latex.nextIndex;
  continue;
}
// ...
```

**`parseLatexBlock` Implementation:**
```typescript
function parseLatexBlock(
  lines: string[],
  index: number
): { block: MarkdownLatexBlock; nextIndex: number } | null {
  const line = lines[index];
  if (!LATEX_BLOCK_START.test(line)) {
    return null;
  }

  // Scan forward for closing $$
  let endIndex = lines.length - 1;
  const contentLines: string[] = [];
  
  for (let i = index + 1; i < lines.length; i++) {
    const candidate = lines[i];
    if (LATEX_BLOCK_START.test(candidate)) {
      endIndex = i;
      break;
    }
    contentLines.push(candidate);
  }

  return {
    block: {
      kind: "latex",
      line_range: { start: index + 1, end: endIndex + 1 },
      content: contentLines.join("\n"),
    },
    nextIndex: endIndex + 1,
  };
}
```

#### B. Citation Parsing
Citations are inline but will be indexed as semantic nodes. Since they can appear anywhere, we scan lines *after* block parsing (or within remaining text).
*Optimization:* For the initial implementation, we can scan line-by-line during the main loop if no block matched.

**Regex Pattern:**
```typescript
// Matches standard Pandoc citation: [@key] or [@key; @key2]
// Excludes escaping.
const CITATION_GLOBAL_PATTERN = /\[@([a-zA-Z0-9_\-:]+)(?:\s*[;,]\s*@([a-zA-Z0-9_\-:]+))*\]/g;
```

**Helper:**
```typescript
function extractCitations(line: string, lineIndex: number): MarkdownCitationNode[] {
  const citations: MarkdownCitationNode[] = [];
  let match;
  while ((match = CITATION_GLOBAL_PATTERN.exec(line)) !== null) {
     // match[0] is full string "[@key1; @key2]"
     // We need to re-parse inside the bracket to get all keys reliably if the regex group logic is limited
     const content = match[0];
     // Simple extractor for keys inside the match
     const keys = content.match(/@([a-zA-Z0-9_\-:]+)/g)?.map(k => k.substring(1)) || [];
     
     citations.push({
       kind: "citation",
       line_range: { start: lineIndex + 1, end: lineIndex + 1 }, // Citations are single-line usually
       keys,
       raw: content
     });
  }
  return citations;
}
```

### 2.3 Semantic Targeting (`resolveMarkdownSemanticTarget`)

We need to add resolvers for the new kinds.

1.  **`kind: "latex"`**:
    - `resolveLatexTarget(semantic, index)`
    - Can filter by `nth` (e.g., "update the 2nd equation").
    - Can filter by content match if `latex_hash` or partial content is provided.

2.  **`kind: "citation"`**:
    - `resolveCitationTarget(semantic, index)`
    - Filter by `citation_key`: Find the node containing specific key `@doe2023`.

## 3. Bibliography & Frontmatter

We standardize on CSL JSON in frontmatter for bibliography data.

**Validation Logic:**
When `validate_frontmatter: true` is requested:
1.  Check if `references` key exists.
2.  Validate it is an array.
3.  Warn if `id` is missing in generic items.

## 4. Execution Plan (Implementation Steps)

1.  **Step 1: Types:** Update `packages/core/src/markdown/types.ts` with `MarkdownLatexBlock` and `MarkdownCitationNode`.
2.  **Step 2: Parsing:** Add `parseLatexBlock` and citation scanning to `packages/core/src/markdown/semantic.ts`.
3.  **Step 3: Indexing:** Ensure `MarkdownSemanticIndex` returns these new nodes.
4.  **Step 4: Testing:** Create `packages/core/src/markdown/__tests__/academic.test.ts` to verify parsing accuracy.

## 5. Migration / Compatibility

- **Rendering:** Existing renderers will treat `$$` as text until updated. This is safe (graceful degradation).
- **Bridge:** No breaking changes to `lfcc-bridge` protocol types, as we are extending the *content* semantic index, not the transport layer.

## 6. Edge Cases & Constraints

- **Inline Math:** Not indexed in Phase 1 (too noisy). Only `$$` blocks are indexed.
- **Nested Math:** Parsing breaks on the first `$$` found. Users must escape `\$$` if they want literal dollars (standard markdown behavior).
- **Performance:** Citation scanning involves regex on every non-block line. We limits this to lines < 2000 chars to prevent ReDoS.
