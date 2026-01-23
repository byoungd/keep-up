import type {
  MarkdownCanonicalizerPolicyV1,
  MarkdownSanitizationPolicyV1,
  MarkdownTargetingPolicyV1,
} from "../kernel/policy/types.js";
import {
  buildFrontmatterLines,
  parseFrontmatter,
  stringifyFrontmatter,
  updateFrontmatterValue,
} from "./frontmatter.js";
import { computeMarkdownLineHash, normalizeMarkdownText, splitMarkdownLines } from "./hash.js";
import { buildMarkdownSemanticIndex, resolveMarkdownSemanticTarget } from "./semantic.js";
import type {
  LineRange,
  MarkdownAppliedOperation,
  MarkdownLineApplyResult,
  MarkdownOperation,
  MarkdownOperationEnvelope,
  MarkdownOperationError,
  MarkdownPreconditionV1,
  MarkdownSemanticIndex,
} from "./types.js";

type ResolvedOperation = {
  op_index: number;
  op: MarkdownOperation;
  resolved_range: LineRange;
  insert_index?: number;
};

type ApplyOptions = {
  targetingPolicy?: MarkdownTargetingPolicyV1;
  canonicalizerPolicy?: MarkdownCanonicalizerPolicyV1;
  sanitizationPolicy?: MarkdownSanitizationPolicyV1;
  frontmatterPolicy?: {
    allow_frontmatter: boolean;
    frontmatter_formats: Array<"yaml" | "toml" | "json">;
    max_frontmatter_bytes?: number;
  };
};

type PreconditionMapResult =
  | { ok: true; map: Map<string, MarkdownPreconditionV1> }
  | { ok: false; error: MarkdownOperationError };

type PreconditionResolutionResult =
  | { ok: true; ranges: Map<string, LineRange> }
  | { ok: false; error: MarkdownOperationError };

type ResolveOpsResult =
  | { ok: true; resolvedOps: ResolvedOperation[] }
  | { ok: false; error: MarkdownOperationError };

export async function applyMarkdownLineOperations(
  content: string,
  envelope: MarkdownOperationEnvelope,
  options: ApplyOptions = {}
): Promise<MarkdownLineApplyResult> {
  const envelopeError = validateEnvelope(envelope);
  if (envelopeError) {
    return { ok: false, error: envelopeError };
  }

  const normalizedContent = normalizeMarkdownText(content);
  let lines = normalizedContent.split("\n");
  const lineCount = lines.length;

  const preconditionsResult = buildPreconditionMap(envelope.preconditions);
  if (!preconditionsResult.ok) {
    return { ok: false, error: preconditionsResult.error };
  }

  const semanticIndex = buildMarkdownSemanticIndex(lines);
  const preconditionResolution = await resolveAndValidatePreconditions(
    envelope.preconditions,
    lines,
    semanticIndex,
    options.targetingPolicy
  );
  if (!preconditionResolution.ok) {
    return { ok: false, error: preconditionResolution.error };
  }

  const resolvedResult = resolveOperations(
    envelope.ops,
    preconditionsResult.map,
    preconditionResolution.ranges,
    lineCount,
    semanticIndex,
    options.targetingPolicy,
    options.canonicalizerPolicy,
    semanticIndex.frontmatter?.line_range
  );
  if (!resolvedResult.ok) {
    return { ok: false, error: resolvedResult.error };
  }

  const overlapError = findOverlap(resolvedResult.resolvedOps);
  if (overlapError) {
    return { ok: false, error: overlapError };
  }

  const applyResult = applyResolvedOperations(lines, resolvedResult.resolvedOps, options);
  if (!applyResult.ok) {
    return applyResult;
  }
  lines = applyResult.lines;

  const postApplyError = validatePostApply(lines, envelope.options, options);
  if (postApplyError) {
    return { ok: false, error: postApplyError };
  }

  const applied: MarkdownAppliedOperation[] = resolvedResult.resolvedOps.map((resolved) => ({
    op_index: resolved.op_index,
    op: resolved.op,
    resolved_range: resolved.resolved_range,
  }));

  return {
    ok: true,
    content: lines.join("\n"),
    applied,
  };
}

function validateEnvelope(envelope: MarkdownOperationEnvelope): MarkdownOperationError | null {
  if (envelope.mode !== "markdown") {
    return {
      code: "MCM_INVALID_REQUEST",
      message: "Envelope mode must be markdown",
    };
  }

  if (envelope.preconditions.length === 0 || envelope.ops.length === 0) {
    return {
      code: "MCM_INVALID_REQUEST",
      message: "Preconditions and ops must be non-empty",
    };
  }

  return null;
}

