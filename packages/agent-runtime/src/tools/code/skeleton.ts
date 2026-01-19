/**
 * Code Skeleton Extraction
 *
 * Provides a lightweight outline of a source file (classes, functions, etc.).
 * This is a regex-based parser intended for token-efficient structure views.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Regex Patterns
// ============================================================================

const IMPORT_REGEX = /^\s*import\b/;
const CLASS_REGEX = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)?/;
const FUNCTION_REGEX =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)?/;
const ARROW_FUNCTION_REGEX = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/;
const INTERFACE_REGEX = /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/;
const TYPE_REGEX = /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/;
const VARIABLE_REGEX = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;

const METHOD_REGEX =
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|override\s+|declare\s+|async\s+|get\s+|set\s+|\*)*([A-Za-z_$][\w$]*)\s*\(/;
const METHOD_ARROW_REGEX =
  /^\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|override\s+|declare\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/;

const RESERVED_METHOD_NAMES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "else",
  "do",
  "try",
  "finally",
  "return",
  "throw",
]);

// ============================================================================
// Public API
// ============================================================================

/**
 * Extract a structural outline from a source file.
 * Uses regex-based parsing for TypeScript/JavaScript.
 * Future: Integrate tree-sitter for more accurate parsing.
 */
export async function getOutline(filePath: string): Promise<OutlineResult> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  const lines = content.split("\n");
  const items = extractTopLevelItems(lines);

  return {
    path: absolutePath,
    totalLines: lines.length,
    items,
  };
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function extractTopLevelItems(lines: string[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  let depth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const line = lines[i];
    const sanitized = stripStringsAndComments(line);

    if (depth === 0) {
      const item = parseTopLevelItem(lines, lineNumber, line, sanitized);
      if (item) {
        items.push(item);
      }
    }

    depth += countBraceDelta(sanitized);
  }

  return items;
}

function parseTopLevelItem(
  lines: string[],
  lineNumber: number,
  line: string,
  sanitized: string
): OutlineItem | null {
  return (
    parseImportItem(lineNumber, line, sanitized) ??
    parseClassItem(lines, lineNumber, sanitized) ??
    parseInterfaceItem(lines, lineNumber, sanitized) ??
    parseTypeItem(lines, lineNumber, sanitized) ??
    parseFunctionItem(lines, lineNumber, line, sanitized) ??
    parseArrowFunctionItem(lines, lineNumber, line, sanitized) ??
    parseVariableItem(lines, lineNumber, sanitized)
  );
}

function parseImportItem(lineNumber: number, line: string, sanitized: string): OutlineItem | null {
  if (!IMPORT_REGEX.test(sanitized)) {
    return null;
  }
  return {
    name: extractImportName(line),
    kind: "import",
    range: [lineNumber, lineNumber],
  };
}

function parseClassItem(
  lines: string[],
  lineNumber: number,
  sanitized: string
): OutlineItem | null {
  const classMatch = sanitized.match(CLASS_REGEX);
  if (!classMatch) {
    return null;
  }
  const name = classMatch[1] ?? "default";
  const range = findDeclarationRange(lines, lineNumber);
  const children = extractClassMethods(lines, lineNumber, range[1]);
  return {
    name,
    kind: "class",
    range,
    children: children.length ? children : undefined,
  };
}

function parseInterfaceItem(
  lines: string[],
  lineNumber: number,
  sanitized: string
): OutlineItem | null {
  const interfaceMatch = sanitized.match(INTERFACE_REGEX);
  if (!interfaceMatch) {
    return null;
  }
  return {
    name: interfaceMatch[1],
    kind: "interface",
    range: findDeclarationRange(lines, lineNumber),
  };
}

function parseTypeItem(lines: string[], lineNumber: number, sanitized: string): OutlineItem | null {
  const typeMatch = sanitized.match(TYPE_REGEX);
  if (!typeMatch) {
    return null;
  }
  return {
    name: typeMatch[1],
    kind: "type",
    range: findDeclarationRange(lines, lineNumber),
  };
}

function parseFunctionItem(
  lines: string[],
  lineNumber: number,
  line: string,
  sanitized: string
): OutlineItem | null {
  const functionMatch = sanitized.match(FUNCTION_REGEX);
  if (!functionMatch) {
    return null;
  }
  const name = functionMatch[1] ?? "default";
  return {
    name,
    kind: "function",
    range: findDeclarationRange(lines, lineNumber),
    signature: formatSignature(line),
  };
}

