# LFCC v0.9.5 Markdown Content Mode

**Status:** Draft Proposal (Extension-only)  
**Author:** Keep-Up Team  
**Date:** 2026-01-22  
**Target Version:** LFCC v0.9.5 (Optional Extension)  
**Prerequisite:** v0.9.4 (AI Targeting Resilience)  
**Capability Flag:** `capabilities.markdown_content_mode = true`

**See also:**
- `docs/specs/lfcc/LFCC_v0.9_RC.md` (core guarantees, error envelope)
- `docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md` (§22 Markdown payload support)
- `docs/specs/lfcc/engineering/06_AI_Envelope_Specification.md` (AI gateway envelope)

---

## 0. Scope and Non-Goals

**Scope:**
- Define a deterministic Markdown parsing profile and canonicalization policy.
- Define line-based and semantic targeting with deterministic preconditions.
- Define Markdown-specific operations and validation rules.
- Preserve LFCC SEC and fail-closed behavior for Markdown documents.

**Non-Goals:**
- No new CRDT or storage format beyond Loro text documents.
- No automatic conversion of Markdown into rich-text block trees.
- No fuzzy or probabilistic targeting; all matching is deterministic.
- No cross-file refactoring; this proposal is single-document only.

---

## 1. Abstract

This proposal introduces **Markdown Content Mode** as a parallel content model for LFCC, enabling first-class support for Markdown documents without conversion to rich-text semantics. This addresses the growing need for AI agents to edit skills, workflows, documentation, and other Markdown-based artifacts with source fidelity.

---

## 2. Motivation

### 2.1 Problem Statement

AI programming workflows increasingly rely on Markdown:

| Use Case | Example |
|----------|---------|
| Skills | `.agent/skills/*/SKILL.md` with YAML frontmatter |
| Workflows | `.agent/workflows/*.md` with step instructions |
| Documentation | Multi-section docs with code fences, diagrams |
| Prompts | Mixed prose + code + structured data |

Current LFCC is optimized for rich-text editors with block/span semantics. When AI agents edit `.md` files, they work with **source text**, not rendered output.

### 2.2 Design Goals

1. **Source Fidelity**: Preserve Markdown source format, not convert to HTML-like trees.
2. **Line-Based Targeting**: Enable targeting by line ranges, headings, and code fences.
3. **Frontmatter Support**: First-class handling of YAML/TOML frontmatter.
4. **Determinism**: Maintain LFCC's core guarantees (SEC, fail-closed, no silent drift).
5. **Parallel Mode**: Operate alongside rich-text mode, not replace it.

---
## 3. Capability Negotiation

### 3.1 Capability Flags (Normative)

```ts
type MarkdownCapabilities = {
  markdown_content_mode?: boolean;       // Core Markdown mode
  markdown_frontmatter?: boolean;        // YAML/TOML frontmatter parsing
  markdown_frontmatter_json?: boolean;   // JSON frontmatter parsing
  markdown_code_fence_syntax?: boolean;  // Syntax-aware code fences
  markdown_line_targeting?: boolean;     // Line-range preconditions
  markdown_semantic_targeting?: boolean; // Heading/section targeting
  markdown_gfm_tables?: boolean;         // GFM tables
  markdown_gfm_task_lists?: boolean;     // GFM task lists
  markdown_gfm_strikethrough?: boolean;  // GFM strikethrough
  markdown_gfm_autolink?: boolean;       // GFM autolinks
  markdown_footnotes?: boolean;          // Footnotes extension
  markdown_wikilinks?: boolean;          // Wiki link extension
  markdown_math?: boolean;               // Inline and block math
};
```

**MCM-001:** Markdown Content Mode MUST be gated by `capabilities.markdown_content_mode = true`.  
**MCM-002:** If not negotiated, implementations MUST reject Markdown-mode requests.  
**MCM-003:** Optional Markdown extensions MUST be enabled only when both capability and policy allow them.

---

## 4. Document Model

### 4.0 Storage Model (Normative)

Markdown documents are stored as a **Loro text document** whose payload is UTF-8 Markdown source. Line endings MUST be normalized to LF before parsing, hashing, or targeting.

Line model:
- A **line** is the substring between `\n` separators after LF normalization.
- `line_count = number_of(\"\\n\") + 1` (an empty document has `line_count = 1`).
- If the content ends with a trailing `\n`, the last line is empty and still counts.

**MCM-100:** Line numbers MUST be 1-indexed to match editor conventions.  
**MCM-101:** Line ranges MUST be inclusive on both ends.

