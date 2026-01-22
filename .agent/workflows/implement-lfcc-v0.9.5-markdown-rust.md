---
description: Implement LFCC v0.9.5 Markdown Content Mode using Rust (parser, targeting, ops, frontmatter).
---

# Workflow: Implement LFCC v0.9.5 Markdown Content Mode (Rust)

## Inputs (local changes)

- `docs/specs/lfcc/proposals/LFCC_v0.9.5_Markdown_Content_Mode.md`
- `docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md` (Markdown payload support)
- `docs/specs/lfcc/engineering/06_AI_Envelope_Specification.md`
- `docs/specs/lfcc/engineering/02_Policy_Manifest_Schema.md`
- `docs/specs/lfcc/VERSION_INDEX.md`

## Phase 1: Package scaffolding

1. Create `packages/markdown-content-rs`.
2. Copy templates from `packages/native-bindings/templates/`.
3. Set `package.json` name to `@ku0/markdown-content-rs`.
4. Add Rust dependencies: `napi`, `napi-derive`, `sha2`, `serde`, `serde_json`, `toml`, `serde_yaml`.
5. Choose a deterministic CommonMark parser (for example `comrak`) and lock extensions to policy flags.

## Phase 2: Rust core implementation

1. Normalization and hashing
   - Normalize CRLF to LF and strip control characters.
   - Implement `LFCC_MD_LINE_V1` and `LFCC_MD_CONTENT_V1`.
2. Markdown parsing and block mapping
   - Parse with CommonMark 0.30 profile plus gated extensions.
   - Build `MarkdownBlock` entries with `line_range` and `block_id` (`LFCC_MD_BLOCK_V1`).
3. Frontmatter handling
   - Detect YAML/TOML/JSON frontmatter on the first non-empty line.
   - Parse deterministically and emit `FrontmatterKey` line ranges.
4. Target resolution
   - Resolve `line_range` and semantic targeting (heading, code fence, frontmatter, frontmatter_key).
   - Enforce `content_hash`, `context` prefix rules, and ambiguity checks.
5. Operation application
   - Implement `md_replace_lines`, `md_insert_lines`, `md_delete_lines`.
   - Implement `md_replace_block`, `md_insert_after`, `md_insert_before`, `md_insert_code_fence`.
   - Implement `md_update_frontmatter` with deterministic serialization.
6. Diagnostics
   - Emit `MCM_*` subcodes and cap diagnostic size.

## Phase 3: N-API bindings and TypeScript wrapper

1. Expose parse, hash, targeting, and apply functions via `napi`.
2. Add TypeScript adapters in `packages/markdown-content-rs/src/index.ts`.

## Phase 4: Gateway integration

1. Route `mode: "markdown"` envelopes to the Markdown engine.
2. Enforce capability and policy gating for extensions (frontmatter, GFM, math, wikilinks).
3. Reject rich-text ops when mode is markdown.
4. Map Markdown diagnostics to AI envelope error codes.

## Phase 5: Conformance and tests

1. Add vectors under `packages/conformance-kit/src/markdown`.
2. Cover line hashing, block IDs, semantic targeting, and frontmatter updates.
3. Add Rust unit tests for canonicalization and parsing edge cases.

## Phase 6: Build and verify

```bash
pnpm --filter @ku0/markdown-content-rs build
pnpm --filter @ku0/conformance-kit test
pnpm biome check --write
```
