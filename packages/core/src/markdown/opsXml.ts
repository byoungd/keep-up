import type { Capabilities, MarkdownPolicyV1 } from "../kernel/policy/types.js";
import { applyMarkdownLineOperations } from "./lineOps.js";
import type {
  LineRange,
  MarkdownLineApplyResult,
  MarkdownOperation,
  MarkdownOperationEnvelope,
  MarkdownOperationError,
  MarkdownPreconditionV1,
} from "./types.js";

export type MarkdownOpsXmlParseResult =
  | { ok: true; ops: MarkdownOperation[] }
  | { ok: false; error: MarkdownOperationError };

export type MarkdownOpsXmlEnvelopeInput = {
  doc_id: string;
  doc_frontier: string;
  ops_xml: string;
  preconditions: MarkdownPreconditionV1[];
  options?: MarkdownOperationEnvelope["options"];
};

export type MarkdownGatewayPolicyContext = {
  policy?: MarkdownPolicyV1;
  capabilities?: Capabilities;
};

export type MarkdownEnvelopeErrorMapping = {
  status: 400 | 409 | 422;
  code:
    | "AI_PRECONDITION_FAILED"
    | "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION"
    | "AI_PAYLOAD_REJECTED_LIMITS";
  diagnostics: Array<{ kind: string; detail: string; severity: "error" }>;
};

const NON_MARKDOWN_TAGS = new Set(["replace_spans", "op", "ghost_ops"]);

export function parseMarkdownOpsXml(opsXml: string): MarkdownOpsXmlParseResult {
  const trimmed = opsXml.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: "ops_xml must be non-empty",
      },
    };
  }

  const tagNames = extractTagNames(trimmed);
  const tagError = validateMarkdownOpsXmlTags(tagNames);
  if (tagError) {
    return { ok: false, error: tagError };
  }

  return parseMarkdownOpsFromXml(trimmed);
}

type MarkdownOpScanResult =
  | { ok: true; found: true; op: MarkdownOperation; nextCursor: number }
  | { ok: true; found: false; nextCursor: number }
  | { ok: false; error: MarkdownOperationError };

function extractTagNames(xml: string): string[] {
  return Array.from(xml.matchAll(/<\s*\/?\s*([a-zA-Z0-9_-]+)/g)).map((match) => match[1]);
}

function validateMarkdownOpsXmlTags(tagNames: string[]): MarkdownOperationError | null {
  const hasMarkdownTags = tagNames.some((name) => name.startsWith("md_"));
  if (!hasMarkdownTags) {
    return {
      code: "MCM_INVALID_REQUEST",
      message: "Markdown ops_xml must contain md_* operations",
    };
  }

  const hasNonMarkdownTags = tagNames.some(
    (name) => !name.startsWith("md_") && !name.startsWith("?") && !name.startsWith("!")
  );
  if (!hasNonMarkdownTags) {
    return null;
  }

  const hasRichTextTags = tagNames.some((name) => NON_MARKDOWN_TAGS.has(name));
  return {
    code: "MCM_INVALID_REQUEST",
    message: hasRichTextTags
      ? "Markdown ops cannot be mixed with rich-text ops"
      : "Unsupported ops_xml tag for markdown",
  };
}

function parseMarkdownOpsFromXml(trimmed: string): MarkdownOpsXmlParseResult {
  const ops: MarkdownOperation[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    const scanResult = scanNextMarkdownOp(trimmed, cursor);
    if (!scanResult.ok) {
      return { ok: false, error: scanResult.error };
    }
    if (!scanResult.found) {
      break;
    }
    ops.push(scanResult.op);
    cursor = scanResult.nextCursor;
  }

  if (ops.length === 0) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: "No markdown operations found",
      },
    };
  }

  return { ok: true, ops };
}

function scanNextMarkdownOp(xml: string, cursor: number): MarkdownOpScanResult {
  const openMatch = xml.slice(cursor).match(/<\s*(md_[a-zA-Z0-9_-]+)([^>]*?)>/);
  if (!openMatch) {
    return { ok: true, found: false, nextCursor: xml.length };
  }

  const [fullMatch, tagName, rawAttrs] = openMatch;
  const openIndex = cursor + (openMatch.index ?? 0);
  const tagEnd = openIndex + fullMatch.length;
  const attrs = parseAttributes(rawAttrs);

  if (isSelfClosingTag(fullMatch)) {
    return buildOpScanResult(tagName, attrs, "", tagEnd);
  }

  const closingTag = `</${tagName}>`;
  const closeIndex = xml.indexOf(closingTag, tagEnd);
  if (closeIndex === -1) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: `Missing closing tag for ${tagName}`,
      },
    };
  }

  const innerContent = xml.slice(tagEnd, closeIndex);
  return buildOpScanResult(tagName, attrs, innerContent, closeIndex + closingTag.length);
}

