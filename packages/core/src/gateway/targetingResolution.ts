import { absoluteFromAnchor, anchorFromAbsolute } from "../kernel/mapping/anchors.js";
import { checkSpanPreconditionV1 } from "./conflict.js";
import { createGateway409, createGatewayError } from "./envelope.js";
import { compareMatchVectors, type MatchVector } from "./targeting.js";
import type {
  AIGatewayRequest,
  AIGatewayResult,
  AiTargetingPolicyV1,
  FailedPrecondition,
  GatewayDiagnostic,
  GatewayDocumentProvider,
  LayeredPreconditionsV1,
  RetargetingRecord,
  SpanState,
  TargetingRelocatePolicy,
  TargetRange,
  TargetSpan,
  TrimmingRecord,
  WeakRecovery,
  WeakTargetPreconditionV1,
} from "./types.js";

type WeakResolutionSuccess = {
  ok: true;
  request: AIGatewayRequest;
  weakRecoveries: WeakRecovery[];
  trimming: TrimmingRecord[];
  retargeting: RetargetingRecord[];
  diagnostics: GatewayDiagnostic[];
  appliedSpanIds: string[];
};

type WeakResolutionFailure = {
  ok: false;
  response: AIGatewayResult;
  diagnostics: GatewayDiagnostic[];
  appliedSpanIds: string[];
};

export type WeakResolutionResult = WeakResolutionSuccess | WeakResolutionFailure;