function buildPreconditionMap(preconditions: MarkdownPreconditionV1[]): PreconditionMapResult {
  const preconditionsById = new Map<string, MarkdownPreconditionV1>();

  for (const precondition of preconditions) {
    if (precondition.v !== 1 || precondition.mode !== "markdown") {
      return {
        ok: false,
        error: {
          code: "MCM_INVALID_REQUEST",
          message: "Unsupported precondition format",
          precondition_id: precondition.id,
        },
      };
    }
    if (!precondition.id) {
      return {
        ok: false,
        error: {
          code: "MCM_INVALID_REQUEST",
          message: "Precondition id is required",
        },
      };
    }
    if (preconditionsById.has(precondition.id)) {
      return {
        ok: false,
        error: {
          code: "MCM_INVALID_REQUEST",
          message: `Duplicate precondition id: ${precondition.id}`,
          precondition_id: precondition.id,
        },
      };
    }
    preconditionsById.set(precondition.id, precondition);
  }

  return { ok: true, map: preconditionsById };
}

async function resolveAndValidatePreconditions(
  preconditions: MarkdownPreconditionV1[],
  lines: string[],
  semanticIndex: ReturnType<typeof buildMarkdownSemanticIndex>,
  policy?: MarkdownTargetingPolicyV1
): Promise<PreconditionResolutionResult> {
  const resolvedRanges = new Map<string, LineRange>();

  for (const precondition of preconditions) {
    const rangeResult = resolvePreconditionRange(precondition, semanticIndex, policy);
    if (!rangeResult.ok) {
      return { ok: false, error: rangeResult.error };
    }
    const range = rangeResult.range;

    const policyError = validatePreconditionPolicy(precondition, policy);
    if (policyError) {
      return { ok: false, error: policyError };
    }

    const contextError = validateContextPrefix(
      precondition,
      range,
      lines,
      policy?.max_context_prefix_chars
    );
    if (contextError) {
      return {
        ok: false,
        error: {
          code: "MCM_PRECONDITION_FAILED",
          message: contextError,
          precondition_id: precondition.id,
        },
      };
    }

    const hashError = await validatePreconditionContentHash(precondition, range, lines);
    if (hashError) {
      return { ok: false, error: hashError };
    }

    resolvedRanges.set(precondition.id, range);
  }

  return { ok: true, ranges: resolvedRanges };
}

function resolvePreconditionRange(
  precondition: MarkdownPreconditionV1,
  semanticIndex: ReturnType<typeof buildMarkdownSemanticIndex>,
  policy?: MarkdownTargetingPolicyV1
): { ok: true; range: LineRange } | { ok: false; error: MarkdownOperationError } {
  const explicitRange = precondition.line_range;
  const semantic = precondition.semantic;

  if (!explicitRange && !semantic) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Line range or semantic target required",
        precondition_id: precondition.id,
      },
    };
  }

  let resolvedRange: LineRange | null = null;
  if (semantic) {
    const semanticResult = resolveMarkdownSemanticTarget(semantic, semanticIndex, policy);
    if (!semanticResult.ok) {
      return { ok: false, error: semanticResult.error };
    }
    resolvedRange = semanticResult.range;
  }

  if (explicitRange) {
    if (!isValidLineRange(explicitRange, semanticIndex.line_count)) {
      return {
        ok: false,
        error: {
          code: "MCM_INVALID_RANGE",
          message: "Line range is out of bounds",
          precondition_id: precondition.id,
        },
      };
    }
    if (resolvedRange && !rangesEqual(explicitRange, resolvedRange)) {
      return {
        ok: false,
        error: {
          code: "MCM_PRECONDITION_FAILED",
          message: "Line range does not match semantic target",
          precondition_id: precondition.id,
        },
      };
    }
    return { ok: true, range: explicitRange };
  }

  return { ok: true, range: resolvedRange as LineRange };
}

function validatePreconditionPolicy(
  precondition: MarkdownPreconditionV1,
  policy?: MarkdownTargetingPolicyV1
): MarkdownOperationError | null {
  if (policy?.require_content_hash && !precondition.content_hash) {
    return {
      code: "MCM_PRECONDITION_FAILED",
      message: "Content hash required by policy",
      precondition_id: precondition.id,
    };
  }
  if (policy?.require_context && !precondition.context) {
    return {
      code: "MCM_PRECONDITION_FAILED",
      message: "Context required by policy",
      precondition_id: precondition.id,
    };
  }
  return null;
}