### 4.1 Markdown Block Types (Normative)

```ts
type MarkdownBlockType =
  | "md_document"        // Root container
  | "md_frontmatter"     // YAML/TOML/JSON frontmatter (if enabled)
  | "md_heading"         // ATX or Setext heading
  | "md_paragraph"       // Plain text paragraph
  | "md_code_fence"      // Fenced code block with language
  | "md_code_indent"     // Indented code block
  | "md_blockquote"      // Block quote (nestable)
  | "md_list"            // Ordered or unordered list
  | "md_list_item"       // List item with optional task state
  | "md_table"           // GFM table
  | "md_table_row"       // Table row
  | "md_table_cell"      // Table cell
  | "md_thematic_break"  // Horizontal rule
  | "md_link_def"        // Reference link definition
  | "md_html_block"      // Raw HTML block
  | "md_math_block";     // Display math (optional)

type MarkdownBlock =
  | FrontmatterBlock
  | HeadingBlock
  | CodeFenceBlock
  | ListItemBlock
  | {
      type:
        | "md_document"
        | "md_paragraph"
        | "md_code_indent"
        | "md_blockquote"
        | "md_list"
        | "md_table"
        | "md_table_row"
        | "md_table_cell"
        | "md_thematic_break"
        | "md_link_def"
        | "md_html_block"
        | "md_math_block";
      block_id: string;
      line_range: LineRange;
    };
```

### 4.2 Markdown Mark Types (Normative)

```ts
type MarkdownMark =
  | "md_strong"          // **text** or __text__
  | "md_emphasis"        // *text* or _text_
  | "md_code_span"       // `inline code`
  | "md_strikethrough"   // ~~text~~
  | "md_link"            // [text](url) or [text][ref]
  | "md_image"           // ![alt](url)
  | "md_autolink"        // <url> or <email>
  | "md_html_inline"     // Inline HTML
  | "md_math_inline"     // $LaTeX$ (optional)
  | "md_wikilink"        // [[page]] (optional)
  | "md_footnote_ref";   // [^id] (optional)
```

### 4.3 Block Schemas

#### 4.3.1 Frontmatter Block

```ts
type FrontmatterBlock = {
  type: "md_frontmatter";
  block_id: string;
  syntax: "yaml" | "toml" | "json";
  raw_content: string;              // Content between delimiters (no delimiter lines)
  line_range: LineRange;
  parsed?: {                        // Optional parsed view
    keys: FrontmatterKey[];
  };
};

type FrontmatterKey = {
  key: string;
  path: string[];                   // Nested path e.g., ["inputs", "0", "name"]
  value_type: "string" | "number" | "boolean" | "array" | "object" | "null";
  line_range: LineRange;
  raw_value: string;
};
```

#### 4.3.2 Heading Block

```ts
type HeadingBlock = {
  type: "md_heading";
  block_id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  style: "atx" | "setext";
  text: string;                     // Heading content without markers
  anchor_id?: string;               // Generated slug
  line_range: LineRange;
};
```

`anchor_id` is optional. If provided, it MUST be deterministic for a given document state; it is not used for preconditions.

#### 4.3.3 Code Fence Block

