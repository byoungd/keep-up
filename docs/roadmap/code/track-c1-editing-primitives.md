# Track C1: Advanced Code Editing Primitives

**Objective**: Implement robust, fault-tolerant file manipulation tools for the Agent, enabling it to read, edit, and navigate codebases with "human-like" reliability.

**Status**: Ready for Implementation
**Priority**: High (Fundamental Capability)
**Feature Branch**: `feat/code-editing-primitives`

---

## 1. Context & Design Philosophy

Based on the analysis of `opencode` (Go) and `MetaGPT/SWE-agent` (Shell/Python), mere string replacement is insufficient for autonomous agents. We need **Robust Primitives** that handle typical LLM failure modes:
- **Line Number Drift**: LLMs struggle to count lines perfectly.
- **Context Mismatch**: Code may change slightly between "read" and "edit".
- **Syntax Errors**: Agents may generate invalid code.

**Key Design Decisions**:
1.  **Atomic Operations**: All edits are transactional.
2.  **Lint-Driven Feedback**: Edits are immediately validated; invalid syntax triggers automatic rollback and error reporting.
3.  **Fuzzy Matching**: Support `patch` application that tolerates minor whitespace/context mismatches.

---

## 2. File Structure

Create the following directory structure under `packages/agent-runtime/src/tools/`:

```
packages/agent-runtime/src/tools/code/
├── index.ts           # Public exports
├── codeServer.ts      # Tool server (extends BaseToolServer)
├── fileSystem.ts      # Core file read/list operations
├── editor.ts          # Line-based editing with rollback
└── patch.ts           # Unified diff parser and fuzzy applier
```

---

## 3. Core Interfaces (`fileSystem.ts`)

```typescript
// packages/agent-runtime/src/tools/code/fileSystem.ts

export interface ReadFileOptions {
  /** 1-indexed start line (inclusive). If omitted, start from line 1. */
  startLine?: number;
  /** 1-indexed end line (inclusive). If omitted, read to EOF. */
  endLine?: number;
  /** Prepend line numbers to each line (e.g., "  10: const x = 1;"). Default: true */
  withLineNumbers?: boolean;
}

export interface ReadFileResult {
  path: string;
  totalLines: number;
  content: string;
  /** Range of lines actually returned [startLine, endLine] */
  range: [number, number];
}

export interface ListFilesOptions {
  /** Max depth for recursive listing. Default: Infinity */
  maxDepth?: number;
  /** Include hidden files/directories. Default: false */
  includeHidden?: boolean;
  /** Respect .gitignore. Default: true */
  respectGitignore?: boolean;
}

export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

/**
 * Read a file with optional line range.
 */
export async function readFile(path: string, options?: ReadFileOptions): Promise<ReadFileResult>;

/**
 * List files in a directory.
 */
export async function listFiles(path: string, options?: ListFilesOptions): Promise<FileEntry[]>;
```

---

## 4. Editor with Lint-Rollback (`editor.ts`)

```typescript
// packages/agent-runtime/src/tools/code/editor.ts

export interface EditChunk {
  /** 1-indexed start line (inclusive) */
  startLine: number;
  /** 1-indexed end line (inclusive) */
  endLine: number;
  /** Replacement content (may be empty to delete lines) */
  replacement: string;
}

export interface EditOptions {
  /** If true, do not write changes to disk. Default: false */
  dryRun?: boolean;
  /** If true, run syntax validation after edit. Default: true for known languages */
  validateSyntax?: boolean;
}

export interface EditResult {
  success: boolean;
  /** Unified diff of the change */
  diff: string;
  /** If syntax validation failed, the error message */
  syntaxError?: string;
  /** If rollback occurred */
  rolledBack?: boolean;
}

/**
 * Apply one or more edits to a file atomically.
 * If any edit fails validation, ALL edits are rolled back.
 */
export async function editFile(
  path: string,
  edits: EditChunk[],
  options?: EditOptions
): Promise<EditResult>;
```

**Implementation Notes**:
1. **Backup**: Before any edit, store original content in memory.
2. **Apply**: Replace lines in-place. Sort edits by `startLine` descending to avoid index shifts.
3. **Validate**: Prefer repo-configured checks (e.g., `pnpm typecheck`, `pnpm lint`) and compare diagnostics before/after so pre-existing errors do not cause rollbacks. If no project config exists, fall back to language-specific checks: TypeScript `tsc --noEmit` on the target file(s), JavaScript `node --check`, Python `python -m py_compile path`.
4. **Rollback**: If validation fails, restore original content and return error.
5. **Diff**: Use `diff` library (e.g., `diff` npm package) to generate unified diff output.