export function deriveTargetSpans(
  request: AIGatewayRequest,
  provider: GatewayDocumentProvider
): TargetSpan[] {
  if (request.target_spans.length > 0) {
    return request.target_spans;
  }
  const targets = new Map<string, TargetSpan>();
  const preconditions = resolveAllPreconditions(
    request.layered_preconditions,
    request.preconditions
  );
  for (const precondition of preconditions) {
    if (!precondition.span_id) {
      continue;
    }
    if (!targets.has(precondition.span_id)) {
      targets.set(precondition.span_id, buildTargetSpan(precondition.span_id, provider));
    }
  }
  return [...targets.values()];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Weak precondition recovery spans multiple policy checks.
export function resolveWeakPreconditions(
  request: AIGatewayRequest,
  provider: GatewayDocumentProvider,
  policy: AiTargetingPolicyV1
): WeakResolutionResult {
  const diagnostics: GatewayDiagnostic[] = [];
  const derivedTargets = deriveTargetSpans(request, provider);
  const targetMap = new Map<string, TargetSpan>(
    derivedTargets.map((target) => [target.span_id, target])
  );
  const updatedRequest: AIGatewayRequest =
    request.target_spans.length > 0 ? request : { ...request, target_spans: derivedTargets };

  const layered = request.layered_preconditions;
  if (!layered || !layered.weak || layered.weak.length === 0) {
    return {
      ok: true,
      request: updatedRequest,
      weakRecoveries: [],
      trimming: [],
      retargeting: [],
      diagnostics,
      appliedSpanIds: [...targetMap.keys()],
    };
  }

  if (!policy.enabled || !policy.allow_layered_preconditions || !policy.allow_soft_preconditions) {
    return {
      ok: false,
      response: createGatewayError({
        status: 400,
        code: "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION",
        message: "Layered preconditions are not allowed by policy.",
        requestId: request.request_id,
        clientRequestId: request.client_request_id,
        policyContext: request.policy_context,
      }),
      diagnostics,
      appliedSpanIds: [...targetMap.keys()],
    };
  }

  if (layered.weak.length > policy.max_weak_preconditions) {
    return {
      ok: false,
      response: createGatewayError({
        status: 400,
        code: "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION",
        message: "Too many weak preconditions for policy limits.",
        requestId: request.request_id,
        clientRequestId: request.client_request_id,
        policyContext: request.policy_context,
      }),
      diagnostics,
      appliedSpanIds: [...targetMap.keys()],
    };
  }

  const spanIds = new Set(targetMap.keys());
  const unmapped = findUnmappedPreconditions(layered, spanIds);
  if (unmapped.length > 0) {
    return {
      ok: false,
      response: createGatewayError({
        status: 400,
        code: "AI_PAYLOAD_REJECTED_SCHEMA_VIOLATION",
        message: `Preconditions missing targets: ${unmapped.join(", ")}`,
        requestId: request.request_id,
        clientRequestId: request.client_request_id,
        policyContext: request.policy_context,
      }),
      diagnostics,
      appliedSpanIds: [...targetMap.keys()],
    };
  }

  const weakRecoveries: WeakRecovery[] = [];
  const trimming: TrimmingRecord[] = [];
  const retargeting: RetargetingRecord[] = [];

  for (const precondition of layered.weak) {
    const spanId = precondition.span_id;
    if (!spanId) {
      diagnostics.push({
        severity: "error",
        kind: "ai_targeting_invalid_precondition",
        detail: "Weak precondition missing span_id.",
        stage: "precondition",
        code: "AI_WEAK_PRECONDITION_INVALID",
      });
      return buildWeakFailureResponse(
        request,
        provider,
        diagnostics,
        [
          {
            span_id: "unknown",
            annotation_id: "unknown",
            reason: "span_missing",
            detail: "Weak precondition missing span_id",
          },
        ],
        [...targetMap.keys()]
      );
    }

    const spanState = provider.getSpanState(spanId);
    const failure = checkSpanPreconditionV1(precondition, spanState);
    if (!failure) {
      continue;
    }

    const result = applyWeakRecovery({
      request,
      policy,
      provider,
      precondition,
      spanState,
      failure,
    });

    if (!result.ok) {
      diagnostics.push(...result.diagnostics);
      return buildWeakFailureResponse(
        request,
        provider,
        diagnostics,
        [failure],
        [...targetMap.keys()]
      );
    }

    if (result.recovery) {
      weakRecoveries.push(result.recovery);
    }
    if (result.trimming) {
      trimming.push(result.trimming);
    }
    if (result.retargeting) {
      retargeting.push(result.retargeting);
    }

    if (result.updatedSpanId) {
      targetMap.delete(spanId);
      targetMap.set(result.updatedSpanId, buildTargetSpan(result.updatedSpanId, provider));
    } else if (result.action === "skip") {
      targetMap.delete(spanId);
    }
  }

  if (targetMap.size === 0) {
    diagnostics.push({
      severity: "error",
      kind: "ai_targeting_all_skipped",
      detail: "All targets were skipped after weak recovery.",
      stage: "targeting",
      code: "AI_TARGETING_ALL_SKIPPED",
    });
    return buildWeakFailureResponse(request, provider, diagnostics, [], []);
  }

  return {
    ok: true,
    request: { ...updatedRequest, target_spans: [...targetMap.values()] },
    weakRecoveries,
    trimming,
    retargeting,
    diagnostics,
    appliedSpanIds: [...targetMap.keys()],
  };
}

function findUnmappedPreconditions(
  layered: LayeredPreconditionsV1,
  spanIds: Set<string>
): string[] {
  const unmapped: string[] = [];
  for (const precondition of layered.strong) {
    if (precondition.span_id && !spanIds.has(precondition.span_id)) {
      unmapped.push(precondition.span_id);
    }
  }
  for (const precondition of layered.weak ?? []) {
    if (precondition.span_id && !spanIds.has(precondition.span_id)) {
      unmapped.push(precondition.span_id);
    }
  }
  return unmapped;
}

function resolveAllPreconditions(
  layered: LayeredPreconditionsV1 | undefined,
  preconditions: AIGatewayRequest["preconditions"]
): WeakTargetPreconditionV1[] {
  if (layered) {
    return [...layered.strong, ...(layered.weak ?? [])] as WeakTargetPreconditionV1[];
  }
  return (preconditions ?? []) as WeakTargetPreconditionV1[];
}

function buildTargetSpan(spanId: string, provider: GatewayDocumentProvider): TargetSpan {
  const state = provider.getSpanState(spanId);
  return {
    annotation_id: state?.annotation_id ?? "unknown",
    span_id: spanId,
    if_match_context_hash: state?.context_hash ?? "unknown",
  };
}

function buildWeakFailureResponse(
  request: AIGatewayRequest,
  provider: GatewayDocumentProvider,
  diagnostics: GatewayDiagnostic[],
  failures: FailedPrecondition[],
  appliedSpanIds: string[]
): WeakResolutionFailure {
  const response = createGateway409({
    reason: failures[0]?.reason ?? "hash_mismatch",
    serverFrontierTag: provider.getFrontierTag(),
    failedPreconditions: failures,
    message:
      failures.length > 0
        ? `Weak precondition failed for ${failures[0]?.span_id ?? "unknown"}`
        : "Weak precondition recovery failed",
    requestId: request.request_id,
    clientRequestId: request.client_request_id,
    policyContext: request.policy_context,
  });
  return { ok: false, response, diagnostics, appliedSpanIds };
}

type WeakRecoveryAttempt =
  | {
      ok: true;
      action: "relocate" | "trim_range" | "skip";
      updatedSpanId?: string;
      recovery?: WeakRecovery;
      trimming?: TrimmingRecord;
      retargeting?: RetargetingRecord;
      diagnostics: GatewayDiagnostic[];
    }
  | {
      ok: false;
      action: "relocate" | "trim_range" | "skip";
      diagnostics: GatewayDiagnostic[];
    };

function applyWeakRecovery(params: {
  request: AIGatewayRequest;
  policy: AiTargetingPolicyV1;
  provider: GatewayDocumentProvider;
  precondition: WeakTargetPreconditionV1;
  spanState: SpanState | null;
  failure: FailedPrecondition;
}): WeakRecoveryAttempt {
  const { request, policy, provider, precondition, spanState } = params;
  switch (precondition.on_mismatch) {
    case "skip":
      return {
        ok: true,
        action: "skip",
        diagnostics: [],
        recovery: {
          span_id: precondition.span_id ?? "unknown",
          recovery_action: "skip",
          original_block_id: precondition.block_id,
        },
      };
    case "trim_range":
      return applyTrimRecovery({
        request,
        policy,
        precondition,
        spanState,
      });
    case "relocate":
      return applyRelocateRecovery({
        request,
        policy,
        provider,
        precondition,
      });
    default:
      return {
        ok: false,
        action: "skip",
        diagnostics: [
          {
            severity: "error",
            kind: "ai_targeting_invalid_recovery",
            detail: "Unknown weak recovery action.",
            stage: "precondition",
            code: "AI_WEAK_RECOVERY_INVALID",
          },
        ],
      };
  }
}

function applyTrimRecovery(params: {
  request: AIGatewayRequest;
  policy: AiTargetingPolicyV1;
  precondition: WeakTargetPreconditionV1;
  spanState: SpanState | null;
}): WeakRecoveryAttempt {
  const { request, policy, precondition, spanState } = params;
  if (!policy.allow_auto_trim || !request.targeting?.allow_trim) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_disallowed",
          detail: "Auto-trim is not allowed by policy or request.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_DISALLOWED",
        },
      ],
    };
  }
  if (!precondition.range || !precondition.range.end) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_unsupported",
          detail: "Trim recovery requires a full range.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_UNSUPPORTED",
        },
      ],
    };
  }
  if (!spanState || spanState.span_start === undefined || spanState.span_end === undefined) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_unresolved",
          detail: "Unable to resolve current span range for trimming.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_UNRESOLVED",
        },
      ],
    };
  }

  const resolvedRange = resolveRangeOffsets(precondition.range, spanState.block_id);
  if (!resolvedRange) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_unresolved",
          detail: "Unable to resolve precondition range anchors.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_UNRESOLVED",
        },
      ],
    };
  }

  const intersectionStart = Math.max(resolvedRange.start, spanState.span_start);
  const intersectionEnd = Math.min(resolvedRange.end, spanState.span_end);
  if (intersectionEnd <= intersectionStart) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_empty",
          detail: "Trimmed range was empty.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_EMPTY",
        },
      ],
    };
  }

  const originalLength = Math.max(0, resolvedRange.end - resolvedRange.start);
  const trimmedLength = Math.max(0, intersectionEnd - intersectionStart);
  const preservedRatio = originalLength > 0 ? trimmedLength / originalLength : 0;
  if (trimmedLength === 0 || preservedRatio < policy.min_preserved_ratio) {
    return {
      ok: false,
      action: "trim_range",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_trim_ratio",
          detail: "Trimmed range does not meet preserved ratio threshold.",
          stage: "targeting",
          code: "AI_TARGETING_TRIM_RATIO",
        },
      ],
    };
  }

  const requestId = request.request_id ?? request.client_request_id ?? "unknown";
  const updatedSpanId = buildSelectionSpanId(
    requestId,
    spanState.block_id,
    intersectionStart,
    intersectionEnd
  );
  const trimmedRange = buildRange(spanState.block_id, intersectionStart, intersectionEnd);

  return {
    ok: true,
    action: "trim_range",
    updatedSpanId,
    diagnostics: [],
    recovery: {
      span_id: precondition.span_id ?? "unknown",
      recovery_action: "trim_range",
      original_range: precondition.range,
      trimmed_range: trimmedRange ?? undefined,
    },
    trimming: {
      span_id: precondition.span_id ?? "unknown",
      original_length: originalLength,
      trimmed_length: trimmedLength,
      preserved_ratio: preservedRatio,
    },
  };
}