```ts
type CodeFenceBlock = {
  type: "md_code_fence";
  block_id: string;
  language?: string;                // e.g., "typescript", "mermaid"
  info_string?: string;             // Full info string after language
  content: string;                  // Code content (without fence markers)
  fence_char: "`" | "~";
  fence_length: number;             // 3 or more
  line_range: LineRange;            // Includes opening and closing fences
};
```

#### 4.3.4 List Item Block

```ts
type ListItemBlock = {
  type: "md_list_item";
  block_id: string;
  marker: "-" | "*" | "+" | `${number}.` | `${number})`;
  task_state?: "checked" | "unchecked";  // For task lists
  content: string;                       // Raw item text after marker
  line_range: LineRange;
};
```

### 4.4 Line Range Type

```ts
type LineRange = {
  start: number;   // 1-indexed, inclusive
  end: number;     // 1-indexed, inclusive
};
```

Line ranges are always interpreted against the LF-normalized document.
`start` MUST be <= `end`, and both MUST be within `1..line_count`.

**MCM-102:** Invalid line ranges MUST be rejected with `MCM_PRECONDITION_FAILED`.

### 4.5 Markdown Parsing Profile (Normative)

Implementations MUST parse Markdown deterministically using the following baseline:
- **Base grammar:** CommonMark 0.30
- **Optional extensions:** GFM tables, task lists, strikethrough, autolinks, footnotes, wikilinks, math

Enabled extensions MUST be declared in policy and gated by capabilities (§3.1, §12).

Frontmatter detection is only allowed at the start of the document (first non-empty line):
- **YAML:** starts with `---` and ends with `---` or `...` on their own lines.
- **TOML:** starts with `+++` and ends with `+++` on its own line.
- **JSON:** starts with `;;;` and ends with `;;;` on its own line (only if `markdown_frontmatter_json=true`).

**MCM-110:** Markdown parsing MUST be deterministic and based on the negotiated profile.  
**MCM-111:** Extensions not enabled by policy MUST be treated as plain text.  
**MCM-112:** Frontmatter MUST be parsed only when the opening delimiter appears on the first non-empty line.
**MCM-113:** Frontmatter parsing MUST fail with `MCM_FRONTMATTER_INVALID` if duplicate keys are encountered in the same object scope.

### 4.6 Block Identity (Normative)

`block_id` values are derived identifiers for a given document frontier and are not guaranteed to be stable across edits.

**LFCC_MD_BLOCK_V1** canonical string:
```
LFCC_MD_BLOCK_V1
type=<block_type>
start_line=<start>
end_line=<end>
content_hash=<LFCC_MD_LINE_V1>
```

**MCM-120:** `block_id` MUST be `sha256_hex` over the canonical string above (lower-case hex).  
**MCM-121:** Clients MUST NOT persist `block_id` across edits without also validating `content_hash`.

---

## 5. Targeting

### 5.1 Markdown Precondition (Normative)

```ts
type MarkdownPreconditionV1 = {
  v: 1;
  mode: "markdown";
  id: string;
  
  // Identity
  block_id?: string;                // Target block ID (if known)
  
  // Line-based targeting
  line_range?: LineRange;
  
  // Semantic targeting (alternative to line_range)
  semantic?: {
    kind: "heading" | "code_fence" | "frontmatter" | "frontmatter_key";
    
    // For heading
    heading_text?: string;
    heading_text_mode?: "exact" | "prefix";
    heading_level?: number;
    
    // For code_fence
    language?: string;
    after_heading?: string;         // Heading text that scopes the search
    after_heading_mode?: "exact" | "prefix";
    
    // For frontmatter_key
    key_path?: string[];            // e.g., ["inputs", "0", "name"]
    
    // Disambiguation
    nth?: number;                   // 1-indexed occurrence count
  };
  
  // Validation
  content_hash?: string;            // LFCC_MD_LINE_V1 hash
  context?: {
    line_before_prefix?: string;    // Prefix match, LF-normalized
    line_after_prefix?: string;     // Prefix match, LF-normalized
  };
};
```

**MCM-200:** At least one of `block_id`, `line_range`, or `semantic` MUST be provided.  
**MCM-201:** If `content_hash` is provided and mismatches, the precondition MUST fail with `MCM_CONTENT_HASH_MISMATCH`.  
**MCM-202:** Semantic targeting MUST resolve to at most one block; ambiguity MUST fail with `MCM_TARGETING_AMBIGUOUS`.  
**MCM-203:** If `block_id` is the only selector, `content_hash` MUST be provided.  
**MCM-204:** `id` MUST be present and unique within the request.  
**MCM-205:** If `context.line_before_prefix` or `context.line_after_prefix` is provided, the prefixes MUST match exactly (case-sensitive) against LF-normalized adjacent lines.
**MCM-206:** If `policy.targeting.require_content_hash=true`, `content_hash` MUST be provided.  
**MCM-207:** If `policy.targeting.require_context=true`, `context` MUST be provided.
**MCM-208:** Context prefixes MUST be limited to `policy.targeting.max_context_prefix_chars`.
**MCM-209:** If both `line_range` and `semantic` are provided, they MUST resolve to the same range or the precondition MUST fail.

If `semantic` is used, `content_hash` (when present) is computed over the resolved line range for the matched block.

### 5.1.1 Semantic Resolution (Normative)

Semantic targeting MUST be resolved against the parsed Markdown blocks in **document order**.

Heading text normalization:
- Trim leading/trailing whitespace.
- Collapse internal whitespace to single spaces.
- For ATX headings, strip trailing `#` characters and surrounding whitespace.

