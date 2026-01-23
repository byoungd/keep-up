import * as Toml from "@iarna/toml";
import { parse as parseYaml } from "yaml";
import type { MarkdownFrontmatterBlock, MarkdownOperationError } from "./types.js";

type ParsedFrontmatter = {
  block: MarkdownFrontmatterBlock;
  content: string;
  data: unknown;
};

type FrontmatterDetection = {
  block: MarkdownFrontmatterBlock;
  contentLines: string[];
};

export type ParseFrontmatterResult =
  | { found: false }
  | { found: true; ok: true; value: ParsedFrontmatter }
  | { found: true; ok: false; error: MarkdownOperationError };

const JSON_DELIMITER = ";;;";
const TOML_DELIMITER = "+++";
const YAML_DELIMITER = "---";

export function detectFrontmatter(lines: string[]): FrontmatterDetection | null {
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

  const delimiter = lines[firstContentIndex];
  const syntax = resolveFrontmatterSyntax(delimiter);
  if (!syntax) {
    return null;
  }

  for (let i = firstContentIndex + 1; i < lines.length; i += 1) {
    if (lines[i] === delimiter) {
      return {
        block: {
          kind: "frontmatter",
          line_range: { start: firstContentIndex + 1, end: i + 1 },
          syntax,
        },
        contentLines: lines.slice(firstContentIndex + 1, i),
      };
    }
  }

  return null;
}

export function parseFrontmatter(lines: string[]): ParseFrontmatterResult {
  const detection = detectFrontmatter(lines);
  if (!detection) {
    return { found: false };
  }

  const content = detection.contentLines.join("\n");
  const dataResult = parseFrontmatterContent(content, detection.block.syntax);
  if (!dataResult.ok) {
    return { found: true, ok: false, error: dataResult.error };
  }

  return {
    found: true,
    ok: true,
    value: {
      block: detection.block,
      content,
      data: dataResult.data,
    },
  };
}

export function parseFrontmatterContent(
  content: string,
  syntax: MarkdownFrontmatterBlock["syntax"]
): { ok: true; data: unknown } | { ok: false; error: MarkdownOperationError } {
  try {
    if (syntax === "json") {
      if (!content.trim()) {
        return { ok: true, data: {} };
      }
      return { ok: true, data: JSON.parse(content) };
    }
    if (syntax === "toml") {
      if (!content.trim()) {
        return { ok: true, data: {} };
      }
      return { ok: true, data: Toml.parse(content) };
    }
    if (!content.trim()) {
      return { ok: true, data: {} };
    }
    return { ok: true, data: parseYaml(content) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: `Frontmatter parse failed: ${(error as Error).message}`,
      },
    };
  }
}

function resolveFrontmatterSyntax(delimiter: string): MarkdownFrontmatterBlock["syntax"] | null {
  if (delimiter === YAML_DELIMITER) {
    return "yaml";
  }
  if (delimiter === TOML_DELIMITER) {
    return "toml";
  }
  if (delimiter === JSON_DELIMITER) {
    return "json";
  }
  return null;
}
