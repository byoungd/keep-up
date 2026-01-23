import type { MarkdownTargetingPolicyV1 } from "../kernel/policy/types.js";
import { computeMarkdownLineHash, normalizeMarkdownText, splitMarkdownLines } from "./hash.js";
import type {
  LineRange,
  MarkdownAppliedOperation,
  MarkdownLineApplyResult,
  MarkdownOperation,
  MarkdownOperationEnvelope,
  MarkdownOperationError,
  MarkdownPreconditionV1,
} from "./types.js";

type ResolvedOperation = {
  op_index: number;
  op: MarkdownOperation;
  resolved_range: LineRange;
  insert_index?: number;
};

type ApplyOptions = {
  targetingPolicy?: MarkdownTargetingPolicyV1;
};

type PreconditionMapResult =
  | { ok: true; map: Map<string, MarkdownPreconditionV1> }
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

  const preconditionError = await validatePreconditions(
    envelope.preconditions,
    lines,
    options.targetingPolicy
  );
  if (preconditionError) {
    return { ok: false, error: preconditionError };
  }

  const resolvedResult = resolveOperations(envelope.ops, preconditionsResult.map, lineCount);
  if (!resolvedResult.ok) {
    return { ok: false, error: resolvedResult.error };
  }

  const overlapError = findOverlap(resolvedResult.resolvedOps);
  if (overlapError) {
    return { ok: false, error: overlapError };
  }

  lines = applyResolvedOperations(lines, resolvedResult.resolvedOps);

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

async function validatePreconditions(
  preconditions: MarkdownPreconditionV1[],
  lines: string[],
  policy?: MarkdownTargetingPolicyV1
): Promise<MarkdownOperationError | null> {
  for (const precondition of preconditions) {
    const rangeResult = resolvePreconditionRange(precondition, lines.length);
    if (!rangeResult.ok) {
      return rangeResult.error;
    }
    const range = rangeResult.range;

    const policyError = validatePreconditionPolicy(precondition, policy);
    if (policyError) {
      return policyError;
    }

    const contextError = validateContextPrefix(
      precondition,
      range,
      lines,
      policy?.max_context_prefix_chars
    );
    if (contextError) {
      return {
        code: "MCM_PRECONDITION_FAILED",
        message: contextError,
        precondition_id: precondition.id,
      };
    }

    const hashError = await validatePreconditionContentHash(precondition, range, lines);
    if (hashError) {
      return hashError;
    }
  }

  return null;
}

function resolvePreconditionRange(
  precondition: MarkdownPreconditionV1,
  lineCount: number
): { ok: true; range: LineRange } | { ok: false; error: MarkdownOperationError } {
  const range = precondition.line_range;
  if (!range) {
    return {
      ok: false,
      error: {
        code: "MCM_PRECONDITION_FAILED",
        message: "Line range required for line-based operations",
        precondition_id: precondition.id,
      },
    };
  }
  if (!isValidLineRange(range, lineCount)) {
    return {
      ok: false,
      error: {
        code: "MCM_INVALID_RANGE",
        message: "Line range is out of bounds",
        precondition_id: precondition.id,
      },
    };
  }
  return { ok: true, range };
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
  lineCount: number
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

    const resolved = resolveOperation(op, precondition, lineCount, i);
    if (!resolved.ok) {
      return resolved;
    }
    resolvedOps.push(resolved.resolved);
  }

  return { ok: true, resolvedOps };
}

function resolveOperation(
  op: MarkdownOperation,
  precondition: MarkdownPreconditionV1,
  lineCount: number,
  opIndex: number
): { ok: true; resolved: ResolvedOperation } | { ok: false; error: MarkdownOperationError } {
  switch (op.op) {
    case "md_replace_lines":
      return resolveReplaceLines(op, precondition, lineCount, opIndex);
    case "md_delete_lines":
      return resolveDeleteLines(op, precondition, lineCount, opIndex);
    case "md_insert_lines":
      return resolveInsertLines(op, precondition, lineCount, opIndex);
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
  precondition: MarkdownPreconditionV1,
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
  if (!precondition.line_range || !rangesEqual(precondition.line_range, range)) {
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
  precondition: MarkdownPreconditionV1,
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
  if (!precondition.line_range || !rangesEqual(precondition.line_range, range)) {
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
  precondition: MarkdownPreconditionV1,
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
  if (!precondition.line_range || !rangesEqual(precondition.line_range, anchorRange)) {
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

function applyResolvedOperations(lines: string[], ops: ResolvedOperation[]): string[] {
  const applyOrder = [...ops].sort((a, b) => {
    if (a.resolved_range.start !== b.resolved_range.start) {
      return b.resolved_range.start - a.resolved_range.start;
    }
    return b.resolved_range.end - a.resolved_range.end;
  });

  for (const resolved of applyOrder) {
    if (resolved.op.op === "md_replace_lines") {
      const replacement = splitMarkdownLines(resolved.op.content);
      applyReplace(lines, resolved.resolved_range, replacement);
      continue;
    }

    if (resolved.op.op === "md_delete_lines") {
      applyDelete(lines, resolved.resolved_range);
      if (lines.length === 0) {
        lines.push("");
      }
      continue;
    }

    if (resolved.op.op === "md_insert_lines") {
      const insertion = splitMarkdownLines(resolved.op.content);
      applyInsert(lines, resolved.insert_index ?? 0, insertion);
    }
  }

  return lines;
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