function applyRelocateRecovery(params: {
  request: AIGatewayRequest;
  policy: AiTargetingPolicyV1;
  provider: GatewayDocumentProvider;
  precondition: WeakTargetPreconditionV1;
}): WeakRecoveryAttempt {
  const { request, policy, provider, precondition } = params;
  if (!policy.allow_auto_retarget || !request.targeting?.auto_retarget) {
    return {
      ok: false,
      action: "relocate",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_disallowed",
          detail: "Auto-retargeting is not allowed by policy or request.",
          stage: "targeting",
          code: "AI_TARGETING_RELOCATE_DISALLOWED",
        },
      ],
    };
  }
  const relocatePolicy = request.targeting?.relocate_policy ?? policy.default_relocate_policy;
  if (!policy.allowed_relocate_policies.includes(relocatePolicy)) {
    return {
      ok: false,
      action: "relocate",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_disallowed",
          detail: "Relocation policy is not allowed.",
          stage: "targeting",
          code: "AI_TARGETING_RELOCATE_DISALLOWED",
        },
      ],
    };
  }
  if (relocatePolicy === "exact_span_only") {
    return {
      ok: false,
      action: "relocate",
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_disallowed",
          detail: "Relocation is disabled for exact_span_only.",
          stage: "targeting",
          code: "AI_TARGETING_RELOCATE_DISALLOWED",
        },
      ],
    };
  }

  const candidateResult = findRelocationCandidate(provider, precondition, policy, relocatePolicy);
  if (!candidateResult.ok) {
    return {
      ok: false,
      action: "relocate",
      diagnostics: candidateResult.diagnostics,
    };
  }

  return {
    ok: true,
    action: "relocate",
    updatedSpanId: candidateResult.candidate.span_id,
    diagnostics: [],
    recovery: {
      span_id: precondition.span_id ?? "unknown",
      recovery_action: "relocate",
      original_block_id: precondition.block_id,
      resolved_block_id: candidateResult.candidate.block_id,
      block_distance: candidateResult.block_distance,
      intra_block_distance: candidateResult.intra_block_distance,
    },
    retargeting: {
      requested_span_id: precondition.span_id ?? "unknown",
      resolved_span_id: candidateResult.candidate.span_id,
      match_vector: candidateResult.match_vector,
    },
  };
}

