# Track C2: Intelligent Context Management

**Objective**: Solve the "Lost in the Haystack" problem by giving the Agent tools to manage its own context window usage efficiently.

**Status**: ✅ Completed
**Priority**: High (Complements C1)
**Feature Branch**: `main` (Merged)
**Depends On**: Track C1 (`fileSystem.ts`)

---

## 1. Context & Design Philosophy

Top performing agents (SWE-agent) do not read whole files by default. They "scroll" and "peek".
- **Windowing**: Only view 100 lines at a time.
- **Skeletonizing**: View class/function structure without implementation details.
- **Search-Driven**: Find relevance before reading.

**Inspiration Sources**:
- `SWE-agent`'s `open/scroll_up/scroll_down/goto` shell commands.
- `opencode`'s integration with tree-sitter for AST parsing.

---

## 2. File Structure

Extend the `packages/agent-runtime/src/tools/code/` directory:

```
packages/agent-runtime/src/tools/code/
├── ... (from Track C1)
├── skeleton.ts        # Code outline/skeleton extraction
├── search.ts          # Ripgrep-based code search
└── window.ts          # Stateful windowed file viewing
```

---

## 3. Code Skeleton Extraction (`skeleton.ts`)

```typescript
// packages/agent-runtime/src/tools/code/skeleton.ts

export interface OutlineItem {
  /** Symbol name (e.g., "MyClass", "myFunction") */
  name: string;
  /** Symbol kind */
  kind: "class" | "function" | "method" | "interface" | "type" | "variable" | "import";
  /** 1-indexed line range [start, end] */
  range: [number, number];
  /** Nested children (e.g., methods inside a class) */
  children?: OutlineItem[];
  /** Full signature for functions/methods */
  signature?: string;
}

export interface OutlineResult {
  path: string;
  totalLines: number;
  items: OutlineItem[];
}

/**
 * Extract a structural outline from a source file.
 * Uses regex-based parsing for TypeScript/JavaScript.
 * Future: Integrate tree-sitter for more accurate parsing.
 */
export async function getOutline(path: string): Promise<OutlineResult>;
```

**Implementation Approach**:
For TypeScript/JavaScript, use a simple regex-based parser:
```typescript
// Simplified regex patterns
const CLASS_REGEX = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
const FUNCTION_REGEX = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
const ARROW_FUNCTION_REGEX = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/gm;
const INTERFACE_REGEX = /^(?:export\s+)?interface\s+(\w+)/gm;
const TYPE_REGEX = /^(?:export\s+)?type\s+(\w+)/gm;
```

**Example Output** (Token-efficient):
```
class Foo (lines 10-50)
  constructor() (lines 11-15)
  methodA() (lines 17-30)
  methodB() (lines 32-48)
interface Bar (lines 52-60)
function helper() (lines 62-70)
```

---

## 4. Code Search (`search.ts`)

```typescript
// packages/agent-runtime/src/tools/code/search.ts

export interface SearchOptions {
  /** Search in a specific file or directory. If omitted, search from cwd. */
  path?: string;
  /** Case-sensitive search. Default: false (smart case) */
  caseSensitive?: boolean;
  /** Treat query as regex. Default: false (literal) */
  isRegex?: boolean;
  /** Max results to return. Default: 50 */
  maxResults?: number;
  /** File extensions to include (e.g., [".ts", ".tsx"]) */
  includeExtensions?: string[];
  /** Glob patterns to exclude (e.g., ["**/node_modules/**"]) */
  excludePatterns?: string[];
}

export interface SearchMatch {
  path: string;
  lineNumber: number;
  content: string;
}

export interface SearchResult {
  query: string;
  matchCount: number;
  matches: SearchMatch[];
  truncated: boolean;
}

/**
 * Search for text in files using ripgrep (rg).
 * Falls back to native Node.js search if rg is not available.
 */
export async function searchCode(query: string, options?: SearchOptions): Promise<SearchResult>;
```

**Implementation Notes**:
1. Check if `rg` (ripgrep) is available via `which rg`.
2. If available, spawn `rg --json` for structured output.
3. If not available, use Node.js `fs.readdir` + `readFile` with regex matching.
4. Always respect `.gitignore` by default (ripgrep does this automatically).