async function validatePreconditionContentHash(
  precondition: MarkdownPreconditionV1,
  range: LineRange,
  lines: string[]
): Promise<MarkdownOperationError | null> {
  if (!precondition.content_hash) {
    return null;
  }
  const computed = await computeMarkdownLineHash(lines, range);
  if (computed !== precondition.content_hash) {
    return {
      code: "MCM_CONTENT_HASH_MISMATCH",
      message: "Content hash mismatch",
      precondition_id: precondition.id,
    };
  }
  return null;
}

function resolveOperations(
  ops: MarkdownOperation[],
  preconditionsById: Map<string, MarkdownPreconditionV1>,
  resolvedRanges: Map<string, LineRange>,
  lineCount: number,
  semanticIndex: MarkdownSemanticIndex,
  policy?: MarkdownTargetingPolicyV1,
  canonicalizerPolicy?: MarkdownCanonicalizerPolicyV1,
  frontmatterRange?: LineRange
): ResolveOpsResult {
  const resolvedOps: ResolvedOperation[] = [];
  const usedPreconditionIds = new Set<string>();

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (usedPreconditionIds.has(op.precondition_id)) {
      return {
        ok: false,
        error: {
          code: "MCM_INVALID_REQUEST",
          message: `Duplicate precondition_id in ops: ${op.precondition_id}`,
          op_index: i,
          precondition_id: op.precondition_id,
        },
      };
    }
    usedPreconditionIds.add(op.precondition_id);

    const precondition = preconditionsById.get(op.precondition_id);
    if (!precondition) {
      return {
        ok: false,
        error: {
          code: "MCM_PRECONDITION_FAILED",
          message: `Missing precondition for ${op.precondition_id}`,
          op_index: i,
          precondition_id: op.precondition_id,
        },
      };
    }

    const resolvedRange = resolvedRanges.get(op.precondition_id);
    if (!resolvedRange) {
      return {
        ok: false,
        error: {
          code: "MCM_PRECONDITION_FAILED",
          message: `Missing resolved range for ${op.precondition_id}`,
          op_index: i,
          precondition_id: op.precondition_id,
        },
      };
    }

    const resolved = resolveOperation(
      op,
      resolvedRange,
      lineCount,
      semanticIndex,
      policy,
      canonicalizerPolicy,
      i,
      frontmatterRange
    );
    if (!resolved.ok) {
      return resolved;
    }
    resolvedOps.push(resolved.resolved);
  }

  return { ok: true, resolvedOps };
}

function resolveOperation(
  op: MarkdownOperation,
  resolvedRange: LineRange,
  lineCount: number,
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  canonicalizerPolicy: MarkdownCanonicalizerPolicyV1 | undefined,
  opIndex: number,
  frontmatterRange?: LineRange
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  switch (op.op) {
    case "md_replace_lines":
      return resolveReplaceLines(op, resolvedRange, lineCount, opIndex);
    case "md_delete_lines":
      return resolveDeleteLines(op, resolvedRange, lineCount, opIndex);
    case "md_insert_lines":
      return resolveInsertLines(op, resolvedRange, lineCount, opIndex);
    case "md_replace_block":
      return resolveReplaceBlock(op, resolvedRange, semanticIndex, policy, opIndex);
    case "md_insert_after":
      return resolveInsertAfter(op, resolvedRange, semanticIndex, policy, opIndex);
    case "md_insert_before":
      return resolveInsertBefore(op, resolvedRange, semanticIndex, policy, opIndex);
    case "md_insert_code_fence":
      return resolveInsertCodeFence(
        op,
        resolvedRange,
        semanticIndex,
        policy,
        canonicalizerPolicy,
        opIndex
      );
    case "md_update_frontmatter":
      return resolveFrontmatterUpdate(op, resolvedRange, opIndex, frontmatterRange);
    default: {
      const exhaustiveCheck: never = op;
      return {
        ok: false,
        error: {
          code: "MCM_OPERATION_UNSUPPORTED",
          message: `Unsupported operation ${(exhaustiveCheck as MarkdownOperation).op}`,
          op_index: opIndex,
          precondition_id: (exhaustiveCheck as MarkdownOperation).precondition_id,
        },
      };
    }
  }
}

function resolveReplaceLines(
  op: Extract<MarkdownOperation, { op: "md_replace_lines" }>,
  resolvedRange: LineRange,
  lineCount: number,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const range = op.target.line_range;
  if (!isValidLineRange(range, lineCount)) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Line range is out of bounds",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  if (!rangesEqual(resolvedRange, range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return { ok: true, resolved: { op_index: opIndex, op, resolved_range: range } };
}