function buildOpScanResult(
  tagName: string,
  attrs: Record<string, string>,
  content: string,
  nextCursor: number
): MarkdownOpScanResult {
  const opResult = parseMarkdownOp(tagName, attrs, content);
  if (!opResult.ok) {
    return { ok: false, error: opResult.error };
  }
  return { ok: true, found: true, op: opResult.op, nextCursor };
}

function isSelfClosingTag(rawTag: string): boolean {
  return /\/\s*>$/.test(rawTag);
}

export function buildMarkdownEnvelopeFromOpsXml(
  input: MarkdownOpsXmlEnvelopeInput
):
  | { ok: true; envelope: MarkdownOperationEnvelope }
  | { ok: false; error: MarkdownOperationError } {
  const parsed = parseMarkdownOpsXml(input.ops_xml);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    envelope: {
      mode: "markdown",
      doc_id: input.doc_id,
      doc_frontier: input.doc_frontier,
      preconditions: input.preconditions,
      ops: parsed.ops,
      options: input.options,
    },
  };
}

export async function applyMarkdownOpsXml(
  content: string,
  input: MarkdownOpsXmlEnvelopeInput,
  context: MarkdownGatewayPolicyContext = {}
): Promise<MarkdownLineApplyResult> {
  const envelopeResult = buildMarkdownEnvelopeFromOpsXml(input);
  if (!envelopeResult.ok) {
    return { ok: false, error: envelopeResult.error };
  }

  const policyError = validateMarkdownPolicy(
    envelopeResult.envelope,
    context.policy,
    context.capabilities
  );
  if (policyError) {
    return { ok: false, error: policyError };
  }

  const appliedEnvelope = applyMarkdownPolicyDefaults(envelopeResult.envelope, context.policy);
  const options = context.policy
    ? {
        targetingPolicy: context.policy.targeting,
        frontmatterPolicy: {
          allow_frontmatter: context.policy.sanitization.allow_frontmatter,
          frontmatter_formats: context.policy.parser.frontmatter_formats,
          max_frontmatter_bytes: context.policy.sanitization.max_frontmatter_bytes,
        },
      }
    : undefined;

  return applyMarkdownLineOperations(content, appliedEnvelope, options);
}

export function mapMarkdownErrorToEnvelope(
  error: MarkdownOperationError
): MarkdownEnvelopeErrorMapping {
  const diagnostics = [
    {
      kind: error.code,
      detail: error.message,
      severity: "error" as const,
    },
  ];

  const preconditionErrors = new Set([
    "MCM_PRECONDITION_FAILED",
    "MCM_CONTENT_HASH_MISMATCH",
    "MCM_TARGETING_NOT_FOUND",
    "MCM_TARGETING_AMBIGUOUS",
  ]);

  const limitErrors = new Set(["MCM_LINE_LIMIT_EXCEEDED", "MCM_TARGETING_SCOPE_EXCEEDED"]);

  if (preconditionErrors.has(error.code)) {
    return { status: 409, code: "AI_PRECONDITION_FAILED", diagnostics };
  }

  if (limitErrors.has(error.code)) {
    return { status: 400, code: "AI_PAYLOAD_REJECTED_LIMITS", diagnostics };
  }

  return { status: 422, code: "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION", diagnostics };
}

function validateMarkdownPolicy(
  envelope: MarkdownOperationEnvelope,
  policy?: MarkdownPolicyV1,
  capabilities?: Capabilities
): MarkdownOperationError | null {
  return (
    validateMarkdownContentMode(capabilities) ??
    validateMarkdownPolicyEnabled(policy) ??
    validateMarkdownExtensionsGate(policy, capabilities) ??
    validateTargetingCapabilities(envelope, capabilities) ??
    validateFrontmatterUsage(envelope, policy, capabilities) ??
    validateCodeFenceUsage(envelope, capabilities) ??
    null
  );
}

function validateMarkdownContentMode(capabilities?: Capabilities): MarkdownOperationError | null {
  if (capabilities && capabilities.markdown_content_mode !== true) {
    return {
      code: "MCM_INVALID_REQUEST",
      message: "Markdown content mode capability is not enabled",
    };
  }
  return null;
}

