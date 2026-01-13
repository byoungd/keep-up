/**
 * LFCC v0.9 RC - AI Gateway Conflict Safety
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md Section C
 *
 * Implements pessimistic locking via precondition checks:
 * - Frontier tag matching
 * - Context hash verification
 * - Target verification status
 */

import { createGateway409 } from "./envelope.js";
import type {
  AIGateway409Response,
  AIGatewayRequest,
  ConflictReason,
  FailedPrecondition,
  FrontierComparison,
  GatewayDocumentProvider,
  SpanState,
  TargetSpan,
} from "./types.js";

// ============================================================================
// Conflict Check Result
// ============================================================================

/** Result of conflict checking */
export type ConflictCheckResult = { ok: true } | { ok: false; response: AIGateway409Response };

// ============================================================================
// Individual Checks
// ============================================================================

/**
 * Check frontier compatibility
 */
export function checkFrontier(
  clientFrontier: string,
  provider: GatewayDocumentProvider
): { ok: true } | { ok: false; comparison: FrontierComparison } {
  const serverFrontier = provider.getFrontierTag();
  const comparison = provider.compareFrontiers(clientFrontier, serverFrontier);

  if (comparison === "equal" || comparison === "behind") {
    // Client is at or behind server - acceptable for read-then-write
    return { ok: true };
  }

  // Client is ahead or diverged - conflict
  return { ok: false, comparison };
}

/**
 * Check a single span precondition
 */
export function checkSpanPrecondition(
  target: TargetSpan,
  spanState: SpanState | null
): FailedPrecondition | null {
  // Span missing
  if (spanState === null) {
    return {
      span_id: target.span_id,
      annotation_id: target.annotation_id,
      reason: "span_missing",
      detail: "Target span does not exist",
    };
  }

  // Annotation ID mismatch
  if (spanState.annotation_id !== target.annotation_id) {
    return {
      span_id: target.span_id,
      annotation_id: target.annotation_id,
      reason: "span_missing",
      detail: `Span belongs to different annotation: ${spanState.annotation_id}`,
    };
  }

  // Unverified target
  if (!spanState.is_verified) {
    return {
      span_id: target.span_id,
      annotation_id: target.annotation_id,
      reason: "unverified_target",
      detail: "Target span is in unverified state",
    };
  }

  // Hash mismatch
  if (spanState.context_hash !== target.if_match_context_hash) {
    return {
      span_id: target.span_id,
      annotation_id: target.annotation_id,
      reason: "hash_mismatch",
      expected_hash: target.if_match_context_hash,
      actual_hash: spanState.context_hash,
      detail: "Context hash does not match",
    };
  }

  return null;
}

/**
 * Check all span preconditions
 */
export function checkAllPreconditions(
  targets: TargetSpan[],
  provider: GatewayDocumentProvider
): FailedPrecondition[] {
  const failures: FailedPrecondition[] = [];
  const spanIds = targets.map((t) => t.span_id);
  const spanStates = provider.getSpanStates(spanIds);

  for (const target of targets) {
    const state = spanStates.get(target.span_id) ?? null;
    const failure = checkSpanPrecondition(target, state);
    if (failure) {
      failures.push(failure);
    }
  }

  return failures;
}

// ============================================================================
// Main Conflict Check
// ============================================================================

/**
 * Perform full conflict safety check
 *
 * Checks in order:
 * 1. Document exists
 * 2. Frontier compatibility
 * 3. All span preconditions (hash match, verified status)
 *
 * Returns 409 response if any check fails.
 */
