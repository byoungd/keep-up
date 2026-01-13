/**
 * LFCC v0.9 RC - AI Gateway Client Retry Playbook
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md Section D
 *
 * Retry strategy: Rebase → Relocate → Retry/Abort
 *
 * Relocation levels:
 * - Level 1: Exact context hash match only (default)
 * - Level 2: Fuzzy text matching (requires manifest opt-in)
 * - Level 3: Semantic matching (requires manifest opt-in)
 */

import type {
  AIGateway409Response,
  AIGatewayRequest,
  ConflictReason,
  DocFrontierTag,
  FailedPrecondition,
  RelocationLevel,
  RelocationResult,
  RetryPolicy,
  RetryState,
  SpanState,
  TargetSpan,
} from "./types.js";

/** Initial retry state */
export const INITIAL_RETRY_STATE: RetryState = {
  attempt: 0,
  relocated_spans: new Map(),
  should_continue: true,
  next_backoff_ms: 100,
};

/** Create initial retry state with policy */
export function createRetryState(policy: RetryPolicy): RetryState {
  return {
    attempt: 0,
    relocated_spans: new Map(),
    should_continue: true,
    next_backoff_ms: policy.backoff_base_ms,
  };
}

/** Update retry state after a 409 response */
export function updateRetryState(
  state: RetryState,
  conflict: AIGateway409Response,
  policy: RetryPolicy
): RetryState {
  const nextAttempt = state.attempt + 1;
  const shouldContinue = nextAttempt < policy.max_retries && isRetryable(conflict.reason);
  const nextBackoff = Math.min(
    state.next_backoff_ms * policy.backoff_multiplier,
    policy.max_backoff_ms
  );

  return {
    attempt: nextAttempt,
    last_conflict: conflict,
    relocated_spans: new Map(state.relocated_spans),
    should_continue: shouldContinue,
    next_backoff_ms: nextBackoff,
  };
}

/** Check if a conflict reason is retryable */
export function isRetryable(reason: ConflictReason): boolean {
  switch (reason) {
    case "frontier_mismatch":
    case "hash_mismatch":
    case "unverified_target":
    case "span_missing":
      return true;
    case "schema_reject":
    case "sanitization_reject":
      return false;
    default:
      return false;
  }
}

/** Rebase result */
export type RebaseResult = {
  newFrontier: DocFrontierTag;
  updatedSpans: Map<string, SpanState>;
  success: boolean;
};

/** Rebase provider interface */
export interface RebaseProvider {
  fetchLatest(docId: string, spanIds: string[]): Promise<RebaseResult>;
}

/** Perform rebase - fetch latest document state */
export async function performRebase(
  docId: string,
  targetSpans: TargetSpan[],
  provider: RebaseProvider
): Promise<RebaseResult> {
  const spanIds = targetSpans.map((t) => t.span_id);
  return provider.fetchLatest(docId, spanIds);
}

/** Relocation provider interface */
export interface RelocationProvider {
  findByContextHash(docId: string, contextHash: string): SpanState | null;
  findByFuzzyText?(docId: string, text: string, threshold: number): SpanState | null;
  findBySemantic?(docId: string, text: string, embedding?: number[]): SpanState | null;
}

/** Attempt to relocate a failed span */
export function relocateSpan(
  failure: FailedPrecondition,
  originalText: string,
  level: RelocationLevel,
  provider: RelocationProvider,
  docId: string
): RelocationResult {
  // Level 1: Exact context hash match
  if (failure.expected_hash) {
    const found = provider.findByContextHash(docId, failure.expected_hash);
    if (found) {
      return {
        success: true,
        new_span_id: found.span_id,
        new_context_hash: found.context_hash,
        method: "exact_hash",
      };
    }
  }

  // Level 2: Fuzzy text matching (requires opt-in)
  if (level >= 2 && provider.findByFuzzyText) {
    const found = provider.findByFuzzyText(docId, originalText, 0.8);
    if (found) {
      return {
        success: true,
        new_span_id: found.span_id,
        new_context_hash: found.context_hash,
        method: "fuzzy_text",
      };
    }
  }

  // Level 3: Semantic matching (requires opt-in)
  if (level >= 3 && provider.findBySemantic) {
    const found = provider.findBySemantic(docId, originalText);
    if (found) {
      return {
        success: true,
        new_span_id: found.span_id,
        new_context_hash: found.context_hash,
        method: "semantic",
      };
    }
  }

  return { success: false };
}