function validateMarkdownPolicyEnabled(policy?: MarkdownPolicyV1): MarkdownOperationError | null {
  if (policy && !policy.enabled) {
    return {
      code: "MCM_INVALID_REQUEST",
      message: "Markdown policy is disabled",
    };
  }
  return null;
}

function validateMarkdownExtensionsGate(
  policy?: MarkdownPolicyV1,
  capabilities?: Capabilities
): MarkdownOperationError | null {
  if (!policy || !capabilities) {
    return null;
  }
  return validateMarkdownExtensions(policy, capabilities);
}

function validateTargetingCapabilities(
  envelope: MarkdownOperationEnvelope,
  capabilities?: Capabilities
): MarkdownOperationError | null {
  if (!capabilities) {
    return null;
  }
  if (capabilities.markdown_semantic_targeting === false) {
    const hasSemantic = envelope.preconditions.some((pre) => Boolean(pre.semantic));
    if (hasSemantic) {
      return {
        code: "MCM_INVALID_TARGET",
        message: "Semantic targeting is not enabled",
      };
    }
  }

  if (capabilities.markdown_line_targeting === false) {
    const hasLineRange = envelope.preconditions.some((pre) => Boolean(pre.line_range));
    if (hasLineRange) {
      return {
        code: "MCM_INVALID_TARGET",
        message: "Line targeting is not enabled",
      };
    }
  }

  return null;
}

function validateFrontmatterUsage(
  envelope: MarkdownOperationEnvelope,
  policy?: MarkdownPolicyV1,
  capabilities?: Capabilities
): MarkdownOperationError | null {
  const usesFrontmatter = envelope.preconditions.some((pre) =>
    pre.semantic ? isFrontmatterSemantic(pre.semantic.kind) : false
  );
  const usesFrontmatterOps = envelope.ops.some((op) => op.op === "md_update_frontmatter");
  if (!usesFrontmatter && !usesFrontmatterOps) {
    return null;
  }
  if (capabilities && capabilities.markdown_frontmatter === false) {
    return {
      code: "MCM_FRONTMATTER_INVALID",
      message: "Frontmatter operations are not enabled",
    };
  }
  if (policy && !policy.sanitization.allow_frontmatter) {
    return {
      code: "MCM_FRONTMATTER_INVALID",
      message: "Frontmatter operations are not allowed by policy",
    };
  }
  return null;
}

function validateCodeFenceUsage(
  envelope: MarkdownOperationEnvelope,
  capabilities?: Capabilities
): MarkdownOperationError | null {
  if (!capabilities || capabilities.markdown_code_fence_syntax !== false) {
    return null;
  }
  const usesCodeFenceOp = envelope.ops.some((op) => op.op === "md_insert_code_fence");
  const usesCodeFenceSemantic = envelope.preconditions.some(
    (pre) => pre.semantic?.kind === "code_fence"
  );
  if (!usesCodeFenceOp && !usesCodeFenceSemantic) {
    return null;
  }
  return {
    code: "MCM_INVALID_TARGET",
    message: "Code fence targeting is not enabled",
  };
}

function validateMarkdownExtensions(
  policy: MarkdownPolicyV1,
  capabilities: Capabilities
): MarkdownOperationError | null {
  if (policy.sanitization.allow_frontmatter && capabilities.markdown_frontmatter === false) {
    return {
      code: "MCM_FRONTMATTER_INVALID",
      message: "Frontmatter capability is not enabled",
    };
  }

  if (
    policy.parser.frontmatter_formats.includes("json") &&
    capabilities.markdown_frontmatter_json === false
  ) {
    return {
      code: "MCM_FRONTMATTER_INVALID",
      message: "JSON frontmatter capability is not enabled",
    };
  }

  const extensionChecks: Array<[boolean, keyof Capabilities, string]> = [
    [policy.parser.extensions.gfm_tables, "markdown_gfm_tables", "GFM tables"],
    [policy.parser.extensions.gfm_task_lists, "markdown_gfm_task_lists", "GFM task lists"],
    [policy.parser.extensions.gfm_strikethrough, "markdown_gfm_strikethrough", "GFM strikethrough"],
    [policy.parser.extensions.gfm_autolink, "markdown_gfm_autolink", "GFM autolinks"],
    [policy.parser.extensions.footnotes, "markdown_footnotes", "Footnotes"],
    [policy.parser.extensions.wikilinks, "markdown_wikilinks", "Wikilinks"],
    [policy.parser.extensions.math, "markdown_math", "Math"],
  ];

  for (const [enabled, capabilityFlag, label] of extensionChecks) {
    if (enabled && capabilities[capabilityFlag] === false) {
      return {
        code: "MCM_INVALID_REQUEST",
        message: `${label} extension is not enabled`,
      };
    }
  }

  return null;
}