Resolution rules:
- `kind="heading"`: match normalized heading text with `heading_text_mode` (default `exact`), and optionally `heading_level`.
- `kind="code_fence"`: match fenced blocks by `language` (if provided). If `after_heading` is set, restrict search to the section under the first matching heading (same rules as above; `after_heading_mode` default `exact`).
- Section boundaries are defined as: from the end of the matched heading block to the line before the next heading whose level is **less than or equal** to the matched heading level; if none, to end of document.
- `kind="frontmatter"`: match the single frontmatter block if present.
- `kind="frontmatter_key"`: resolve `key_path` within parsed frontmatter; if missing, resolution fails.

`nth` is 1-indexed. If `nth` is absent, the match MUST be unique.

**MCM-210:** If the number of lines scanned exceeds `policy.targeting.max_semantic_search_lines`, resolution MUST fail with `MCM_TARGETING_SCOPE_EXCEEDED`.  
**MCM-211:** If `semantic.after_heading` is provided but no heading match is found, resolution MUST fail with `MCM_TARGETING_NOT_FOUND`.

### 5.2 Hash Algorithms

#### 5.2.1 LFCC_MD_LINE_V1

Canonical string:
```
LFCC_MD_LINE_V1
start=<start>
end=<end>
text=<joined_lines>
```

Where:
- `joined_lines` is the exact slice of lines from `start` to `end` (inclusive), joined with `\n`.
- All line endings are normalized to LF before slicing.
- Control characters are removed (C0/C1) **except** Tab (`\t`) and LF (`\n`).

Hash = SHA-256 over the canonical string, lower-case hex.

#### 5.2.2 LFCC_MD_CONTENT_V1

Canonical string:
```
LFCC_MD_CONTENT_V1
ignore_frontmatter=<true|false>
text=<normalized_content>
```

Where:
- `normalized_content` is the full document text with LF-normalized line endings.
- If `ignore_frontmatter=true`, the frontmatter block (as parsed by the negotiated profile) is removed **including** delimiter lines and the trailing newline after the closing delimiter.
- Control characters are removed (C0/C1) **except** Tab (`\t`) and LF (`\n`).

Hash = SHA-256 over the canonical string, lower-case hex.

---

## 6. Operations

### 6.1 Markdown Operation Envelope

```ts
type MarkdownOperationEnvelope = {
  mode: "markdown";
  doc_id: string;                   // Loro document id
  doc_frontier: DocFrontier;
  request_id?: string;
  agent_id?: string;
  preconditions: MarkdownPreconditionV1[];
  ops: MarkdownOperation[];
  options?: {
    return_delta?: boolean;
    validate_syntax?: boolean;      // Check Markdown validity
    validate_frontmatter?: boolean; // Check YAML/TOML/JSON validity
  };
};
```

If `file_id` is used by an implementation, it MUST map 1:1 to `doc_id`.
Markdown mode requests MUST NOT include rich-text `ops_xml` for non-Markdown operations.

Defaults:
- `validate_syntax = true`
- `validate_frontmatter = policy.sanitization.allow_frontmatter`

`doc_frontier` MUST use the LFCC v0.9 frontier object format:
```json
{ "loro_frontier": ["peer:counter", "..."] }
```

**MCM-505:** The gateway MUST ensure the document state is at least `doc_frontier` before applying operations.

### 6.2 Operation Types

```ts
type MarkdownOperation =
  | MdReplaceLines
  | MdInsertLines
  | MdDeleteLines
  | MdReplaceBlock
  | MdUpdateFrontmatter
  | MdInsertAfter
  | MdInsertBefore
  | MdInsertCodeFence;

type MdReplaceLines = {
  op: "md_replace_lines";
  precondition_id: string;
  target: { line_range: LineRange };
  content: string;                  // Replacement text
};

type MdInsertLines = {
  op: "md_insert_lines";
  precondition_id: string;
  target: { after_line: number } | { before_line: number };
  content: string;
};

type MdDeleteLines = {
  op: "md_delete_lines";
  precondition_id: string;
  target: { line_range: LineRange };
};

type MdReplaceBlock = {
  op: "md_replace_block";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownPreconditionV1["semantic"] };
  content: string;
};

type MdUpdateFrontmatter = {
  op: "md_update_frontmatter";
  precondition_id: string;
  target: { key_path: string[] };
  value: unknown;                   // JSON-serializable value
  create_if_missing?: boolean;
};

type MdInsertAfter = {
  op: "md_insert_after";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownPreconditionV1["semantic"] };
  content: string;
};

type MdInsertBefore = {
  op: "md_insert_before";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownPreconditionV1["semantic"] };
  content: string;
};

type MdInsertCodeFence = {
  op: "md_insert_code_fence";
  precondition_id: string;
  target: { block_id: string } | { semantic: MarkdownPreconditionV1["semantic"] };
  language?: string;
  content: string;
  fence_char?: "`" | "~";
  fence_length?: number;
};
```

### 6.3 XML Operation Format

```xml
<!-- Line-based operations -->
<md_replace_lines precondition="p1" start="10" end="15">
New content spanning
multiple lines
</md_replace_lines>