function resolveDeleteLines(
  op: Extract<MarkdownOperation, { op: "md_delete_lines" }>,
  resolvedRange: LineRange,
  lineCount: number,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const range = op.target.line_range;
  if (!isValidLineRange(range, lineCount)) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Line range is out of bounds",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  if (!rangesEqual(resolvedRange, range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return { ok: true, resolved: { op_index: opIndex, op, resolved_range: range } };
}

function resolveInsertLines(
  op: Extract<MarkdownOperation, { op: "md_insert_lines" }>,
  resolvedRange: LineRange,
  lineCount: number,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const anchorLine = "after_line" in op.target ? op.target.after_line : op.target.before_line;
  if (!Number.isInteger(anchorLine)) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Insertion anchor must be an integer line number",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  if (anchorLine < 1 || anchorLine > lineCount) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Insertion anchor is out of bounds",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  const anchorRange = { start: anchorLine, end: anchorLine };
  if (!rangesEqual(resolvedRange, anchorRange)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Insertion anchor does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  const insertIndex = "after_line" in op.target ? anchorLine : anchorLine - 1;
  return {
    ok: true,
    resolved: {
      op_index: opIndex,
      op,
      resolved_range: anchorRange,
      insert_index: insertIndex,
    },
  };
}

function resolveReplaceBlock(
  op: Extract<MarkdownOperation, { op: "md_replace_block" }>,
  resolvedRange: LineRange,
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const targetResult = resolveBlockTargetRange(
    op.target,
    semanticIndex,
    policy,
    opIndex,
    op.precondition_id
  );
  if (!targetResult.ok) {
    return targetResult;
  }
  if (!rangesEqual(resolvedRange, targetResult.range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return { ok: true, resolved: { op_index: opIndex, op, resolved_range: targetResult.range } };
}

function resolveInsertAfter(
  op: Extract<MarkdownOperation, { op: "md_insert_after" }>,
  resolvedRange: LineRange,
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const targetResult = resolveBlockTargetRange(
    op.target,
    semanticIndex,
    policy,
    opIndex,
    op.precondition_id
  );
  if (!targetResult.ok) {
    return targetResult;
  }
  if (!rangesEqual(resolvedRange, targetResult.range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return {
    ok: true,
    resolved: {
      op_index: opIndex,
      op,
      resolved_range: targetResult.range,
      insert_index: targetResult.range.end,
    },
  };
}

function resolveInsertBefore(
  op: Extract<MarkdownOperation, { op: "md_insert_before" }>,
  resolvedRange: LineRange,
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const targetResult = resolveBlockTargetRange(
    op.target,
    semanticIndex,
    policy,
    opIndex,
    op.precondition_id
  );
  if (!targetResult.ok) {
    return targetResult;
  }
  if (!rangesEqual(resolvedRange, targetResult.range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return {
    ok: true,
    resolved: {
      op_index: opIndex,
      op,
      resolved_range: targetResult.range,
      insert_index: targetResult.range.start - 1,
    },
  };
}

function resolveInsertCodeFence(
  op: Extract<MarkdownOperation, { op: "md_insert_code_fence" }>,
  resolvedRange: LineRange,
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  canonicalizerPolicy: MarkdownCanonicalizerPolicyV1 | undefined,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  const targetResult = resolveBlockTargetRange(
    op.target,
    semanticIndex,
    policy,
    opIndex,
    op.precondition_id
  );
  if (!targetResult.ok) {
    return targetResult;
  }
  if (!rangesEqual(resolvedRange, targetResult.range)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Operation target does not match precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  const fenceOptions = resolveCodeFenceOptions(op, opIndex, canonicalizerPolicy);
  if (!fenceOptions.ok) {
    return fenceOptions;
  }
  return {
    ok: true,
    resolved: {
      op_index: opIndex,
      op,
      resolved_range: targetResult.range,
      insert_index: targetResult.range.end,
    },
  };
}

function resolveBlockTargetRange(
  target: { block_id: string } | { semantic: MarkdownPreconditionV1["semantic"] },
  semanticIndex: MarkdownSemanticIndex,
  policy: MarkdownTargetingPolicyV1 | undefined,
  opIndex: number,
  preconditionId: string
): { ok: true; range: LineRange } | { ok: false; error: MarkdownOperationError } {
  if ("block_id" in target) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "block_id targeting is not supported for markdown operations",
        op_index: opIndex,
        precondition_id: preconditionId,
      },
    };
  }

  if (!target.semantic) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_TARGET",
        message: "Semantic target is required",
        op_index: opIndex,
        precondition_id: preconditionId,
      },
    };
  }

  const semanticResult = resolveMarkdownSemanticTarget(target.semantic, semanticIndex, policy);
  if (!semanticResult.ok) {
    return {
      ok: false,
      error: {
        ...semanticResult.error,
        op_index: opIndex,
        precondition_id: preconditionId,
      },
    };
  }

  return { ok: true, range: semanticResult.range };
}

function resolveCodeFenceOptions(
  op: Extract<MarkdownOperation, { op: "md_insert_code_fence" }>,
  opIndex: number,
  canonicalizerPolicy?: MarkdownCanonicalizerPolicyV1
):
  | { ok: true; fenceChar: "`" | "~"; fenceLength: number }
  | { ok: false; error: MarkdownOperationError } {
  const defaults = resolveFenceDefaults(canonicalizerPolicy);
  const fenceChar = op.fence_char ?? defaults.fenceChar;
  if (fenceChar !== "`" && fenceChar !== "~") {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: "Fence character must be ` or ~",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }

  const fenceLength = op.fence_length ?? defaults.fenceLength;
  if (!Number.isInteger(fenceLength) || fenceLength < 3) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_REQUEST",
        message: "Fence length must be an integer of at least 3",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }

  return { ok: true, fenceChar, fenceLength };
}

function resolveFenceDefaults(canonicalizerPolicy?: MarkdownCanonicalizerPolicyV1): {
  fenceChar: "`" | "~";
  fenceLength: number;
} {
  const normalized = canonicalizerPolicy?.normalize;
  const fenceChar = normalized?.fence_char ?? "`";
  const fenceLength = normalized?.fence_length ?? 3;
  return { fenceChar, fenceLength };
}

function resolveFrontmatterUpdate(
  op: Extract<MarkdownOperation, { op: "md_update_frontmatter" }>,
  resolvedRange: LineRange,
  opIndex: number,
  frontmatterRange?: LineRange
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  if (frontmatterRange && !rangesEqual(frontmatterRange, resolvedRange)) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Frontmatter update requires frontmatter precondition range",
        op_index: opIndex,
        precondition_id: op.precondition_id,
      },
    };
  }
  return { ok: true, resolved: { op_index: opIndex, op, resolved_range: resolvedRange } };
}

