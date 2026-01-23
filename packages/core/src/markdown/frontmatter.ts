import * as Toml from "@iarna/toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { LineRange, MarkdownFrontmatterBlock, MarkdownOperationError } from "./types.js";

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

export function stringifyFrontmatter(
  data: unknown,
  syntax: MarkdownFrontmatterBlock["syntax"]
): { ok: true; content: string } | { ok: false; error: MarkdownOperationError } {
  if (!isJsonValue(data)) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter value must be JSON-serializable",
      },
    };
  }

  const normalized = sortJsonValue(data) as unknown;

  try {
    if (syntax === "json") {
      return { ok: true, content: JSON.stringify(normalized, null, 2) };
    }
    if (syntax === "toml") {
      return { ok: true, content: Toml.stringify(normalized as Toml.JsonMap) };
    }
    return {
      ok: true,
      content: stringifyYaml(normalized, { sortMapEntries: true }).trimEnd(),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: `Frontmatter stringify failed: ${(error as Error).message}`,
      },
    };
  }
}

export function updateFrontmatterValue(
  data: unknown,
  keyPath: string[],
  value: unknown,
  createIfMissing: boolean
): { ok: true; data: unknown } | { ok: false; error: MarkdownOperationError } {
  if (!isJsonValue(data)) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter data must be JSON-serializable",
      },
    };
  }
  if (!isJsonValue(value)) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter value must be JSON-serializable",
      },
    };
  }
  if (keyPath.length === 0) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "key_path must be non-empty",
      },
    };
  }

  const cloned = cloneJsonValue(data);
  const result = setJsonValue(cloned, keyPath, value, createIfMissing);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: result.value };
}

export function buildFrontmatterLines(
  syntax: MarkdownFrontmatterBlock["syntax"],
  content: string
): string[] {
  const delimiter = resolveDelimiterForSyntax(syntax);
  const contentLines = content ? content.split("\n") : [];
  return [delimiter, ...contentLines, delimiter];
}

export function resolveDelimiterForSyntax(syntax: MarkdownFrontmatterBlock["syntax"]): string {
  switch (syntax) {
    case "yaml":
      return YAML_DELIMITER;
    case "toml":
      return TOML_DELIMITER;
    case "json":
      return JSON_DELIMITER;
    default:
      return YAML_DELIMITER;
  }
}

export function frontmatterExists(lines: string[]): boolean {
  return detectFrontmatter(lines) !== null;
}

export function resolveFrontmatterRange(lines: string[]): LineRange | null {
  const detection = detectFrontmatter(lines);
  return detection?.block.line_range ?? null;
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

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = null | boolean | number | string | JsonObject | JsonArray;

function isJsonValue(
  value: unknown
): value is null | boolean | number | string | JsonObject | JsonArray {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((entry) => isJsonValue(entry));
  }
  return false;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }
  if (value && typeof value === "object") {
    const result: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = sortJsonValue((value as JsonObject)[key]);
    }
    return result;
  }
  return value;
}

function setJsonValue(
  root: JsonValue,
  keyPath: string[],
  value: JsonValue,
  createIfMissing: boolean
): { ok: true; value: JsonValue } | { ok: false; error: MarkdownOperationError } {
  return setJsonValueAtPath(root, keyPath, value, createIfMissing, true);
}

function setJsonValueAtPath(
  current: JsonValue,
  keyPath: string[],
  value: JsonValue,
  createIfMissing: boolean,
  isRoot: boolean
): { ok: true; value: JsonValue } | { ok: false; error: MarkdownOperationError } {
  if (keyPath.length === 0) {
    return { ok: true, value };
  }

  const [segment, ...rest] = keyPath;
  if (!segment) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Frontmatter path is invalid",
      },
    };
  }

  if (/^\d+$/.test(segment)) {
    return setArraySegment(current, Number.parseInt(segment, 10), rest, value, createIfMissing);
  }

  return setObjectSegment(current, segment, rest, value, createIfMissing, isRoot);
}