**Example Command**:
```bash
rg --json --max-count 50 "searchTerm" --type ts ./src
```

---

## 5. Windowed File Viewing (`window.ts`)

Stateful viewer that maintains "current file" and "current viewport" per session.

```typescript
// packages/agent-runtime/src/tools/code/window.ts

export interface WindowState {
  currentFile: string | null;
  currentLine: number; // Center of viewport
  windowSize: number;  // Lines to show (default: 100)
}

export interface WindowViewResult {
  path: string;
  totalLines: number;
  viewportStart: number; // 1-indexed
  viewportEnd: number;   // 1-indexed
  content: string;       // Content with line numbers
  linesAbove: number;    // How many lines are above viewport
  linesBelow: number;    // How many lines are below viewport
}

/**
 * Create a windowed file viewer.
 * Maintains state across calls for a scrolling experience.
 */
export function createWindowViewer(windowSize?: number): {
  open: (path: string, line?: number) => Promise<WindowViewResult>;
  scrollUp: () => Promise<WindowViewResult>;
  scrollDown: () => Promise<WindowViewResult>;
  goto: (line: number) => Promise<WindowViewResult>;
  getState: () => WindowState;
};
```

**Usage Pattern** (mimics SWE-agent):
```
Agent: open("src/index.ts")         -> Shows lines 1-100
Agent: scrollDown()                 -> Shows lines 80-180 (20 line overlap)
Agent: goto(500)                    -> Shows lines 450-550
```

---

## 6. Tool Definitions (MCP)

Add to `codeServer.ts`:

```typescript
// Tool: view_outline
{
  name: "view_outline",
  description: "Get the structure/skeleton of a source file (classes, functions, etc.) without implementation details.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the source file" }
    },
    required: ["path"]
  }
}

// Tool: search_code
{
  name: "search_code",
  description: "Search for text or patterns across the codebase using ripgrep.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term or regex pattern" },
      path: { type: "string", description: "Limit search to this file or directory" },
      is_regex: { type: "boolean", description: "Treat query as regex (default: false)" },
      case_sensitive: { type: "boolean", description: "Case-sensitive search (default: false)" }
    },
    required: ["query"]
  }
}

// Tool: scroll_file
{
  name: "scroll_file",
  description: "Navigate through the currently open file (scroll up, down, or go to a specific line).",
  inputSchema: {
    type: "object",
    properties: {
      action: { 
        type: "string", 
        enum: ["open", "scroll_up", "scroll_down", "goto"],
        description: "Navigation action"
      },
      path: { type: "string", description: "File to open (required for 'open' action)" },
      line: { type: "number", description: "Line number (required for 'goto', optional for 'open')" }
    },
    required: ["action"]
  }
}
```

---

## 7. Verification Plan

### Unit Tests

```typescript
// packages/agent-runtime/src/tools/code/__tests__/skeleton.test.ts
import { getOutline } from "../skeleton";

describe("getOutline", () => {
  it("should extract classes and functions from TypeScript", async () => {
    const result = await getOutline("./fixtures/sample.ts");
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: "MyClass", kind: "class" })
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: "helperFunction", kind: "function" })
    );
  });
});
```

```typescript
// packages/agent-runtime/src/tools/code/__tests__/search.test.ts
import { searchCode } from "../search";

describe("searchCode", () => {
  it("should find matches in TypeScript files", async () => {
    const result = await searchCode("export function", { path: "./src" });
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches[0]).toHaveProperty("lineNumber");
  });
});
```

---

## 8. Implementation Checklist

1. [ ] Implement `skeleton.ts` with regex-based outline extraction
2. [ ] Implement `search.ts` with ripgrep integration
3. [ ] Implement `window.ts` with stateful scrolling
4. [ ] Add tools to `codeServer.ts`
5. [ ] Write unit tests for all modules
6. [ ] Run `pnpm typecheck` and `pnpm test`
7. [ ] Commit to `feat/code-context-management` and create PR