function applyResolvedOperations(
  lines: string[],
  ops: ResolvedOperation[],
  options: ApplyOptions
): { ok: true; lines: string[] } | { ok: false; error: MarkdownOperationError } {
  const applyOrder = [...ops].sort((a, b) => {
    if (a.resolved_range.start !== b.resolved_range.start) {
      return b.resolved_range.start - a.resolved_range.start;
    }
    return b.resolved_range.end - a.resolved_range.end;
  });

  for (const resolved of applyOrder) {
    const result = applyResolvedOperation(lines, resolved, options);
    if (!result.ok) {
      return result;
    }
    lines = result.lines;
  }

  return { ok: true, lines };
}

function applyResolvedOperation(
  lines: string[],
  resolved: ResolvedOperation,
  options: ApplyOptions
): { ok: true; lines: string[] } | { ok: false; error: MarkdownOperationError } {
  if (resolved.op.op === "md_replace_lines") {
    const replacement = splitMarkdownLines(resolved.op.content);
    applyReplace(lines, resolved.resolved_range, replacement);
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_delete_lines") {
    applyDelete(lines, resolved.resolved_range);
    if (lines.length === 0) {
      lines.push("");
    }
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_insert_lines") {
    const insertion = splitMarkdownLines(resolved.op.content);
    applyInsert(lines, resolved.insert_index ?? 0, insertion);
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_replace_block") {
    const replacement = splitMarkdownLines(resolved.op.content);
    applyReplace(lines, resolved.resolved_range, replacement);
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_insert_after" || resolved.op.op === "md_insert_before") {
    const insertion = splitMarkdownLines(resolved.op.content);
    applyInsert(lines, resolved.insert_index ?? 0, insertion);
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_insert_code_fence") {
    const fenceResult = buildCodeFenceLines(
      resolved.op,
      resolved.op_index,
      options.canonicalizerPolicy
    );
    if (!fenceResult.ok) {
      return { ok: false, error: fenceResult.error };
    }
    applyInsert(lines, resolved.insert_index ?? 0, fenceResult.lines);
    return { ok: true, lines };
  }

  if (resolved.op.op === "md_update_frontmatter") {
    return applyFrontmatterUpdate(lines, resolved.op, options.frontmatterPolicy);
  }

  const exhaustiveOp: never = resolved.op;
  return {
    ok: false,
    error: {
      code: "MCM_OPERATION_UNSUPPORTED",
      message: `Unsupported operation ${(exhaustiveOp as MarkdownOperation).op}`,
      precondition_id: (exhaustiveOp as MarkdownOperation).precondition_id,
    },
  };
}