function setArraySegment(
  current: JsonValue,
  index: number,
  rest: string[],
  value: JsonValue,
  createIfMissing: boolean
): { ok: true; value: JsonValue } | { ok: false; error: MarkdownOperationError } {
  const arrayResult = coerceArray(current, createIfMissing);
  if (!arrayResult.ok) {
    return arrayResult;
  }
  const array = arrayResult.value;
  const ensureResult = ensureArrayIndex(array, index, createIfMissing);
  if (!ensureResult.ok) {
    return ensureResult;
  }

  if (rest.length === 0) {
    array[index] = value;
    return { ok: true, value: array };
  }

  const nextValue = array[index];
  const nextContainer = ensureChildContainer(nextValue, rest[0], createIfMissing);
  if (!nextContainer.ok) {
    return nextContainer;
  }
  const nextResult = setJsonValueAtPath(nextContainer.value, rest, value, createIfMissing, false);
  if (!nextResult.ok) {
    return nextResult;
  }
  array[index] = nextResult.value;
  return { ok: true, value: array };
}

function setObjectSegment(
  current: JsonValue,
  segment: string,
  rest: string[],
  value: JsonValue,
  createIfMissing: boolean,
  isRoot: boolean
): { ok: true; value: JsonValue } | { ok: false; error: MarkdownOperationError } {
  const objectResult = coerceObject(current, createIfMissing, isRoot);
  if (!objectResult.ok) {
    return objectResult;
  }
  const object = objectResult.value;

  if (rest.length === 0) {
    object[segment] = value;
    return { ok: true, value: object };
  }

  if (!(segment in object)) {
    if (!createIfMissing) {
      return missingPathError();
    }
    object[segment] = createContainerForNextSegment(rest[0]);
  }

  const nextValue = object[segment];
  const nextContainer = ensureChildContainer(nextValue, rest[0], createIfMissing);
  if (!nextContainer.ok) {
    return nextContainer;
  }
  const nextResult = setJsonValueAtPath(nextContainer.value, rest, value, createIfMissing, false);
  if (!nextResult.ok) {
    return nextResult;
  }
  object[segment] = nextResult.value;
  return { ok: true, value: object };
}

function coerceArray(
  current: JsonValue,
  createIfMissing: boolean
): { ok: true; value: JsonArray } | { ok: false; error: MarkdownOperationError } {
  if (Array.isArray(current)) {
    return { ok: true, value: current };
  }
  if (current && typeof current === "object") {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Frontmatter path expects array",
      },
    };
  }
  if (!createIfMissing) {
    return missingPathError();
  }
  return { ok: true, value: [] };
}

function coerceObject(
  current: JsonValue,
  createIfMissing: boolean,
  isRoot: boolean
): { ok: true; value: JsonObject } | { ok: false; error: MarkdownOperationError } {
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return { ok: true, value: current as JsonObject };
  }
  if (!createIfMissing) {
    return missingPathError();
  }
  if (!isRoot) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Frontmatter path expects object",
      },
    };
  }
  return { ok: true, value: {} };
}

function ensureArrayIndex(
  array: JsonArray,
  index: number,
  createIfMissing: boolean
): { ok: true } | { ok: false; error: MarkdownOperationError } {
  if (array[index] !== undefined) {
    return { ok: true };
  }
  if (!createIfMissing) {
    return missingPathError();
  }
  while (array.length <= index) {
    array.push(null);
  }
  return { ok: true };
}

function ensureChildContainer(
  value: JsonValue,
  nextSegment: string | undefined,
  createIfMissing: boolean
): { ok: true; value: JsonValue } | { ok: false; error: MarkdownOperationError } {
  if (isContainer(value)) {
    return { ok: true, value };
  }
  if (!createIfMissing) {
    return missingPathError();
  }
  return { ok: true, value: createContainerForNextSegment(nextSegment) };
}

function missingPathError(): { ok: false; error: MarkdownOperationError } {
  return {
    ok: false,
    error: {
      code: "MCM_TARGETING_NOT_FOUND",
      message: "Frontmatter path not found",
    },
  };
}

function isContainer(value: JsonValue): value is JsonObject | JsonArray {
  return typeof value === "object" && value !== null;
}

function createContainerForNextSegment(nextSegment?: string): JsonObject | JsonArray {
  if (nextSegment && /^\d+$/.test(nextSegment)) {
    return [];
  }
  return {};
}
