import { resolveNativeMarkdownContent } from "./native.js";
import type { LineRange } from "./types.js";

type FrontmatterDelimiter = "---" | "+++" | ";;;";

type FrontmatterMatch = {
  startIndex: number;
  endIndex: number;
  delimiter: FrontmatterDelimiter;
};

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function simpleHash256(str: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const part = simpleHash(`${i}:${str}`).padStart(16, "0");
    parts.push(part);
  }
  return parts.join("");
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return bufferToHex(hashBuffer);
  }

  try {
    const nodeCrypto = await import("node:crypto");
    const hash = nodeCrypto.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
  } catch {
    return simpleHash256(text);
  }
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function stripControlChars(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x09 || code === 0x0a) {
      result += text[i];
      continue;
    }
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      continue;
    }
    result += text[i];
  }
  return result;
}

function findFrontmatter(lines: string[]): FrontmatterMatch | null {
  let firstContentIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().length === 0) {
      continue;
    }
    firstContentIndex = i;
    break;
  }
  if (firstContentIndex === -1) {
    return null;
  }

  const startLine = lines[firstContentIndex];
  const delimiter =
    startLine === "---" || startLine === "+++" || startLine === ";;;"
      ? (startLine as FrontmatterDelimiter)
      : null;
  if (!delimiter) {
    return null;
  }

  for (let i = firstContentIndex + 1; i < lines.length; i += 1) {
    if (lines[i] === delimiter) {
      return { startIndex: firstContentIndex, endIndex: i, delimiter };
    }
  }

  return null;
}

function stripFrontmatterLines(lines: string[]): string[] {
  const match = findFrontmatter(lines);
  if (!match) {
    return lines;
  }
  const withoutFrontmatter = [
    ...lines.slice(0, match.startIndex),
    ...lines.slice(match.endIndex + 1),
  ];
  if (withoutFrontmatter.length > 0 && withoutFrontmatter[0] === "") {
    return withoutFrontmatter.slice(1);
  }
  return withoutFrontmatter;
}

export function normalizeMarkdownText(text: string): string {
  const native = resolveNativeMarkdownContent();
  if (native) {
    try {
      return native.normalizeMarkdownText(text);
    } catch {
      // fall back to JS normalization
    }
  }
  return normalizeLineEndings(text);
}

export function splitMarkdownLines(text: string): string[] {
  const native = resolveNativeMarkdownContent();
  if (native) {
    try {
      return native.splitMarkdownLines(text);
    } catch {
      // fall back to JS split
    }
  }
  return normalizeMarkdownText(text).split("\n");
}

export async function computeMarkdownLineHash(lines: string[], range: LineRange): Promise<string> {
  const native = resolveNativeMarkdownContent();
  if (native) {
    try {
      return native.computeMarkdownLineHash(lines, range);
    } catch {
      // fall back to JS hashing
    }
  }
  const startIndex = range.start - 1;
  const endIndex = range.end - 1;
  const slice = lines.slice(startIndex, endIndex + 1).join("\n");
  const normalized = stripControlChars(slice);
  const canonical = `LFCC_MD_LINE_V1\nstart=${range.start}\nend=${range.end}\ntext=${normalized}`;
  return sha256Hex(canonical);
}

export async function computeMarkdownContentHash(
  content: string,
  options: { ignore_frontmatter?: boolean } = {}
): Promise<string> {
  const native = resolveNativeMarkdownContent();
  if (native) {
    try {
      return native.computeMarkdownContentHash(content, options);
    } catch {
      // fall back to JS hashing
    }
  }
  const normalized = normalizeMarkdownText(content);
  const lines = normalized.split("\n");
  const strippedLines = options.ignore_frontmatter ? stripFrontmatterLines(lines) : lines;
  const joined = strippedLines.join("\n");
  const sanitized = stripControlChars(joined);
  const canonical = `LFCC_MD_CONTENT_V1\nignore_frontmatter=${
    options.ignore_frontmatter ? "true" : "false"
  }\ntext=${sanitized}`;
  return sha256Hex(canonical);
}