function validatePostApply(
  lines: string[],
  envelopeOptions: MarkdownOperationEnvelope["options"] | undefined,
  options: ApplyOptions
): MarkdownOperationError | null {
  const sanitizationPolicy = options.sanitizationPolicy;
  const frontmatterConfig = resolveFrontmatterValidationConfig(envelopeOptions, options);
  const needsSemanticIndex =
    Boolean(sanitizationPolicy) ||
    frontmatterConfig.validateFrontmatter ||
    frontmatterConfig.frontmatterLimit !== undefined;
  if (!needsSemanticIndex) {
    return null;
  }

  const semanticIndex = buildMarkdownSemanticIndex(lines);

  const frontmatterError = validateFrontmatterState(
    lines,
    semanticIndex,
    frontmatterConfig,
    sanitizationPolicy
  );
  if (frontmatterError) {
    return frontmatterError;
  }

  if (sanitizationPolicy) {
    const lineLimitError = validateLineLimits(lines, sanitizationPolicy);
    if (lineLimitError) {
      return lineLimitError;
    }

    const fenceError = validateCodeFenceLimits(semanticIndex, sanitizationPolicy);
    if (fenceError) {
      return fenceError;
    }
  }

  return null;
}

function buildCodeFenceLines(
  op: Extract<MarkdownOperation, { op: "md_insert_code_fence" }>,
  opIndex: number,
  canonicalizerPolicy?: MarkdownCanonicalizerPolicyV1
): { ok: true; lines: string[] } | { ok: false; error: MarkdownOperationError } {
  const options = resolveCodeFenceOptions(op, opIndex, canonicalizerPolicy);
  if (!options.ok) {
    return { ok: false, error: options.error };
  }

  const language = op.language?.trim();
  const fence = options.fenceChar.repeat(options.fenceLength);
  const opening = language ? `${fence}${language}` : fence;
  const contentLines = splitMarkdownLines(op.content);

  return { ok: true, lines: [opening, ...contentLines, fence] };
}

function applyFrontmatterUpdate(
  lines: string[],
  op: Extract<MarkdownOperation, { op: "md_update_frontmatter" }>,
  policy?: ApplyOptions["frontmatterPolicy"]
): { ok: true; lines: string[] } | { ok: false; error: MarkdownOperationError } {
  const contextResult = resolveFrontmatterContext(lines, op, policy);
  if (!contextResult.ok) {
    return contextResult;
  }

  const updateResult = updateFrontmatterValue(
    contextResult.context.data,
    op.target.key_path,
    op.value,
    op.create_if_missing ?? false
  );
  if (!updateResult.ok) {
    return { ok: false, error: updateResult.error };
  }

  const serialized = stringifyFrontmatter(updateResult.data, contextResult.context.syntax);
  if (!serialized.ok) {
    return { ok: false, error: serialized.error };
  }

  const frontmatterLines = buildFrontmatterLines(contextResult.context.syntax, serialized.content);
  const sizeError = enforceFrontmatterSize(
    frontmatterLines.join("\n"),
    policy?.max_frontmatter_bytes,
    op.precondition_id
  );
  if (sizeError) {
    return { ok: false, error: sizeError };
  }

  return replaceOrInsertFrontmatter(lines, frontmatterLines, contextResult.context.existingRange);
}

type FrontmatterValidationConfig = {
  validateFrontmatter: boolean;
  frontmatterLimit?: number;
};

function resolveFrontmatterValidationConfig(
  envelopeOptions: MarkdownOperationEnvelope["options"] | undefined,
  options: ApplyOptions
): FrontmatterValidationConfig {
  const sanitizationPolicy = options.sanitizationPolicy;
  const frontmatterPolicy = options.frontmatterPolicy;
  const validateFrontmatter =
    envelopeOptions?.validate_frontmatter ??
    sanitizationPolicy?.allow_frontmatter ??
    frontmatterPolicy?.allow_frontmatter ??
    false;

  return {
    validateFrontmatter,
    frontmatterLimit:
      sanitizationPolicy?.max_frontmatter_bytes ?? frontmatterPolicy?.max_frontmatter_bytes,
  };
}

function validateFrontmatterState(
  lines: string[],
  index: MarkdownSemanticIndex,
  config: FrontmatterValidationConfig,
  sanitizationPolicy: MarkdownSanitizationPolicyV1 | undefined
): MarkdownOperationError | null {
  if (config.validateFrontmatter && index.frontmatter_error) {
    return index.frontmatter_error;
  }

  if (sanitizationPolicy && !sanitizationPolicy.allow_frontmatter && index.frontmatter) {
    return {
      code: "MCM_BLOCK_TYPE_DISALLOWED",
      message: "Frontmatter blocks are not allowed",
    };
  }

  if (config.frontmatterLimit !== undefined && index.frontmatter) {
    return validateFrontmatterSize(lines, index.frontmatter.line_range, config.frontmatterLimit);
  }

  return null;
}