<md_insert_lines precondition="p2" after="20">
Inserted content
</md_insert_lines>

<md_delete_lines precondition="p3" start="5" end="8"/>

<!-- Semantic operations -->
<md_replace_block precondition="p4" heading="## Installation" level="2">
New installation instructions
</md_replace_block>

<md_insert_after precondition="p5" heading="## Usage">
Additional usage notes
</md_insert_after>

<md_insert_code_fence precondition="p6" after_heading="## Examples" language="typescript">
const example = "code";
</md_insert_code_fence>

<!-- Frontmatter operations -->
<md_update_frontmatter precondition="p7" key="description">
Updated description
</md_update_frontmatter>

<md_update_frontmatter precondition="p8" key="inputs.0.required" type="boolean">
true
</md_update_frontmatter>
```

When used with the AI Gateway, Markdown operations MUST be encoded in `ops_xml` using the `<md_*>` tags above. The JSON types in §6.2 are a canonical in-memory representation.

### 6.4 Operation Application (Normative)

- **MCM-500:** Each operation MUST include `precondition_id` referencing a precondition `id`.  
- **MCM-501:** `precondition_id` values MUST be unique within a request.  
- **MCM-502:** All preconditions MUST be evaluated against the document state at `doc_frontier`. If any precondition fails, the request MUST be rejected with no partial apply.  
- **MCM-503:** After resolving all targets to line ranges, operations MUST be applied in descending order of `start` line (then `end` line) to avoid line-index drift.  
- **MCM-504:** If resolved line ranges overlap, the request MUST be rejected with `MCM_OPERATION_OVERLAP`.
- **MCM-506:** Each operation's `target` MUST resolve to the same line range as its referenced precondition; mismatches MUST be rejected.
- **MCM-507:** `ops` and `preconditions` MUST be non-empty.

Insertion semantics:
- `md_insert_lines` inserts content **between** lines. `after_line = N` inserts after line N; `before_line = N` inserts before line N.
- `md_insert_after` and `md_insert_before` use the resolved target block's `line_range` to compute insertion points.
- Inserted `content` MUST be LF-normalized. A trailing `\n` creates an additional empty line.
- For `md_insert_code_fence`, if `fence_char` or `fence_length` is omitted, the gateway MUST use `policy.canonicalizer.normalize` defaults.

Frontmatter semantics:
- `md_update_frontmatter` MUST be rejected if `policy.sanitization.allow_frontmatter=false`.
- If frontmatter is missing and `create_if_missing=true`, the gateway MUST create frontmatter using the first format listed in `policy.parser.frontmatter_formats`.
- Frontmatter serialization MUST be deterministic for a given policy and input; formatting changes are permitted.

**MCM-508:** Frontmatter serialization MUST be deterministic for a given policy and input.
**MCM-509:** If a deterministic serializer for the selected frontmatter format is unavailable, `md_update_frontmatter` MUST be rejected with `MCM_FRONTMATTER_INVALID`.

### 6.5 AI Gateway Mapping (Recommended)

When Markdown operations are submitted through the AI Gateway v2:
- Use the standard AI envelope (`request_id`, `agent_id`, `doc_frontier`, `preconditions`, `ops_xml`).
- Set `format="markdown"` and `mode="markdown"`.
- Encode Markdown operations in `ops_xml` using `<md_*>` tags.
- Markdown operations MUST NOT be mixed with rich-text ops in the same request.

---

## 7. Canonicalization

### 7.1 Markdown Canonicalizer Policy

```ts
type MarkdownCanonicalizerPolicyV1 = {
  version: "v1";
  mode: "source_preserving" | "normalized";
  
  // Line ending normalization (always applied)
  line_ending: "lf";
  
  // Source-preserving mode options
  preserve: {
    trailing_whitespace: boolean;
    multiple_blank_lines: boolean;
    heading_style: boolean;         // ATX vs Setext
    list_marker_style: boolean;     // - vs * vs +
    emphasis_style: boolean;        // * vs _
    fence_style: boolean;           // ` vs ~
  };
  
  // Normalized mode options
  normalize: {
    heading_style: "atx";
    list_marker: "-";
    emphasis_char: "*";
    fence_char: "`";
    fence_length: 3;
  };
};
```

**MCM-300:** Line endings MUST always be normalized to LF.  
**MCM-301:** In `source_preserving` mode, other syntax variations MUST be preserved and `preserve` flags MUST be true.  
**MCM-302:** In `normalized` mode, the output MUST be deterministic for equivalent content.  
**MCM-303:** The canonicalizer mode MUST be selected by policy and negotiated deterministically.

### 7.2 Canonical Output

```ts
type MarkdownDiagnostic = {
  code: string;
  line?: number;
  detail: string;
};