function applyMarkdownPolicyDefaults(
  envelope: MarkdownOperationEnvelope,
  policy?: MarkdownPolicyV1
): MarkdownOperationEnvelope {
  if (!policy) {
    return envelope;
  }
  const defaults = resolveFenceDefaults(policy);
  if (!defaults) {
    return envelope;
  }

  let changed = false;
  const nextOps = envelope.ops.map((op) => {
    if (op.op !== "md_insert_code_fence") {
      return op;
    }
    const next: typeof op = { ...op };
    if (op.fence_char === undefined && defaults.fenceChar) {
      next.fence_char = defaults.fenceChar;
      changed = true;
    }
    if (op.fence_length === undefined && defaults.fenceLength) {
      next.fence_length = defaults.fenceLength;
      changed = true;
    }
    return next;
  });

  return changed ? { ...envelope, ops: nextOps } : envelope;
}

function resolveFenceDefaults(
  policy: MarkdownPolicyV1
): { fenceChar?: "`" | "~"; fenceLength?: number } | null {
  const fenceChar = policy.canonicalizer.normalize.fence_char;
  const fenceLength = policy.canonicalizer.normalize.fence_length;
  const result: { fenceChar?: "`" | "~"; fenceLength?: number } = {};

  if (fenceChar === "`" || fenceChar === "~") {
    result.fenceChar = fenceChar;
  }

  if (Number.isInteger(fenceLength) && fenceLength > 0) {
    result.fenceLength = fenceLength;
  }

  return result.fenceChar || result.fenceLength ? result : null;
}

function isFrontmatterSemantic(kind: string): boolean {
  return kind === "frontmatter" || kind === "frontmatter_key";
}

function parseMarkdownOp(
  tagName: string,
  attrs: Record<string, string>,
  content: string
): { ok: true; op: MarkdownOperation } | { ok: false; error: MarkdownOperationError } {
  const preconditionId = attrs.precondition;
  if (!preconditionId) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: `Missing precondition for ${tagName}`,
      },
    };
  }
  const decodedContent = decodeEntities(content);
  const parser = markdownOpParsers[tagName];
  if (!parser) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: `Unsupported markdown op: ${tagName}`,
      },
    };
  }
  return parser(attrs, decodedContent, preconditionId);
}

type MarkdownOpParseResult =
  | { ok: true; op: MarkdownOperation }
  | { ok: false; error: MarkdownOperationError };

type MarkdownOpParser = (
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
) => MarkdownOpParseResult;

const markdownOpParsers: Record<string, MarkdownOpParser> = {
  md_replace_lines: parseReplaceLinesOp,
  md_insert_lines: parseInsertLinesOp,
  md_delete_lines: parseDeleteLinesOp,
  md_replace_block: parseReplaceBlockOp,
  md_insert_after: parseInsertAfterOp,
  md_insert_before: parseInsertBeforeOp,
  md_insert_code_fence: parseInsertCodeFenceOp,
  md_update_frontmatter: parseUpdateFrontmatterOp,
};

function parseReplaceLinesOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const range = parseLineRange(attrs);
  if (!range.ok) {
    return range;
  }
  return {
    ok: true,
    op: {
      op: "md_replace_lines",
      precondition_id: preconditionId,
      target: { line_range: range.range },
      content,
    },
  };
}

function parseInsertLinesOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const anchor = parseInsertAnchor(attrs);
  if (!anchor.ok) {
    return anchor;
  }
  return {
    ok: true,
    op: {
      op: "md_insert_lines",
      precondition_id: preconditionId,
      target: anchor.target,
      content,
    },
  };
}

function parseDeleteLinesOp(
  attrs: Record<string, string>,
  _content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const range = parseLineRange(attrs);
  if (!range.ok) {
    return range;
  }
  return {
    ok: true,
    op: {
      op: "md_delete_lines",
      precondition_id: preconditionId,
      target: { line_range: range.range },
    },
  };
}

function parseReplaceBlockOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const target = parseBlockTarget("md_replace_block", attrs);
  if (!target.ok) {
    return target;
  }
  return {
    ok: true,
    op: {
      op: "md_replace_block",
      precondition_id: preconditionId,
      target: target.target,
      content,
    },
  };
}

function parseInsertAfterOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const target = parseBlockTarget("md_insert_after", attrs);
  if (!target.ok) {
    return target;
  }
  return {
    ok: true,
    op: {
      op: "md_insert_after",
      precondition_id: preconditionId,
      target: target.target,
      content,
    },
  };
}

function parseInsertBeforeOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const target = parseBlockTarget("md_insert_before", attrs);
  if (!target.ok) {
    return target;
  }
  return {
    ok: true,
    op: {
      op: "md_insert_before",
      precondition_id: preconditionId,
      target: target.target,
      content,
    },
  };
}

function parseInsertCodeFenceOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const target = parseBlockTarget("md_insert_code_fence", attrs);
  if (!target.ok) {
    return target;
  }
  const fenceLength = parseOptionalInt(attrs.fence_length, "fence_length");
  if (!fenceLength.ok) {
    return fenceLength;
  }
  return {
    ok: true,
    op: {
      op: "md_insert_code_fence",
      precondition_id: preconditionId,
      target: target.target,
      language: attrs.language,
      content,
      fence_char: attrs.fence_char as "`" | "~" | undefined,
      fence_length: fenceLength.value,
    },
  };
}

function parseUpdateFrontmatterOp(
  attrs: Record<string, string>,
  content: string,
  preconditionId: string
): MarkdownOpParseResult {
  const key = attrs.key;
  if (!key) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Frontmatter key is required",
      },
    };
  }
  const valueResult = parseFrontmatterValue(attrs.type, content);
  if (!valueResult.ok) {
    return valueResult;
  }
  const createFlag = parseBoolean(attrs.create_if_missing ?? attrs.create);
  if ("error" in createFlag) {
    return { ok: false, error: createFlag.error };
  }
  return {
    ok: true,
    op: {
      op: "md_update_frontmatter",
      precondition_id: preconditionId,
      target: { key_path: key.split(".").filter(Boolean) },
      value: valueResult.value,
      create_if_missing: createFlag.value ?? undefined,
    },
  };
}

function parseLineRange(
  attrs: Record<string, string>
): { ok: true; range: LineRange } | { ok: false; error: MarkdownOperationError } {
  const start = parseRequiredInt(attrs.start, "start");
  if (!start.ok) {
    return start;
  }
  const end = parseRequiredInt(attrs.end, "end");
  if (!end.ok) {
    return end;
  }
  return { ok: true, range: { start: start.value, end: end.value } };
}

function parseInsertAnchor(
  attrs: Record<string, string>
):
  | { ok: true; target: { after_line: number } | { before_line: number } }
  | { ok: false; error: MarkdownOperationError } {
  const after = attrs.after ? parseRequiredInt(attrs.after, "after") : null;
  if (after && !after.ok) {
    return after;
  }
  const before = attrs.before ? parseRequiredInt(attrs.before, "before") : null;
  if (before && !before.ok) {
    return before;
  }
  if ((after?.value ?? null) === null && (before?.value ?? null) === null) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Insert operation requires after or before attribute",
      },
    };
  }
  if (after?.value !== undefined && before?.value !== undefined) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Insert operation cannot specify both after and before",
      },
    };
  }
  if (after?.value !== undefined) {
    return { ok: true, target: { after_line: after.value } };
  }
  return { ok: true, target: { before_line: (before as { ok: true; value: number }).value } };
}

type BlockTargetParseResult =
  | {
      ok: true;
      target: { block_id: string } | { semantic: NonNullable<MarkdownPreconditionV1["semantic"]> };
    }
  | { ok: false; error: MarkdownOperationError };

function parseBlockTarget(opName: string, attrs: Record<string, string>): BlockTargetParseResult {
  if (attrs.block_id) {
    return { ok: true, target: { block_id: attrs.block_id } };
  }

  const headingTarget = parseHeadingTarget(opName, attrs);
  if (headingTarget) {
    return headingTarget;
  }

  const codeFenceTarget = parseCodeFenceTarget(attrs);
  if (codeFenceTarget) {
    return codeFenceTarget;
  }

  return {
    ok: false,
    error: {
      code: "MCM_INVALID_TARGET",
      message: `Missing target attributes for ${opName}`,
    },
  };
}