type RelocationCandidateResult =
  | {
      ok: true;
      candidate: SpanState;
      match_vector: MatchVector;
      block_distance: number;
      intra_block_distance: number;
    }
  | {
      ok: false;
      diagnostics: GatewayDiagnostic[];
    };

type RankedCandidate = {
  spanState: SpanState;
  vector: MatchVector;
  blockDistance: number;
  intraBlockDistance: number;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Relocation scoring requires multiple gating rules.
function findRelocationCandidate(
  provider: GatewayDocumentProvider,
  precondition: WeakTargetPreconditionV1,
  policy: AiTargetingPolicyV1,
  relocatePolicy: TargetingRelocatePolicy
): RelocationCandidateResult {
  const allSpans = provider.getAllSpanStates?.();
  if (!allSpans) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_unavailable",
          detail: "Relocation requires a full span index.",
          stage: "targeting",
          code: "AI_TARGETING_RELOCATE_UNAVAILABLE",
        },
      ],
    };
  }

  const origin = provider.getSpanState(precondition.span_id ?? "");
  const originBlockId = precondition.block_id;
  const originIndex = origin?.block_index;
  const originRangeStart = precondition.range
    ? resolveRangeOffsets(precondition.range, originBlockId)?.start
    : origin?.span_start;
  const maxDistance = Math.min(
    precondition.max_relocate_distance ?? policy.max_relocate_distance,
    policy.max_relocate_distance
  );
  const softSignalCount = countSoftSignals(precondition);

  const candidates: RankedCandidate[] = [];

  const spanStates = [...allSpans.values()].sort((a, b) => a.span_id.localeCompare(b.span_id));
  for (const spanState of spanStates) {
    if (!spanState.span_start && spanState.span_start !== 0) {
      continue;
    }
    if (!spanState.span_end && spanState.span_end !== 0) {
      continue;
    }
    if (!matchesRelocationScope(spanState, origin, relocatePolicy, policy)) {
      continue;
    }
    if (!matchesHardSignals(precondition, spanState)) {
      continue;
    }

    const vector = buildMatchVector(precondition, spanState);
    if (softSignalCount > 0 && countSoftMatches(vector) < policy.min_soft_matches_for_retarget) {
      continue;
    }
    const blockDistance =
      originIndex !== undefined && spanState.block_index !== undefined
        ? Math.abs(spanState.block_index - originIndex)
        : 0;
    const intraBlockDistance =
      originRangeStart !== undefined && spanState.block_id === originBlockId
        ? Math.abs(spanState.span_start - originRangeStart)
        : 0;

    if (
      spanState.block_id === originBlockId &&
      originRangeStart !== undefined &&
      intraBlockDistance > maxDistance
    ) {
      continue;
    }

    candidates.push({
      spanState,
      vector,
      blockDistance,
      intraBlockDistance,
    });
  }

  const ranked = rankCandidates(candidates).slice(0, policy.max_candidates);
  if (ranked.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_failed",
          detail: "No relocation candidates matched.",
          stage: "targeting",
          code: "AI_WEAK_RECOVERY_FAILED",
        },
      ],
    };
  }

  const first = ranked[0];
  const second = ranked[1];
  if (second && isTie(first, second)) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          kind: "ai_targeting_relocate_ambiguous",
          detail: "Relocation candidates were ambiguous.",
          stage: "targeting",
          code: "AI_TARGETING_AMBIGUOUS",
        },
      ],
    };
  }

  return {
    ok: true,
    candidate: first.spanState,
    match_vector: first.vector,
    block_distance: first.blockDistance,
    intra_block_distance: first.intraBlockDistance,
  };
}