type MarkdownCanonicalResult = {
  content: string;                  // Canonicalized source text
  content_hash: string;             // LFCC_MD_CONTENT_V1
  structure: {
    frontmatter?: FrontmatterBlock;
    blocks: MarkdownBlock[];         // Document order
  };
  diagnostics: MarkdownDiagnostic[];
};
```

---

## 8. Validation

### 8.1 Syntax Validation

```ts
type MarkdownValidationResult = {
  valid: boolean;
  syntax_errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: "error" | "warning";
  }>;
  frontmatter_errors?: Array<{
    key_path: string[];
    message: string;
  }>;
};
```

**MCM-450:** If `validate_syntax=true` and any `syntax_errors` have `severity="error"`, the request MUST be rejected with `MCM_SYNTAX_ERROR`.  
**MCM-451:** If `validate_frontmatter=true` and frontmatter parsing fails, the request MUST be rejected with `MCM_FRONTMATTER_INVALID`.

### 8.2 Sanitization Policy

```ts
type MarkdownSanitizationPolicyV1 = {
  version: "v1";
  
  // Block restrictions
  allowed_block_types: MarkdownBlockType[];
  allowed_mark_types: MarkdownMark[];
  allow_html_blocks: boolean;
  allow_frontmatter: boolean;
  reject_unknown_structure: boolean;
  
  // Code fence restrictions
  allowed_languages?: string[];     // Whitelist; undefined = all
  blocked_languages?: string[];     // Blacklist
  max_code_fence_lines: number;
  
  // Link restrictions
  link_url_policy: UrlPolicyLevel;
  image_url_policy: UrlPolicyLevel;
  
  // Limits
  max_file_lines: number;
  max_line_length: number;
  max_heading_depth: number;
  max_list_depth: number;
  max_frontmatter_bytes: number;
};