/** Attempt to relocate all failed spans */
export function relocateAllSpans(
  failures: FailedPrecondition[],
  originalTexts: Map<string, string>,
  level: RelocationLevel,
  provider: RelocationProvider,
  docId: string
): Map<string, RelocationResult> {
  const results = new Map<string, RelocationResult>();

  for (const failure of failures) {
    if (failure.reason !== "hash_mismatch" && failure.reason !== "span_missing") {
      results.set(failure.span_id, { success: false });
      continue;
    }
    const originalText = originalTexts.get(failure.span_id) ?? "";
    const result = relocateSpan(failure, originalText, level, provider, docId);
    results.set(failure.span_id, result);
  }

  return results;
}

/** Update request with rebased frontier and relocated spans */
export function updateRequestAfterRebase(
  request: AIGatewayRequest,
  rebaseResult: RebaseResult,
  relocations: Map<string, RelocationResult>
): AIGatewayRequest {
  const updatedTargets: TargetSpan[] = [];

  for (const target of request.target_spans) {
    const relocation = relocations.get(target.span_id);
    const updatedState = rebaseResult.updatedSpans.get(target.span_id);

    if (relocation?.success && relocation.new_span_id && relocation.new_context_hash) {
      updatedTargets.push({
        annotation_id: target.annotation_id,
        span_id: relocation.new_span_id,
        if_match_context_hash: relocation.new_context_hash,
      });
    } else if (updatedState) {
      updatedTargets.push({
        annotation_id: target.annotation_id,
        span_id: target.span_id,
        if_match_context_hash: updatedState.context_hash,
      });
    } else {
      updatedTargets.push(target);
    }
  }

  return { ...request, doc_frontier_tag: rebaseResult.newFrontier, target_spans: updatedTargets };
}

/** Retry loop result */
export type RetryLoopResult =
  | { success: true; request: AIGatewayRequest; attempts: number }
  | {
      success: false;
      reason: "max_retries" | "not_retryable" | "relocation_failed";
      lastConflict: AIGateway409Response;
      attempts: number;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Execute retry loop with rebase and relocation */
export async function executeRetryLoop(
  initialRequest: AIGatewayRequest,
  initialConflict: AIGateway409Response,
  policy: RetryPolicy,
  rebaseProvider: RebaseProvider,
  relocationProvider: RelocationProvider,
  originalTexts: Map<string, string>
): Promise<RetryLoopResult> {
  let state = createRetryState(policy);
  let request = initialRequest;
  const conflict = initialConflict;

  while (state.should_continue) {
    state = updateRetryState(state, conflict, policy);
    if (!state.should_continue) {
      break;
    }

    await sleep(state.next_backoff_ms);

    const rebaseResult = await performRebase(request.doc_id, request.target_spans, rebaseProvider);
    if (!rebaseResult.success) {
      return {
        success: false,
        reason: "relocation_failed",
        lastConflict: conflict,
        attempts: state.attempt,
      };
    }

    const relocations = relocateAllSpans(
      conflict.failed_preconditions,
      originalTexts,
      policy.relocation_level,
      relocationProvider,
      request.doc_id
    );
    const needsRelocation = conflict.failed_preconditions.filter(
      (f) => f.reason === "hash_mismatch" || f.reason === "span_missing"
    );
    const allRelocated = needsRelocation.every(
      (f) => relocations.get(f.span_id)?.success || rebaseResult.updatedSpans.has(f.span_id)
    );

    if (!allRelocated && needsRelocation.length > 0) {
      return {
        success: false,
        reason: "relocation_failed",
        lastConflict: conflict,
        attempts: state.attempt,
      };
    }

    request = updateRequestAfterRebase(request, rebaseResult, relocations);
    return { success: true, request, attempts: state.attempt };
  }

  return {
    success: false,
    reason: isRetryable(conflict.reason) ? "max_retries" : "not_retryable",
    lastConflict: conflict,
    attempts: state.attempt,
  };
}

/** Create a strict retry policy (Level 1 only) */
export function createStrictRetryPolicy(maxRetries = 3): RetryPolicy {
  return {
    max_retries: maxRetries,
    relocation_level: 1,
    backoff_base_ms: 100,
    backoff_multiplier: 2,
    max_backoff_ms: 5000,
  };
}

/** Create a lenient retry policy (Level 2 fuzzy matching) */
export function createLenientRetryPolicy(maxRetries = 5): RetryPolicy {
  return {
    max_retries: maxRetries,
    relocation_level: 2,
    backoff_base_ms: 50,
    backoff_multiplier: 1.5,
    max_backoff_ms: 3000,
  };
}

/** Create an aggressive retry policy (Level 3 semantic matching) */
export function createAggressiveRetryPolicy(maxRetries = 7): RetryPolicy {
  return {
    max_retries: maxRetries,
    relocation_level: 3,
    backoff_base_ms: 25,
    backoff_multiplier: 1.5,
    max_backoff_ms: 2000,
  };
}