function matchesRelocationScope(
  candidate: SpanState,
  origin: SpanState | null,
  policy: TargetingRelocatePolicy,
  targetingPolicy: AiTargetingPolicyV1
): boolean {
  if (!origin) {
    return policy === "document_scan";
  }
  if (policy === "same_block") {
    return candidate.block_id === origin.block_id;
  }
  if (policy === "sibling_blocks") {
    if (!origin.parent_path || !candidate.parent_path) {
      return candidate.block_id === origin.block_id;
    }
    if (origin.parent_path !== candidate.parent_path) {
      return false;
    }
    if (origin.block_index === undefined || candidate.block_index === undefined) {
      return candidate.block_id === origin.block_id;
    }
    return Math.abs(candidate.block_index - origin.block_index) <= targetingPolicy.max_block_radius;
  }
  if (policy === "document_scan") {
    return true;
  }
  return candidate.block_id === origin.block_id;
}

function matchesHardSignals(precondition: WeakTargetPreconditionV1, spanState: SpanState): boolean {
  const hard = precondition.hard ?? {};
  if (hard.context_hash && spanState.context_hash !== hard.context_hash) {
    return false;
  }
  if (hard.window_hash && spanState.window_hash !== hard.window_hash) {
    return false;
  }
  if (hard.structure_hash && spanState.structure_hash !== hard.structure_hash) {
    return false;
  }
  return true;
}