type UrlPolicyLevel = "strict" | "moderate" | "permissive";
```

**MCM-400:** HTML blocks MUST be rejected when `allow_html_blocks=false`.  
**MCM-401:** Code fences with disallowed languages MUST be rejected.  
**MCM-402:** Inline marks not listed in `allowed_mark_types` MUST be stripped; if `reject_unknown_structure=true` and stripping would change block semantics, the request MUST be rejected.
**MCM-403:** If `max_file_lines` or `max_line_length` is exceeded, the request MUST be rejected with `MCM_LINE_LIMIT_EXCEEDED`.
**MCM-404:** If any code fence exceeds `max_code_fence_lines`, the request MUST be rejected with `MCM_LINE_LIMIT_EXCEEDED`.

URL policy levels:
- `strict`: allow `https:` and `mailto:` only.
- `moderate`: allow `https:`, `mailto:`, and relative URLs without a scheme.
- `permissive`: allow any URL except those starting with `javascript:`, `data:`, or `vbscript:` (case-insensitive).

**MCM-405:** URL checks MUST be applied after trimming whitespace and normalizing to lower-case for scheme comparisons.
**MCM-406:** If `allowed_languages` is set, only those languages are permitted; otherwise, all languages except those in `blocked_languages` are permitted.
**MCM-407:** If `allow_frontmatter=false`, frontmatter blocks MUST be rejected or stripped according to `reject_unknown_structure`.
**MCM-408:** If `max_frontmatter_bytes` is exceeded, the request MUST be rejected with `MCM_LINE_LIMIT_EXCEEDED`.

---

## 9. Delta Response

```ts
type MarkdownDeltaResponse = {
  frontier_delta: {
    from_frontier: DocFrontier;
    to_frontier: DocFrontier;
  };
  affected_lines: LineRange[];
  affected_blocks: Array<{
    block_id: string;
    type: MarkdownBlockType;
    line_range: LineRange;
    status: "created" | "updated" | "deleted" | "moved";
  }>;
  new_content_hash: string;
};
```

**MCM-700:** When `options.return_delta=true`, the response MUST include `frontier_delta`, `affected_lines`, and `new_content_hash`.  
**MCM-701:** `new_content_hash` MUST be computed with `LFCC_MD_CONTENT_V1` and `ignore_frontmatter=false`.  
**MCM-702:** `affected_lines` MUST include all line ranges touched by the applied operations.  
**MCM-703:** On success, `frontier_delta.to_frontier` MUST equal the applied frontier; on 409, it MUST equal the current frontier.

---

## 10. Error Codes

When used via the AI Gateway, top-level error codes MUST follow LFCC v0.9 RC (Appendix C). Markdown-specific detail is reported as `diagnostics[].code` subcodes.

| Subcode | Parent Code | HTTP | Description |
|---------|-------------|------|-------------|
| `MCM_PRECONDITION_FAILED` | `AI_PRECONDITION_FAILED` | 409 | Line range or semantic target not found |
| `MCM_TARGETING_AMBIGUOUS` | `AI_PRECONDITION_FAILED` | 409 | Semantic target matches multiple blocks |
| `MCM_TARGETING_NOT_FOUND` | `AI_PRECONDITION_FAILED` | 409 | Semantic scope not found |
| `MCM_TARGETING_SCOPE_EXCEEDED` | `AI_PRECONDITION_FAILED` | 409 | Semantic search exceeded policy limit |
| `MCM_CONTENT_HASH_MISMATCH` | `AI_PRECONDITION_FAILED` | 409 | Content hash does not match |
| `MCM_OPERATION_OVERLAP` | `AI_PRECONDITION_FAILED` | 409 | Overlapping operations in one request |
| `MCM_SYNTAX_ERROR` | `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` | 422 | Invalid Markdown syntax after operation |
| `MCM_FRONTMATTER_INVALID` | `AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION` | 422 | Invalid YAML/TOML/JSON frontmatter |
| `MCM_BLOCK_TYPE_DISALLOWED` | `AI_PAYLOAD_REJECTED_SANITIZE` | 400 | Block type not in allowed list |
| `MCM_LANGUAGE_DISALLOWED` | `AI_PAYLOAD_REJECTED_SANITIZE` | 400 | Code fence language not allowed |
| `MCM_LINE_LIMIT_EXCEEDED` | `AI_PAYLOAD_REJECTED_LIMITS` | 400 | File exceeds line limit |

---

## 11. SDK Interface

### 11.1 MarkdownEditSession

```ts
interface MarkdownEditSession {
  // Document access
  getContent(): string;
  getLines(): string[];
  getStructure(): MarkdownStructure;
  
  // Targeting helpers
  findHeading(text: string, level?: number): HeadingTarget | null;
  findCodeFence(options: { language?: string; after_heading?: string; nth?: number }): CodeFenceTarget | null;
  findFrontmatterKey(path: string[]): FrontmatterKeyTarget | null;
  
  // Edit builders
  replaceLines(range: LineRange, content: string): PendingEdit;
  insertAfterHeading(headingText: string, content: string): PendingEdit;
  insertCodeFence(options: InsertCodeFenceOptions): PendingEdit;
  updateFrontmatter(keyPath: string[], value: unknown): PendingEdit;
  
  // Execution
  preview(edits: PendingEdit[]): Promise<PreviewResult>;
  apply(edits: PendingEdit[]): Promise<ApplyResult>;
}

type HeadingTarget = {
  block_id: string;
  text: string;
  level: number;
  line_range: LineRange;
};

type CodeFenceTarget = {
  block_id: string;
  language?: string;
  line_range: LineRange;
};

type FrontmatterKeyTarget = {
  key_path: string[];
  line_range: LineRange;
};

type PendingEdit = {
  op: MarkdownOperation;
};

type PreviewResult = {
  ok: boolean;
  diagnostics: MarkdownDiagnostic[];
  delta?: MarkdownDeltaResponse;
};

type ApplyResult = {
  ok: boolean;
  applied_frontier?: DocFrontier;
  delta?: MarkdownDeltaResponse;
  error?: { code: string; diagnostics?: MarkdownDiagnostic[] };
};