function validateLineLimits(
  lines: string[],
  policy: MarkdownSanitizationPolicyV1
): MarkdownOperationError | null {
  if (lines.length > policy.max_file_lines) {
    return {
      code: "MCM_LINE_LIMIT_EXCEEDED",
      message: "File exceeds max line count",
    };
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].length > policy.max_line_length) {
      return {
        code: "MCM_LINE_LIMIT_EXCEEDED",
        message: `Line ${i + 1} exceeds max line length`,
      };
    }
  }

  return null;
}

function validateCodeFenceLimits(
  index: MarkdownSemanticIndex,
  policy: MarkdownSanitizationPolicyV1
): MarkdownOperationError | null {
  const allowedLanguages = policy.allowed_languages;
  const blockedLanguages = policy.blocked_languages ?? [];

  for (const fence of index.code_fences) {
    const contentLineCount = Math.max(0, fence.line_range.end - fence.line_range.start - 1);
    if (contentLineCount > policy.max_code_fence_lines) {
      return {
        code: "MCM_LINE_LIMIT_EXCEEDED",
        message: "Code fence exceeds max line count",
      };
    }

    const language = fence.language;
    if (allowedLanguages && allowedLanguages.length > 0) {
      if (!language || !allowedLanguages.includes(language)) {
        return {
          code: "MCM_LANGUAGE_DISALLOWED",
          message: "Code fence language is not allowed",
        };
      }
    } else if (language && blockedLanguages.includes(language)) {
      return {
        code: "MCM_LANGUAGE_DISALLOWED",
        message: "Code fence language is blocked",
      };
    }
  }

  return null;
}

function validateFrontmatterSize(
  lines: string[],
  range: LineRange,
  maxBytes: number
): MarkdownOperationError | null {
  const text = lines.slice(range.start - 1, range.end).join("\n");
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength <= maxBytes) {
    return null;
  }
  return {
    code: "MCM_LINE_LIMIT_EXCEEDED",
    message: "Frontmatter size exceeds policy limit",
  };
}

type FrontmatterContext = {
  syntax: "yaml" | "toml" | "json";
  data: unknown;
  existingRange: LineRange | null;
};

function resolveFrontmatterContext(
  lines: string[],
  op: Extract<MarkdownOperation, { op: "md_update_frontmatter" }>,
  policy?: ApplyOptions["frontmatterPolicy"]
): { ok: true; context: FrontmatterContext } | { ok: false; error: MarkdownOperationError } {
  if (!policy || !policy.allow_frontmatter) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "Frontmatter updates are not allowed",
        precondition_id: op.precondition_id,
      },
    };
  }

  const parseResult = parseFrontmatter(lines);
  if (parseResult.found) {
    if (!parseResult.ok) {
      return { ok: false, error: parseResult.error };
    }
    const syntax = parseResult.value.block.syntax;
    const formatError = validateFrontmatterFormat(policy, syntax, op.precondition_id);
    if (formatError) {
      return { ok: false, error: formatError };
    }
    return {
      ok: true,
      context: {
        syntax,
        data: parseResult.value.data,
        existingRange: parseResult.value.block.line_range,
      },
    };
  }

  if (!op.create_if_missing) {
    return {
      ok: false,
      error: {
        code: "MCM_TARGETING_NOT_FOUND",
        message: "Frontmatter not found",
        precondition_id: op.precondition_id,
      },
    };
  }

  const defaultFormat = policy.frontmatter_formats[0];
  if (!defaultFormat) {
    return {
      ok: false,
      error: {
        code: "MCM_FRONTMATTER_INVALID",
        message: "No frontmatter formats available",
        precondition_id: op.precondition_id,
      },
    };
  }
  const formatError = validateFrontmatterFormat(policy, defaultFormat, op.precondition_id);
  if (formatError) {
    return { ok: false, error: formatError };
  }
  return {
    ok: true,
    context: {
      syntax: defaultFormat,
      data: {},
      existingRange: null,
    },
  };
}

function validateFrontmatterFormat(
  policy: NonNullable<ApplyOptions["frontmatterPolicy"]>,
  syntax: "yaml" | "toml" | "json",
  preconditionId: string
): MarkdownOperationError | null {
  if (!policy.frontmatter_formats.includes(syntax)) {
    return {
      code: "MCM_FRONTMATTER_INVALID",
      message: "Frontmatter format is not allowed",
      precondition_id: preconditionId,
    };
  }
  return null;
}