function parseArrowFunctionItem(
  lines: string[],
  lineNumber: number,
  line: string,
  sanitized: string
): OutlineItem | null {
  const arrowMatch = sanitized.match(ARROW_FUNCTION_REGEX);
  if (!arrowMatch) {
    return null;
  }
  return {
    name: arrowMatch[1],
    kind: "function",
    range: findDeclarationRange(lines, lineNumber),
    signature: formatSignature(line),
  };
}

function parseVariableItem(
  lines: string[],
  lineNumber: number,
  sanitized: string
): OutlineItem | null {
  const variableMatch = sanitized.match(VARIABLE_REGEX);
  if (!variableMatch) {
    return null;
  }
  return {
    name: variableMatch[1],
    kind: "variable",
    range: findDeclarationRange(lines, lineNumber),
  };
}

function extractClassMethods(
  lines: string[],
  classStartLine: number,
  classEndLine: number
): OutlineItem[] {
  const items: OutlineItem[] = [];
  let depth = 0;
  let opened = false;

  for (let i = classStartLine - 1; i < classEndLine; i += 1) {
    const lineNumber = i + 1;
    const line = lines[i];
    const sanitized = stripStringsAndComments(line);

    if (!opened) {
      if (sanitized.includes("{")) {
        opened = true;
      }
      depth += countBraceDelta(sanitized);
      continue;
    }

    if (depth === 1) {
      const methodMatch = sanitized.match(METHOD_REGEX);
      const arrowMatch = sanitized.match(METHOD_ARROW_REGEX);
      const name = methodMatch?.[1] ?? arrowMatch?.[1];

      if (name && !RESERVED_METHOD_NAMES.has(name)) {
        items.push({
          name,
          kind: "method",
          range: findDeclarationRange(lines, lineNumber),
          signature: formatSignature(line),
        });
      }
    }

    depth += countBraceDelta(sanitized);
  }

  return items;
}

function extractImportName(line: string): string {
  const moduleMatch = line.match(/from\s+["']([^"']+)["']/);
  if (moduleMatch) {
    return moduleMatch[1];
  }
  const sideEffectMatch = line.match(/import\s+["']([^"']+)["']/);
  if (sideEffectMatch) {
    return sideEffectMatch[1];
  }
  return line.trim();
}

function formatSignature(line: string): string {
  return line
    .trim()
    .replace(/\s*\{\s*$/, "")
    .replace(/\s*;\s*$/, "");
}

function findDeclarationRange(lines: string[], startLine: number): [number, number] {
  const blockEnd = findBlockEndLine(lines, startLine);
  if (blockEnd !== null) {
    return [startLine, blockEnd];
  }
  return [startLine, findStatementEndLine(lines, startLine)];
}

function findBlockEndLine(lines: string[], startLine: number): number | null {
  const state: BlockScanState = { depth: 0, opened: false };

  for (let i = startLine - 1; i < lines.length; i += 1) {
    const sanitized = stripStringsAndComments(lines[i]);
    if (scanForBlockEnd(sanitized, state)) {
      return i + 1;
    }
  }

  return state.opened ? lines.length : null;
}

interface BlockScanState {
  depth: number;
  opened: boolean;
}

function scanForBlockEnd(line: string, state: BlockScanState): boolean {
  for (const char of line) {
    if (char === "{") {
      state.opened = true;
      state.depth += 1;
      continue;
    }
    if (char === "}" && state.opened) {
      state.depth -= 1;
      if (state.depth === 0) {
        return true;
      }
    }
  }
  return false;
}

function findStatementEndLine(lines: string[], startLine: number): number {
  for (let i = startLine - 1; i < lines.length; i += 1) {
    const sanitized = stripStringsAndComments(lines[i]);
    if (sanitized.includes(";")) {
      return i + 1;
    }
  }
  return startLine;
}

function stripStringsAndComments(line: string): string {
  let sanitized = line.replace(/\/\/.*$/, "");
  sanitized = sanitized.replace(/\/\*.*?\*\//g, "");
  sanitized = sanitized.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
  return sanitized;
}

function countBraceDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "{") {
      delta += 1;
    } else if (char === "}") {
      delta -= 1;
    }
  }
  return delta;
}
