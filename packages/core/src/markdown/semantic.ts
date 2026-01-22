import type { MarkdownTargetingPolicyV1 } from "../kernel/policy/types.js";
import type {
  LineRange,
  MarkdownCodeFenceBlock,
  MarkdownFrontmatterBlock,
  MarkdownHeadingBlock,
  MarkdownOperationError,
  MarkdownPreconditionV1,
  MarkdownSemanticIndex,
} from "./types.js";

type SemanticResolution =
  | { ok: true; range: LineRange }
  | { ok: false; error: MarkdownOperationError };

type SearchWindow = {
  startLine: number;
  endLine: number;
};

const ATX_HEADING_PATTERN = /^\s{0,3}(#{1,6})\s*(.*?)\s*$/;
const SETEXT_HEADING_PATTERN = /^\s{0,3}(=+|-+)\s*$/;
const CODE_FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

export function buildMarkdownSemanticIndex(lines: string[]): MarkdownSemanticIndex {
  const headings: MarkdownHeadingBlock[] = [];
  const codeFences: MarkdownCodeFenceBlock[] = [];

  const frontmatter = parseFrontmatter(lines);
  const frontmatterRange = frontmatter?.line_range;

  let i = 0;
  while (i < lines.length) {
    const lineNumber = i + 1;

    if (
      frontmatterRange &&
      lineNumber >= frontmatterRange.start &&
      lineNumber <= frontmatterRange.end
    ) {
      i = frontmatterRange.end;
      continue;
    }

    const fence = parseCodeFence(lines, i);
    if (fence) {
      codeFences.push(fence.block);
      i = fence.nextIndex;
      continue;
    }

    const heading = parseHeading(lines, i);
    if (heading) {
      headings.push(heading.block);
      i = heading.nextIndex;
      continue;
    }

    i += 1;
  }

  return {
    line_count: lines.length,
    headings,
    code_fences: codeFences,
    frontmatter,
  };
}

export function resolveMarkdownSemanticTarget(
  semantic: MarkdownPreconditionV1["semantic"],
  index: MarkdownSemanticIndex,
  policy?: MarkdownTargetingPolicyV1
): SemanticResolution {
  if (!semantic) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Semantic selector is required",
      },
    };
  }

  const maxLines = policy?.max_semantic_search_lines;

  if (semantic.kind === "heading") {
    return resolveHeadingTarget(semantic, index, maxLines);
  }

  if (semantic.kind === "code_fence") {
    return resolveCodeFenceTarget(semantic, index, maxLines);
  }

  if (semantic.kind === "frontmatter") {
    return resolveFrontmatterTarget(semantic, index);
  }

  if (semantic.kind === "frontmatter_key") {
    return {
      ok: false,
      error: {
        code: "MCM_OPERATION_UNSUPPORTED",
        message: "frontmatter_key targeting is not implemented",
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "MCM_INVALID_TARGET",
      message: "Unsupported semantic kind",
    },
  };
}

function resolveHeadingTarget(
  semantic: NonNullable<MarkdownPreconditionV1["semantic"]>,
  index: MarkdownSemanticIndex,
  maxLines?: number
): SemanticResolution {
  const query = normalizeHeadingText(semantic.heading_text ?? "");
  if (!query) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "heading_text is required",
      },
    };
  }

  const searchWindow: SearchWindow = {
    startLine: 1,
    endLine: index.line_count,
  };

  const scopeError = ensureSearchWithinLimit(searchWindow, maxLines);
  if (scopeError) {
    return scopeError;
  }

  const mode = semantic.heading_text_mode ?? "exact";
  const matches = index.headings.filter((heading) => {
    if (semantic.heading_level && heading.level !== semantic.heading_level) {
      return false;
    }
    return matchesHeadingText(heading.text, query, mode);
  });

  return finalizeSemanticMatches(matches, semantic.nth);
}

function resolveCodeFenceTarget(
  semantic: NonNullable<MarkdownPreconditionV1["semantic"]>,
  index: MarkdownSemanticIndex,
  maxLines?: number
): SemanticResolution {
  let searchWindow: SearchWindow = { startLine: 1, endLine: index.line_count };

  if (semantic.after_heading) {
    const headingQuery = normalizeHeadingText(semantic.after_heading);
    const headingMode = semantic.after_heading_mode ?? "exact";
    const heading = index.headings.find((item) =>
      matchesHeadingText(item.text, headingQuery, headingMode)
    );
    if (!heading) {
      return {
        ok: false,
        error: {
          code: "MCM_TARGETING_NOT_FOUND",
          message: "after_heading not found",
        },
      };
    }
    const sectionEnd = findSectionEnd(index.headings, heading, index.line_count);
    searchWindow = {
      startLine: heading.line_range.end + 1,
      endLine: sectionEnd,
    };
  }

  const scopeError = ensureSearchWithinLimit(searchWindow, maxLines);
  if (scopeError) {
    return scopeError;
  }

  const matches = index.code_fences.filter((fence) => {
    if (
      fence.line_range.start < searchWindow.startLine ||
      fence.line_range.start > searchWindow.endLine
    ) {
      return false;
    }
    if (semantic.language && fence.language !== semantic.language) {
      return false;
    }
    return true;
  });

  return finalizeSemanticMatches(matches, semantic.nth);
}

function resolveFrontmatterTarget(
  _semantic: NonNullable<MarkdownPreconditionV1["semantic"]>,
  index: MarkdownSemanticIndex
): SemanticResolution {
  if (!index.frontmatter) {
    return {
      ok: false,
      error: {
        code: "MCM_TARGETING_NOT_FOUND",
        message: "Frontmatter not found",
      },
    };
  }

  return { ok: true, range: index.frontmatter.line_range };
}