function enforceFrontmatterSize(
  content: string,
  maxBytes: number | undefined,
  preconditionId: string
): MarkdownOperationError | null {
  if (maxBytes === undefined) {
    return null;
  }
  const byteLength = new TextEncoder().encode(content).length;
  if (byteLength <= maxBytes) {
    return null;
  }
  return {
    code: "MCM_LINE_LIMIT_EXCEEDED",
    message: "Frontmatter size exceeds policy limit",
    precondition_id: preconditionId,
  };
}

function replaceOrInsertFrontmatter(
  lines: string[],
  frontmatterLines: string[],
  existingRange: LineRange | null
): { ok: true; lines: string[] } {
  if (existingRange) {
    const startIndex = existingRange.start - 1;
    const deleteCount = existingRange.end - existingRange.start + 1;
    lines.splice(startIndex, deleteCount, ...frontmatterLines);
    return { ok: true, lines };
  }
  lines.splice(0, 0, ...frontmatterLines);
  return { ok: true, lines };
}

function isValidLineRange(range: LineRange, lineCount: number): boolean {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return false;
  }
  if (range.start < 1 || range.end < 1) {
    return false;
  }
  if (range.end < range.start) {
    return false;
  }
  return range.end <= lineCount;
}

function rangesEqual(a: LineRange, b: LineRange): boolean {
  return a.start === b.start && a.end === b.end;
}

function rangesOverlap(a: LineRange, b: LineRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function findOverlap(ops: ResolvedOperation[]): MarkdownOperationError | null {
  if (ops.length < 2) {
    return null;
  }
  const sorted = [...ops].sort((a, b) => {
    if (a.resolved_range.start !== b.resolved_range.start) {
      return a.resolved_range.start - b.resolved_range.start;
    }
    return a.resolved_range.end - b.resolved_range.end;
  });
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (rangesOverlap(previous.resolved_range, current.resolved_range)) {
      return {
        code: "MCM_OPERATION_OVERLAP",
        message: "Resolved line ranges overlap",
        op_index: current.op_index,
        precondition_id: current.op.precondition_id,
      };
    }
  }
  return null;
}

function validateContextPrefix(
  precondition: MarkdownPreconditionV1,
  range: LineRange,
  lines: string[],
  maxPrefixChars?: number
): string | null {
  if (!precondition.context) {
    return null;
  }
  const beforeError = validateBeforePrefix(
    precondition.context.line_before_prefix,
    range,
    lines,
    maxPrefixChars
  );
  if (beforeError) {
    return beforeError;
  }
  return validateAfterPrefix(precondition.context.line_after_prefix, range, lines, maxPrefixChars);
}

function validateBeforePrefix(
  prefix: string | undefined,
  range: LineRange,
  lines: string[],
  maxPrefixChars?: number
): string | null {
  if (typeof prefix !== "string") {
    return null;
  }
  if (maxPrefixChars !== undefined && prefix.length > maxPrefixChars) {
    return "Context prefix exceeds policy max length";
  }
  const beforeIndex = range.start - 2;
  if (beforeIndex < 0) {
    return "Context line_before_prefix is out of bounds";
  }
  if (!lines[beforeIndex].startsWith(prefix)) {
    return "Context line_before_prefix mismatch";
  }
  return null;
}

function validateAfterPrefix(
  prefix: string | undefined,
  range: LineRange,
  lines: string[],
  maxPrefixChars?: number
): string | null {
  if (typeof prefix !== "string") {
    return null;
  }
  if (maxPrefixChars !== undefined && prefix.length > maxPrefixChars) {
    return "Context prefix exceeds policy max length";
  }
  const afterIndex = range.end;
  if (afterIndex >= lines.length) {
    return "Context line_after_prefix is out of bounds";
  }
  if (!lines[afterIndex].startsWith(prefix)) {
    return "Context line_after_prefix mismatch";
  }
  return null;
}

function applyReplace(lines: string[], range: LineRange, replacement: string[]): void {
  const startIndex = range.start - 1;
  const deleteCount = range.end - range.start + 1;
  lines.splice(startIndex, deleteCount, ...replacement);
}

function applyDelete(lines: string[], range: LineRange): void {
  const startIndex = range.start - 1;
  const deleteCount = range.end - range.start + 1;
  lines.splice(startIndex, deleteCount);
}

function applyInsert(lines: string[], index: number, insertion: string[]): void {
  lines.splice(index, 0, ...insertion);
}