export function checkConflicts(
  request: AIGatewayRequest,
  provider: GatewayDocumentProvider
): ConflictCheckResult {
  const serverFrontier = provider.getFrontierTag();
  const requestId = request.request_id ?? request.client_request_id;

  // Check document exists
  if (!provider.documentExists(request.doc_id)) {
    return {
      ok: false,
      response: createGateway409({
        reason: "frontier_mismatch",
        serverFrontierTag: serverFrontier,
        failedPreconditions: [],
        message: `Document not found: ${request.doc_id}`,
        requestId,
        clientRequestId: request.client_request_id,
      }),
    };
  }

  // Check frontier
  const frontierCheck = checkFrontier(request.doc_frontier_tag, provider);
  if (!frontierCheck.ok) {
    return {
      ok: false,
      response: createGateway409({
        reason: "frontier_mismatch",
        serverFrontierTag: serverFrontier,
        failedPreconditions: [],
        message: `Frontier ${frontierCheck.comparison}: client frontier is stale or diverged`,
        requestId,
        clientRequestId: request.client_request_id,
      }),
    };
  }

  // Check all preconditions
  const failures = checkAllPreconditions(request.target_spans, provider);
  if (failures.length > 0) {
    // Determine primary reason from failures
    const primaryReason = determinePrimaryReason(failures);

    return {
      ok: false,
      response: createGateway409({
        reason: primaryReason,
        serverFrontierTag: serverFrontier,
        failedPreconditions: failures,
        message: formatConflictMessage(failures),
        requestId,
        clientRequestId: request.client_request_id,
      }),
    };
  }

  return { ok: true };
}

/**
 * Determine primary conflict reason from failures
 */
function determinePrimaryReason(failures: FailedPrecondition[]): ConflictReason {
  // Priority: unverified > hash_mismatch > span_missing
  if (failures.some((f) => f.reason === "unverified_target")) {
    return "unverified_target";
  }
  if (failures.some((f) => f.reason === "hash_mismatch")) {
    return "hash_mismatch";
  }
  return "span_missing";
}

/**
 * Format human-readable conflict message
 */
function formatConflictMessage(failures: FailedPrecondition[]): string {
  if (failures.length === 1) {
    const f = failures[0];
    switch (f.reason) {
      case "span_missing":
        return `Span ${f.span_id} not found`;
      case "hash_mismatch":
        return `Span ${f.span_id} content has changed`;
      case "unverified_target":
        return `Span ${f.span_id} is in unverified state`;
      default:
        return `Precondition failed for span ${f.span_id}`;
    }
  }

  const counts: Record<string, number> = {};
  for (const f of failures) {
    counts[f.reason] = (counts[f.reason] ?? 0) + 1;
  }

  const parts: string[] = [];
  if (counts.unverified_target) {
    parts.push(`${counts.unverified_target} unverified`);
  }
  if (counts.hash_mismatch) {
    parts.push(`${counts.hash_mismatch} hash mismatch`);
  }
  if (counts.span_missing) {
    parts.push(`${counts.span_missing} missing`);
  }

  return `${failures.length} precondition failures: ${parts.join(", ")}`;
}

// ============================================================================
// Conflict Check Middleware Factory
// ============================================================================

/** Middleware function type */
export type ConflictMiddleware = (request: AIGatewayRequest) => ConflictCheckResult;

/**
 * Create conflict check middleware
 */
export function createConflictMiddleware(provider: GatewayDocumentProvider): ConflictMiddleware {
  return (request: AIGatewayRequest) => checkConflicts(request, provider);
}

// ============================================================================
// Mock Document Provider (for testing)
// ============================================================================

/** Mock provider configuration */
export type MockProviderConfig = {
  frontier: string;
  spans: Map<string, SpanState>;
  documents: Set<string>;
};

/**
 * Create a mock document provider for testing
 */
export function createMockDocumentProvider(config: MockProviderConfig): GatewayDocumentProvider {
  return {
    getFrontierTag(): string {
      return config.frontier;
    },

    compareFrontiers(clientFrontier: string, serverFrontier: string): FrontierComparison {
      // Simple string comparison for mock
      if (clientFrontier === serverFrontier) {
        return "equal";
      }
      // Assume lexicographic ordering for mock
      if (clientFrontier < serverFrontier) {
        return "behind";
      }
      if (clientFrontier > serverFrontier) {
        return "ahead";
      }
      return "diverged";
    },

    getSpanState(spanId: string): SpanState | null {
      return config.spans.get(spanId) ?? null;
    },

    getSpanStates(spanIds: string[]): Map<string, SpanState> {
      const result = new Map<string, SpanState>();
      for (const id of spanIds) {
        const state = config.spans.get(id);
        if (state) {
          result.set(id, state);
        }
      }
      return result;
    },

    documentExists(docId: string): boolean {
      return config.documents.has(docId);
    },
  };
}