---

## 5. Fuzzy Patch Application (`patch.ts`)

Port the fuzzy matching logic from `opencode/internal/diff/patch.go`.

```typescript
// packages/agent-runtime/src/tools/code/patch.ts

export interface ApplyPatchResult {
  success: boolean;
  /** Fuzz level used (0 = exact, 1 = trimEnd, 2 = trim) */
  fuzzLevel: number;
  /** Files modified */
  filesModified: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Apply a unified diff patch to one or more files.
 * Supports fuzzy context matching to tolerate minor LLM errors.
 */
export async function applyPatch(
  patchContent: string,
  basePath?: string
): Promise<ApplyPatchResult>;
```

**Fuzzy Matching Algorithm** (from `opencode`):
1. **Pass 1 (Exact)**: Match context lines exactly (fuzzLevel = 0).
2. **Pass 2 (Trim Right)**: Ignore trailing whitespace (`trimEnd()`, fuzzLevel = 1).
3. **Pass 3 (Trim All)**: Ignore all whitespace (`trim()`, fuzzLevel = 2).
4. If all passes fail, return error with context mismatch details.

---

## 6. Tool Server (`codeServer.ts`)

```typescript
// packages/agent-runtime/src/tools/code/codeServer.ts

import { BaseToolServer, textResult, errorResult } from "../mcp/baseServer";
import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import * as fs from "./fileSystem";
import * as editor from "./editor";
import * as patch from "./patch";

export class CodeToolServer extends BaseToolServer {
  readonly name = "code";
  readonly description = "Code file reading, editing, and patching tools";

  constructor() {
    super();
    this.registerTool(this.createReadFileTool(), this.handleReadFile.bind(this));
    this.registerTool(this.createEditFileTool(), this.handleEditFile.bind(this));
    this.registerTool(this.createApplyPatchTool(), this.handleApplyPatch.bind(this));
  }

  private createReadFileTool(): MCPTool {
    return {
      name: "read_file",
      description: "Read a file's content, optionally specifying a line range.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          start_line: { type: "number", description: "1-indexed start line (inclusive)" },
          end_line: { type: "number", description: "1-indexed end line (inclusive)" },
          with_line_numbers: { type: "boolean", description: "Include line numbers in output (default: true)" }
        },
        required: ["path"]
      }
    };
  }

  // ... implement other tool definitions similarly
}

export function createCodeToolServer(): CodeToolServer {
  return new CodeToolServer();
}
```

---

## 7. Verification Plan

### Unit Tests (`packages/agent-runtime/src/tools/code/__tests__/editor.test.ts`)

```typescript
import { editFile } from "../editor";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("editFile", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-test-"));
    testFile = path.join(tempDir, "test.ts");
    await fs.writeFile(testFile, "line1\nline2\nline3\nline4\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it("should replace lines correctly", async () => {
    const result = await editFile(testFile, [
      { startLine: 2, endLine: 3, replacement: "newLine2\nnewLine3" }
    ]);
    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("line1\nnewLine2\nnewLine3\nline4\n");
  });

  it("should rollback on syntax error", async () => {
    const tsFile = path.join(tempDir, "syntax.ts");
    await fs.writeFile(tsFile, "const x: number = 1;\n");

    const result = await editFile(tsFile, [
      { startLine: 1, endLine: 1, replacement: "const x: number = 'invalid';" } // Type error
    ], { validateSyntax: true });

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.syntaxError).toContain("error");
  });
});
```

---

## 8. Implementation Checklist

1. [ ] Create `packages/agent-runtime/src/tools/code/` directory
2. [ ] Implement `fileSystem.ts` with `readFile` and `listFiles`
3. [ ] Implement `editor.ts` with `editFile` (including rollback logic)
4. [ ] Implement `patch.ts` with fuzzy matching (port from `opencode`)
5. [ ] Implement `codeServer.ts` extending `BaseToolServer`
6. [ ] Export from `index.ts`
7. [ ] Register in agent-runtime main exports (optional)
8. [ ] Write unit tests for all modules
9. [ ] Run `pnpm typecheck` and `pnpm test`
10. [ ] Commit to `feat/code-editing-primitives` and create PR