function buildMatchVector(
  precondition: WeakTargetPreconditionV1,
  spanState: SpanState
): MatchVector {
  const hard = precondition.hard ?? {};
  const soft = precondition.soft ?? {};
  return [
    hard.context_hash ? spanState.context_hash === hard.context_hash : false,
    hard.window_hash ? spanState.window_hash === hard.window_hash : false,
    hard.structure_hash ? spanState.structure_hash === hard.structure_hash : false,
    soft.neighbor_hash?.left ? spanState.neighbor_hash?.left === soft.neighbor_hash.left : false,
    soft.neighbor_hash?.right ? spanState.neighbor_hash?.right === soft.neighbor_hash.right : false,
    soft.window_hash ? spanState.window_hash === soft.window_hash : false,
    soft.structure_hash ? spanState.structure_hash === soft.structure_hash : false,
  ];
}

function countSoftSignals(precondition: WeakTargetPreconditionV1): number {
  const soft = precondition.soft ?? {};
  let count = 0;
  if (soft.neighbor_hash?.left) {
    count += 1;
  }
  if (soft.neighbor_hash?.right) {
    count += 1;
  }
  if (soft.window_hash) {
    count += 1;
  }
  if (soft.structure_hash) {
    count += 1;
  }
  return count;
}

function countSoftMatches(vector: MatchVector): number {
  return vector.slice(3).reduce((sum, value) => sum + (value ? 1 : 0), 0);
}

function rankCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((a, b) => {
    const vectorOrder = compareMatchVectors(a.vector, b.vector);
    if (vectorOrder !== 0) {
      return vectorOrder;
    }
    if (a.blockDistance !== b.blockDistance) {
      return a.blockDistance - b.blockDistance;
    }
    if (a.intraBlockDistance !== b.intraBlockDistance) {
      return a.intraBlockDistance - b.intraBlockDistance;
    }
    return a.spanState.span_id.localeCompare(b.spanState.span_id);
  });
}

function isTie(first: RankedCandidate, second: RankedCandidate): boolean {
  return (
    compareMatchVectors(first.vector, second.vector) === 0 &&
    first.blockDistance === second.blockDistance &&
    first.intraBlockDistance === second.intraBlockDistance
  );
}

function resolveRangeOffsets(
  range: TargetRange,
  blockId: string
): { start: number; end: number } | null {
  const startDecoded = absoluteFromAnchor(range.start.anchor);
  const endDecoded = range.end ? absoluteFromAnchor(range.end.anchor) : null;
  if (!startDecoded || !endDecoded) {
    return null;
  }
  if (startDecoded.blockId !== blockId || endDecoded.blockId !== blockId) {
    return null;
  }
  return { start: startDecoded.offset, end: endDecoded.offset };
}

function buildRange(blockId: string, start: number, end: number): TargetRange | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const startAnchor = anchorFromAbsolute(blockId, start, "after");
  const endAnchor = anchorFromAbsolute(blockId, end, "before");
  return {
    start: { anchor: startAnchor, bias: "right" },
    end: { anchor: endAnchor, bias: "left" },
  };
}

function buildSelectionSpanId(
  requestId: string,
  blockId: string,
  start: number,
  end: number
): string {
  return `selection:${requestId}:${blockId}:${start}:${end}`;
}
