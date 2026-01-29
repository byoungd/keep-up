---
description: Implement LFCC AI-Native Coding Markdown Enhancements (Phases 1-3)
---

# LFCC AI-Native Markdown Implementation Workflow

Implements AI-Native Coding Markdown Support enhancements for LFCC protocol.

**References**:
- [LFCC v0.9.6 Performance Enhancement](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/lfcc/proposals/LFCC_v0.9.6_Performance_Enhancement.md)
- [LFCC v0.9.5 Markdown Content Mode](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/lfcc/proposals/LFCC_v0.9.5_Markdown_Content_Mode.md)

---

## Phase 1: Code Block & Targeting Enhancements

### 1.1 Add CodeFenceValidationPolicy

**File**: `packages/core/src/kernel/policy/types.ts`

```typescript
type CodeFenceValidationPolicy = {
  strict_syntax_check: boolean;
  allowed_languages: string[];
  fallback_language?: string;
};
```

// turbo
1. Run `pnpm build --filter @ku0/core` to verify type changes

### 1.2 Extend MarkdownPreconditionV1 with inner_target

**File**: `packages/core/src/markdown/types.ts`

Add to `MarkdownSemanticTarget`:
```typescript
inner_target?: {
  kind: "function" | "class" | "variable" | "import" | "line_range";
  name?: string;
  signature_prefix?: string;
  line_offset?: LineRange;
};
```

### 1.3 Update Semantic Resolution

**File**: `packages/core/src/markdown/semantic.ts`

- Extend `resolveMarkdownSemanticTarget` to handle `inner_target`
- Return sub-ranges within code fences when `inner_target` is specified
- Return `MCM_TARGETING_NOT_FOUND` if symbol not found

### 1.4 Implement Native Stub

**File**: `packages/core/src/markdown/native.ts`

Replace stub with validation logic:
```typescript
export async function resolveNativeMarkdownContent(
  content: string
): Promise<string | null> {
  // Validate basic markdown structure
  // Prepare for Rust NAPI binding
  return content;
}
```

// turbo
2. Run `pnpm test --filter @ku0/core -- --grep "markdown"` to verify

---

## Phase 2: AST-Level Operations

### 2.1 Define New Operation Types

**File**: `packages/core/src/markdown/types.ts`

```typescript
type MdReplaceCodeSymbol = {
  op: "md_replace_code_symbol";
  precondition_id: string;
  target: {
    code_fence_id: string;
    symbol: { kind: "function" | "class" | "variable"; name: string; signature_hash?: string };
  };
  content: string;
};

type MdInsertCodeMember = {
  op: "md_insert_code_member";
  precondition_id: string;
  target: { code_fence_id: string; after_symbol?: string; before_symbol?: string };
  content: string;
};
```

Update `MarkdownOperation` union to include new types.

### 2.2 Tree-sitter Integration in Rust

**Directory**: `packages/markdown-content-rs/src/ast/`

1. Add dependencies to `Cargo.toml`:
   ```toml
   tree-sitter = "0.20"
   tree-sitter-typescript = "0.20"
   tree-sitter-python = "0.20"
   ```

2. Create AST module structure:
   ```
   src/ast/
   ├── mod.rs
   ├── parser.rs
   ├── symbols.rs
   └── languages/
       ├── typescript.rs
       ├── python.rs
       └── rust.rs
   ```

3. Expose NAPI binding:
   ```rust
   #[napi(js_name = "resolveCodeSymbol")]
   pub fn resolve_code_symbol(
       content: String,
       language: String,
       symbol_name: String,
       symbol_kind: String,
   ) -> NapiResult<Option<LineRange>> { ... }
   ```

// turbo
3. Run `cd packages/markdown-content-rs && cargo build` to verify Rust compilation

### 2.3 Connect Core to Native Parser

**File**: `packages/core/src/markdown/native.ts`

```typescript
import { resolveCodeSymbol } from "@ku0/markdown-content-rs";

export async function resolveCodeBlockSymbol(
  content: string,
  language: string,
  symbol: { name: string; kind: string }
): Promise<LineRange | null> {
  return resolveCodeSymbol(content, language, symbol.name, symbol.kind);
}
```

**File**: `packages/core/src/markdown/lineOps.ts`

- Add handlers for `md_replace_code_symbol` and `md_insert_code_member`
- Use `resolveCodeBlockSymbol` to locate target positions

---

## Phase 3: Multi-Document Support

### 3.1 Define Workspace Types

**File**: `packages/core/src/markdown/workspace.ts` (NEW)

```typescript
type WorkspacePrecondition = {
  v: 1;
  mode: "workspace";
  files: Array<{ path: string; precondition: MarkdownPreconditionV1 }>;
};

type MdWorkspaceRefactor = {
  op: "md_workspace_refactor";
  preconditions: WorkspacePrecondition;
  refactor_type: "rename" | "move" | "extract" | "inline";
  scope: {
    from: { path: string; symbol: string };
    to: { path?: string; symbol?: string };
  };
};
```

### 3.2 Implement Workspace Resolver

- Resolve preconditions against file system or virtual workspace
- Ensure atomicity: all files succeed or rollback

### 3.3 VCS Integration Hooks

- Design `pre-commit` hook for workspace invariant verification
- Optional: integrate with Git staging

---

## Verification

// turbo
4. Run `pnpm test --filter @ku0/core` to ensure no regressions

// turbo
5. Run `pnpm test --filter @ku0/conformance-kit` to verify conformance

### Unit Test Additions

**Directory**: `packages/core/src/markdown/__tests__/`

- `inner-targeting.test.ts`: Test `inner_target` resolution
- `ast-operations.test.ts`: Test `MdReplaceCodeSymbol` and `MdInsertCodeMember`
- `workspace.test.ts`: Test workspace precondition resolution

### Conformance Test Additions

**Directory**: `packages/conformance-kit/src/__tests__/`

Add test vectors for:
- Exact function targeting
- Symbol replacement
- Multi-file workspace operations