function finalizeSemanticMatches(
  matches: Array<{ line_range: LineRange }>,
  nth?: number
): SemanticResolution {
  if (matches.length === 0) {
    return {
      ok: false,
      error: {
        code: "MCM_TARGETING_NOT_FOUND",
        message: "Semantic target not found",
      },
    };
  }

  if (typeof nth === "number") {
    const index = nth - 1;
    if (index < 0 || index >= matches.length) {
      return {
        ok: false,
        error: {
          code: "MCM_TARGETING_NOT_FOUND",
          message: "Semantic target not found",
        },
      };
    }
    return { ok: true, range: matches[index].line_range };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      error: {
        code: "MCM_TARGETING_AMBIGUOUS",
        message: "Semantic target is ambiguous",
      },
    };
  }

  return { ok: true, range: matches[0].line_range };
}

function ensureSearchWithinLimit(
  window: SearchWindow,
  maxLines?: number
): SemanticResolution | null {
  if (maxLines === undefined) {
    return null;
  }
  const span = window.endLine - window.startLine + 1;
  if (span <= maxLines) {
    return null;
  }
  return {
    ok: false,
    error: {
      code: "MCM_TARGETING_SCOPE_EXCEEDED",
      message: "Semantic search exceeded policy limit",
    },
  };
}

function parseFrontmatter(lines: string[]): MarkdownFrontmatterBlock | undefined {
  let firstContentIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().length === 0) {
      continue;
    }
    firstContentIndex = i;
    break;
  }
  if (firstContentIndex === -1) {
    return undefined;
  }

  const delimiterLine = lines[firstContentIndex];
  const syntax = resolveFrontmatterSyntax(delimiterLine);
  if (!syntax) {
    return undefined;
  }

  for (let i = firstContentIndex + 1; i < lines.length; i += 1) {
    if (lines[i] === delimiterLine) {
      return {
        kind: "frontmatter",
        line_range: { start: firstContentIndex + 1, end: i + 1 },
        syntax,
      };
    }
  }

  return undefined;
}

function resolveFrontmatterSyntax(delimiter: string): MarkdownFrontmatterBlock["syntax"] | null {
  if (delimiter === "---") {
    return "yaml";
  }
  if (delimiter === "+++") {
    return "toml";
  }
  if (delimiter === ";;;") {
    return "json";
  }
  return null;
}

function parseHeading(
  lines: string[],
  index: number
): { block: MarkdownHeadingBlock; nextIndex: number } | null {
  const line = lines[index];
  const atxMatch = line.match(ATX_HEADING_PATTERN);
  if (atxMatch) {
    const level = atxMatch[1]?.length ?? 0;
    if (level > 0) {
      const rawText = atxMatch[2] ?? "";
      const normalizedText = normalizeHeadingText(stripTrailingAtxHashes(rawText));
      return {
        block: {
          kind: "heading",
          line_range: { start: index + 1, end: index + 1 },
          level,
          text: normalizedText,
        },
        nextIndex: index + 1,
      };
    }
  }

  const nextLine = lines[index + 1];
  if (nextLine && SETEXT_HEADING_PATTERN.test(nextLine)) {
    const level = nextLine.trim().startsWith("=") ? 1 : 2;
    const normalizedText = normalizeHeadingText(line);
    return {
      block: {
        kind: "heading",
        line_range: { start: index + 1, end: index + 2 },
        level,
        text: normalizedText,
      },
      nextIndex: index + 2,
    };
  }

  return null;
}

function stripTrailingAtxHashes(text: string): string {
  return text.replace(/\s*#+\s*$/, "");
}

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function parseCodeFence(
  lines: string[],
  index: number
): { block: MarkdownCodeFenceBlock; nextIndex: number } | null {
  const line = lines[index];
  const match = line.match(CODE_FENCE_PATTERN);
  if (!match) {
    return null;
  }

  const fenceMarker = match[1] ?? "";
  const fenceChar = fenceMarker[0];
  const fenceLength = fenceMarker.length;
  const infoString = (match[2] ?? "").trim();
  const language = infoString.split(/\s+/).filter(Boolean)[0];

  let endIndex = lines.length - 1;
  for (let i = index + 1; i < lines.length; i += 1) {
    const candidate = lines[i].trim();
    if (candidate.startsWith(fenceChar.repeat(3))) {
      const fenceMatch = candidate.match(/^(`+|~+)/);
      const closingLength = fenceMatch?.[1]?.length ?? 0;
      if (closingLength >= fenceLength && fenceMatch?.[1]?.[0] === fenceChar) {
        endIndex = i;
        break;
      }
    }
  }

  return {
    block: {
      kind: "code_fence",
      line_range: { start: index + 1, end: endIndex + 1 },
      language: language || undefined,
      info_string: infoString || undefined,
    },
    nextIndex: endIndex + 1,
  };
}

function matchesHeadingText(text: string, query: string, mode: "exact" | "prefix"): boolean {
  if (mode === "prefix") {
    return text.startsWith(query);
  }
  return text === query;
}

function findSectionEnd(
  headings: MarkdownHeadingBlock[],
  current: MarkdownHeadingBlock,
  lineCount: number
): number {
  const currentIndex = headings.indexOf(current);
  if (currentIndex === -1) {
    return lineCount;
  }

  for (let i = currentIndex + 1; i < headings.length; i += 1) {
    const heading = headings[i];
    if (heading.level <= current.level) {
      return heading.line_range.start - 1;
    }
  }

  return lineCount;
}