function parseHeadingTarget(
  opName: string,
  attrs: Record<string, string>
): BlockTargetParseResult | null {
  const headingAttr =
    attrs.heading ?? (opName === "md_insert_code_fence" ? attrs.after_heading : undefined);
  if (!headingAttr) {
    return null;
  }
  const headingMode = attrs.heading_mode ?? attrs.heading_text_mode ?? attrs.after_heading_mode;
  const normalized = normalizeHeadingAttribute(headingAttr);
  const inferredLevel = inferHeadingLevel(headingAttr);
  const levelResult = parseOptionalInt(attrs.level, "level");
  if (!levelResult.ok) {
    return levelResult;
  }
  const nthResult = parseOptionalInt(attrs.nth, "nth");
  if (!nthResult.ok) {
    return nthResult;
  }
  return {
    ok: true,
    target: {
      semantic: {
        kind: "heading",
        heading_text: normalized,
        heading_text_mode: headingMode as "exact" | "prefix" | undefined,
        heading_level: levelResult.value ?? inferredLevel,
        nth: nthResult.value,
      },
    },
  };
}

function parseCodeFenceTarget(attrs: Record<string, string>): BlockTargetParseResult | null {
  if (!attrs.after_heading && !attrs.language) {
    return null;
  }
  const nthResult = parseOptionalInt(attrs.nth, "nth");
  if (!nthResult.ok) {
    return nthResult;
  }
  return {
    ok: true,
    target: {
      semantic: {
        kind: "code_fence",
        language: attrs.language,
        after_heading: attrs.after_heading
          ? normalizeHeadingAttribute(attrs.after_heading)
          : undefined,
        after_heading_mode: attrs.after_heading_mode as "exact" | "prefix" | undefined,
        nth: nthResult.value,
      },
    },
  };
}

function parseFrontmatterValue(
  valueType: string | undefined,
  content: string
): { ok: true; value: unknown } | { ok: false; error: MarkdownOperationError } {
  const raw = content.trim();
  if (!valueType || valueType === "string") {
    return { ok: true, value: raw };
  }
  if (valueType === "boolean") {
    if (raw === "true") {
      return { ok: true, value: true };
    }
    if (raw === "false") {
      return { ok: true, value: false };
    }
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter boolean value must be true or false",
      },
    };
  }
  if (valueType === "number") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return { ok: true, value: parsed };
    }
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter number value is invalid",
      },
    };
  }
  if (valueType === "json") {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "MCM_FRONTMATTER_INVALID",
          message: `Frontmatter JSON value is invalid: ${(error as Error).message}`,
        },
      };
    }
  }

  return {
    ok: false,
    error: {
      code: "MCM_FRONTMATTER_INVALID",
      message: `Unsupported frontmatter value type: ${valueType}`,
    },
  };
}

function parseRequiredInt(
  value: string | undefined,
  field: string
): { ok: true; value: number } | { ok: false; error: MarkdownOperationError } {
  if (!value) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: `Missing ${field} attribute`,
      },
    };
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: `${field} must be a positive integer`,
      },
    };
  }
  return { ok: true, value: parsed };
}

function parseOptionalInt(
  value: string | undefined,
  field: string
): { ok: true; value?: number } | { ok: false; error: MarkdownOperationError } {
  if (value === undefined) {
    return { ok: true };
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: `${field} must be a positive integer`,
      },
    };
  }
  return { ok: true, value: parsed };
}

function parseBoolean(
  value: string | undefined
): { value?: boolean } | { error: MarkdownOperationError } {
  if (value === undefined) {
    return { value: undefined };
  }
  if (value === "true") {
    return { value: true };
  }
  if (value === "false") {
    return { value: false };
  }
  return {
    error: {
      code: "MCM_INVALID_REQUEST",
      message: "create_if_missing must be true or false",
    },
  };
}

function normalizeHeadingAttribute(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^#{1,6}\s*(.*)$/);
  const withoutLeading = match ? match[1] : trimmed;
  return withoutLeading.replace(/\s*#+\s*$/, "").trim();
}

function inferHeadingLevel(text: string): number | undefined {
  const match = text.trim().match(/^(#{1,6})\s+/);
  if (!match) {
    return undefined;
  }
  return match[1]?.length ?? undefined;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match) {
    const name = match[1];
    const value = decodeEntities(match[3] ?? match[4] ?? "");
    if (name) {
      attrs[name] = value;
    }
    match = regex.exec(raw);
  }
  return attrs;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