interface MarkdownStructure {
  frontmatter?: {
    syntax: "yaml" | "toml" | "json";
    keys: string[];
    line_range: LineRange;
  };
  headings: Array<{
    text: string;
    level: number;
    block_id: string;
    line: number;
    anchor_id: string;
  }>;
  code_fences: Array<{
    language?: string;
    block_id: string;
    line_range: LineRange;
    section?: string;      // Preceding heading text
  }>;
  line_count: number;
}
```

---

## 12. Policy Extension

Add to `PolicyManifestV095`:

```ts
type PolicyManifestV095 = PolicyManifestV094 & {
  lfcc_version: "0.9.5";
  markdown_policy?: MarkdownPolicyV1;
  capabilities: PolicyManifestV094["capabilities"] & MarkdownCapabilities;
};

type MarkdownPolicyV1 = {
  version: "v1";
  enabled: boolean;
  parser: {
    profile: "commonmark_0_30";
    extensions: {
      gfm_tables: boolean;
      gfm_task_lists: boolean;
      gfm_strikethrough: boolean;
      gfm_autolink: boolean;
      footnotes: boolean;
      wikilinks: boolean;
      math: boolean;
    };
    frontmatter_formats: Array<"yaml" | "toml" | "json">;
  };
  canonicalizer: MarkdownCanonicalizerPolicyV1;
  sanitization: MarkdownSanitizationPolicyV1;
  targeting: {
    require_content_hash: boolean;
    require_context: boolean;
    max_semantic_search_lines: number;
    max_context_prefix_chars: number;
  };
};
```

Negotiation (normative):
- `enabled = AND`
- `parser.profile` MUST match exactly
- `parser.extensions.* = AND`
- `parser.frontmatter_formats = intersection`
- `canonicalizer.mode` MUST match exactly (or reject)
- `sanitization.allowed_block_types = intersection`
- `sanitization.allowed_mark_types = intersection`
- `sanitization.allow_html_blocks = AND`
- `sanitization.allow_frontmatter = AND`
- `sanitization.reject_unknown_structure = AND`
- `sanitization.allowed_languages = intersection`
- `sanitization.blocked_languages = union`
- `sanitization` limits use min across participants
- `targeting.require_content_hash = OR` (stricter)
- `targeting.require_context = OR` (stricter)
- `targeting.max_semantic_search_lines = min(...)`
- `targeting.max_context_prefix_chars = min(...)`

**MCM-600:** Requests MUST be rejected when the negotiated Markdown policy is disabled.
**MCM-601:** If `sanitization.allow_frontmatter=true`, `parser.frontmatter_formats` MUST be non-empty.

---

## 13. Conformance Tests

### 13.1 Targeting Tests

1. Line range targeting matches exact lines.
2. Heading semantic targeting finds correct block.
3. Code fence targeting with language filter works.
4. Frontmatter key targeting navigates nested paths.
5. Ambiguous semantic targets fail with `MCM_TARGETING_AMBIGUOUS`.
6. `context` prefix mismatches fail deterministically.

### 13.2 Operation Tests

1. `md_replace_lines` replaces exact range.
2. `md_insert_lines` inserts at correct position.
3. `md_update_frontmatter` preserves YAML formatting.
4. `md_insert_after` inserts after semantic target.
5. Overlapping operations reject with `MCM_OPERATION_OVERLAP`.

### 13.3 Hash Tests

1. `LFCC_MD_LINE_V1` produces deterministic hash.
2. `LFCC_MD_CONTENT_V1` preserves LF-normalized content deterministically.
3. Frontmatter ignoring works correctly.
4. `LFCC_MD_BLOCK_V1` deterministically matches block_id for a stable frontier.

### 13.4 Validation Tests

1. Invalid Markdown syntax is rejected.
2. Invalid YAML frontmatter is rejected.
3. Disallowed languages are rejected.
4. Line length/line count limits are enforced.

### 13.5 Parsing Profile Tests

1. Extensions disabled by policy are parsed as plain text.
2. JSON frontmatter requires `markdown_frontmatter_json=true` and `;;;` delimiters.

---

## 14. Migration

### 14.1 Compatibility

- Rich-text mode requests continue unchanged.
- Markdown mode is opt-in via `mode: "markdown"`.
- No changes to existing block types or operations.

### 14.2 Gradual Adoption

1. **Phase 1:** Enable `markdown_content_mode` capability.
2. **Phase 2:** Use line-based targeting for simple edits.
3. **Phase 3:** Use semantic targeting for heading/fence edits.
4. **Phase 4:** Use frontmatter operations for metadata.

---

## 15. Version History

- **v0.9.5-draft (2026-01-22):** Initial proposal for Markdown Content Mode.
- **v0.9.5-draft.2 (2026-01-22):** Clarified parsing profile, targeting semantics, op ordering, error subcodes, and policy negotiation.
