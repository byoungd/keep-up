# AI Targeting Resilience (v0.9.4) - Engineering Addendum

**Applies to:** LFCC v0.9.4 (optional extension)  
**Last updated:** 2026-01-22  
**Audience:** AI platform engineers, gateway maintainers, SDK developers, client integrators.  
**Source of truth:** LFCC v0.9 RC §11 (AI Gateway) + v0.9.4 Targeting Resilience Proposal.

---

## 0. Goals

1. Reduce AI agent targeting failures and retry loops without weakening determinism or SEC.
2. Provide multi-signal preconditions for resilient span targeting.
3. Define deterministic relocation and auto-recovery algorithms.
4. Standardize failure diagnostics for faster agent recovery.

---

## 1. Compatibility and Negotiation

AI targeting resilience is **opt-in** and requires explicit policy agreement.

**AT-NEG-001:** Targeting v1 features MUST be gated by `capabilities.ai_targeting_v1 = true`.  
**AT-NEG-002:** If targeting v1 is not negotiated, implementations MUST fall back to v0.9 preconditions.

Recommended capability flags:
- `ai_targeting_v1` — Core targeting resilience
- `ai_layered_preconditions` — Strong/weak constraint separation
- `ai_delta_reads` — Incremental refresh responses
- `ai_auto_trim` — Conflict auto-trimming

---

## 2. Policy Manifest Extension

### 2.1 AiTargetingPolicyV1 (Normative)

Add to `ai_native_policy.targeting`:

```ts
export type AiTargetingPolicyV1 = {
  version: "v1";
  enabled: boolean;
  
  // Multi-signal preconditions
  allow_soft_preconditions: boolean;
  
  // Relocation
  allow_auto_retarget: boolean;
  allowed_relocate_policies: Array<
    "exact_span_only" | "same_block" | "sibling_blocks" | "document_scan"
  >;
  default_relocate_policy: "exact_span_only" | "same_block" | "sibling_blocks" | "document_scan";
  max_candidates: number;
  max_block_radius: number;
  
  // Window sizes for hash computation
  window_size: { left: number; right: number };
  neighbor_window: { left: number; right: number };
  
  // Relocation distance limit
  max_relocate_distance: number;  // >= 0, UTF-16 code units
  
  // Retarget thresholds
  min_soft_matches_for_retarget: number;
  require_span_id: boolean;
  
  // Layered preconditions (§13)
  allow_layered_preconditions: boolean;
  max_weak_preconditions: number;
  
  // Auto-trimming (§15)
  allow_auto_trim: boolean;
  min_preserved_ratio: number;
  trim_diagnostics: boolean;
  
  // Delta reads (§14)
  allow_delta_reads: boolean;
  
  // Rate limiting (§19)
  rate_limit?: {
    requests_per_minute: number;
    burst_size: number;
    per_agent: boolean;
  };
  
  // Diagnostics
  max_diagnostics_bytes: number;
};
```

### 2.2 Negotiation Rules (Normative)

| Field | Rule |
|-------|------|
| `enabled` | AND |
| `allow_soft_preconditions` | AND |
| `allow_auto_retarget` | AND |
| `allowed_relocate_policies` | intersection |
| `default_relocate_policy` | most restrictive in intersection |
| `max_candidates` | min |
| `max_block_radius` | min |
| `max_relocate_distance` | min |
| `window_size.*` | min per side |
| `neighbor_window.*` | min per side |
| `min_soft_matches_for_retarget` | max (stricter) |
| `require_span_id` | OR (stricter) |
| `allow_layered_preconditions` | AND |
| `allow_auto_trim` | AND |
| `min_preserved_ratio` | max (stricter) |
| `allow_delta_reads` | AND |
| `max_diagnostics_bytes` | min |

---

## 3. Hash Computation Algorithms

### 3.1 Window Hash (LFCC_SPAN_WINDOW_V1)

```ts
function computeWindowHash(
  blockId: string,
  spanStart: number,
  spanEnd: number,
  blockText: string,
  windowSize: { left: number; right: number }
): string {
  const leftContext = blockText.slice(
    Math.max(0, spanStart - windowSize.left),
    spanStart
  );
  const rightContext = blockText.slice(
    spanEnd,
    Math.min(blockText.length, spanEnd + windowSize.right)
  );
  
  const canonical = [
    "LFCC_SPAN_WINDOW_V1",
    `block_id=${blockId}`,
    `left=${normalizeText(leftContext)}`,
    `right=${normalizeText(rightContext)}`
  ].join("\n");
  
  return sha256Hex(canonical);
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
```

### 3.2 Neighbor Hash (LFCC_NEIGHBOR_V1)

```ts
function computeNeighborHash(
  blockId: string,
  spanStart: number,
  spanEnd: number,
  blockText: string,
  neighborWindow: { left: number; right: number }
): { left?: string; right?: string } {
  const leftNeighbor = blockText.slice(
    Math.max(0, spanStart - neighborWindow.left),
    spanStart
  );
  const rightNeighbor = blockText.slice(
    spanEnd,
    Math.min(blockText.length, spanEnd + neighborWindow.right)
  );
  
  const result: { left?: string; right?: string } = {};
  
  if (leftNeighbor.length > 0) {
    result.left = sha256Hex([
      "LFCC_NEIGHBOR_V1",
      `block_id=${blockId}`,
      `side=left`,
      `text=${normalizeText(leftNeighbor)}`
    ].join("\n"));
  }
  
  if (rightNeighbor.length > 0) {
    result.right = sha256Hex([
      "LFCC_NEIGHBOR_V1",
      `block_id=${blockId}`,
      `side=right`,
      `text=${normalizeText(rightNeighbor)}`
    ].join("\n"));
  }
  
  return result;
}
```

### 3.3 Structure Hash (LFCC_BLOCK_SHAPE_V1)

```ts
function computeStructureHash(
  blockId: string,
  blockType: string,
  parentBlockId: string | null,
  parentPath: string | null
): string {
  const canonical = [
    "LFCC_BLOCK_SHAPE_V1",
    `block_id=${blockId}`,
    `type=${blockType}`,
    `parent_block_id=${parentBlockId ?? "null"}`,
    `parent_path=${parentPath ?? "null"}`
  ].join("\n");
  
  return sha256Hex(canonical);
}
```

---

## 4. Relocation Algorithm

### 4.1 Candidate Generation

```ts
function generateCandidates(
  precondition: AiTargetPreconditionV1,
  policy: AiTargetingPolicyV1,
  relocatePolicy: RelocatePolicy,
  documentState: DocumentState
): SpanCandidate[] {
  const candidates: SpanCandidate[] = [];
  
  switch (relocatePolicy) {
    case "exact_span_only":
      const exact = documentState.getSpan(precondition.span_id);
      if (exact) candidates.push(exact);
      break;
      
    case "same_block":
      candidates.push(...documentState.getSpansInBlock(precondition.block_id));
      break;
      
    case "sibling_blocks":
      for (const blockId of documentState.getSiblingBlocks(
        precondition.block_id,
        policy.max_block_radius
      )) {
        candidates.push(...documentState.getSpansInBlock(blockId));
      }
      break;
      
    case "document_scan":
      candidates.push(...documentState.getAllSpans());
      break;
  }
  
  // Deterministic ordering: sort by span_id
  return candidates
    .slice(0, policy.max_candidates)
    .sort((a, b) => a.span_id.localeCompare(b.span_id));
}
```

### 4.2 Candidate Ranking

```ts
type MatchVector = [
  boolean, // hard.context_hash_match
  boolean, // hard.window_hash_match
  boolean, // hard.structure_hash_match
  boolean, // soft.neighbor_left_match
  boolean, // soft.neighbor_right_match
  boolean, // soft.window_hash_match
  boolean  // soft.structure_hash_match
];

function computeMatchVector(
  candidate: SpanCandidate,
  precondition: AiTargetPreconditionV1
): MatchVector {
  return [
    precondition.hard.context_hash === undefined ||
      candidate.context_hash === precondition.hard.context_hash,
    precondition.hard.window_hash === undefined ||
      candidate.window_hash === precondition.hard.window_hash,
    precondition.hard.structure_hash === undefined ||
      candidate.structure_hash === precondition.hard.structure_hash,
    precondition.soft?.neighbor_hash?.left === undefined ||
      candidate.neighbor_hash?.left === precondition.soft.neighbor_hash.left,
    precondition.soft?.neighbor_hash?.right === undefined ||
      candidate.neighbor_hash?.right === precondition.soft.neighbor_hash.right,
    precondition.soft?.window_hash === undefined ||
      candidate.window_hash === precondition.soft.window_hash,
    precondition.soft?.structure_hash === undefined ||
      candidate.structure_hash === precondition.soft.structure_hash
  ];
}

function rankCandidates(
  candidates: Array<{ candidate: SpanCandidate; vector: MatchVector; distance: number }>
): Array<{ candidate: SpanCandidate; vector: MatchVector; distance: number }> {
  return candidates.sort((a, b) => {
    // 1. Compare match vectors lexicographically (true > false)
    for (let i = 0; i < 7; i++) {
      if (a.vector[i] !== b.vector[i]) {
        return a.vector[i] ? -1 : 1;
      }
    }
    // 2. Tie-break by distance (ascending)
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    // 3. Tie-break by span_id (ascending)
    return a.candidate.span_id.localeCompare(b.candidate.span_id);
  });
}
```

### 4.3 Auto-Retarget Decision

```ts
function shouldAutoRetarget(
  ranked: Array<{ candidate: SpanCandidate; vector: MatchVector }>,
  policy: AiTargetingPolicyV1
): { success: boolean; target?: SpanCandidate; reason?: string } {
  if (!policy.allow_auto_retarget) {
    return { success: false, reason: "auto_retarget_disabled" };
  }
  
  if (ranked.length === 0) {
    return { success: false, reason: "no_candidates" };
  }
  
  const top = ranked[0];
  
  // Check hard signals all match
  if (!top.vector[0] || !top.vector[1] || !top.vector[2]) {
    return { success: false, reason: "hard_signals_mismatch" };
  }
  
  // Count soft matches
  const softMatches = top.vector.slice(3).filter(Boolean).length;
  if (softMatches < policy.min_soft_matches_for_retarget) {
    return { success: false, reason: "insufficient_soft_matches" };
  }
  
  // Check for ties at top rank
  if (ranked.length > 1) {
    const second = ranked[1];
    const isTied = top.vector.every((v, i) => v === second.vector[i]);
    if (isTied) {
      return { success: false, reason: "ambiguous_candidates" };
    }
  }
  
  return { success: true, target: top.candidate };
}
```

---

## 5. Layered Preconditions Processing

### 5.1 Processing Order

```ts
async function processLayeredPreconditions(
  request: AIGatewayRequest,
  policy: AiTargetingPolicyV1
): Promise<PreconditionResult> {
  const { strong, weak } = request.layered_preconditions ?? {
    strong: request.preconditions ?? [],
    weak: []
  };
  
  // 1. Process strong constraints first
  for (const pre of strong) {
    const result = await validatePrecondition(pre, policy);
    if (!result.valid) {
      return {
        success: false,
        error: { code: "AI_PRECONDITION_FAILED", failed: [pre] }
      };
    }
  }
  
  // 2. Process weak constraints with recovery
  const recoveries: WeakRecovery[] = [];
  for (const pre of weak) {
    const result = await validateWeakPrecondition(pre, policy);
    if (!result.valid) {
      const recovery = await attemptRecovery(pre, policy);
      if (!recovery.success) {
        return {
          success: false,
          error: { code: "AI_WEAK_RECOVERY_FAILED", failed: [pre] }
        };
      }
      recoveries.push(recovery);
    }
  }
  
  return { success: true, recoveries };
}
```

### 5.2 Recovery Strategies

```ts
async function attemptRecovery(
  pre: WeakPrecondition,
  policy: AiTargetingPolicyV1
): Promise<WeakRecovery> {
  switch (pre.on_mismatch) {
    case "relocate":
      return await relocateSpan(pre, policy);
      
    case "trim_range":
      return await trimRange(pre, policy);
      
    case "skip":
      return {
        success: true,
        span_id: pre.span_id,
        recovery_action: "skip",
        skipped: true
      };
  }
}

async function trimRange(
  pre: WeakPrecondition,
  policy: AiTargetingPolicyV1
): Promise<WeakRecovery> {
  const current = await getCurrentRange(pre.span_id);
  const original = pre.original_range;
  
  const intersection = computeIntersection(original, current);
  if (!intersection) {
    return { success: false, reason: "no_intersection" };
  }
  
  const preservedRatio = intersection.length / original.length;
  if (preservedRatio < policy.min_preserved_ratio) {
    return { 
      success: false, 
      reason: "below_threshold",
      preserved_ratio: preservedRatio 
    };
  }
  
  return {
    success: true,
    span_id: pre.span_id,
    recovery_action: "trim_range",
    original_range: original,
    trimmed_range: intersection,
    preserved_ratio: preservedRatio
  };
}
```

---

## 6. Delta Response Generation

```ts
function generateDeltaResponse(
  fromFrontier: DocFrontier,
  toFrontier: DocFrontier,
  appliedOps: Operation[],
  policy: AiTargetingPolicyV1,
  deltaScope: "affected_only" | "affected_with_neighbors"
): DeltaResponse {
  const affectedSpans = new Set<string>();
  const affectedBlocks = new Set<string>();
  
  // Collect affected spans from operations
  for (const op of appliedOps) {
    for (const target of op.targets) {
      affectedSpans.add(target.span_id);
      affectedBlocks.add(target.block_id);
    }
  }
  
  const response: DeltaResponse = {
    frontier_delta: {
      from_frontier: fromFrontier,
      to_frontier: toFrontier,
      ops_count: appliedOps.length
    },
    affected_spans: Array.from(affectedSpans).map(spanId => ({
      span_id: spanId,
      block_id: getSpanBlockId(spanId),
      new_context_hash: computeContextHash(spanId),
      status: getSpanStatus(spanId)
    }))
  };
  
  if (deltaScope === "affected_with_neighbors") {
    response.neighbor_spans = [];
    for (const blockId of affectedBlocks) {
      const neighbors = getNeighborBlocks(blockId, policy.max_block_radius);
      for (const neighborBlockId of neighbors) {
        for (const span of getSpansInBlock(neighborBlockId)) {
          if (!affectedSpans.has(span.span_id)) {
            response.neighbor_spans.push({
              span_id: span.span_id,
              block_id: neighborBlockId,
              context_hash: computeContextHash(span.span_id)
            });
          }
        }
      }
    }
  }
  
  return response;
}
```

---

## 7. Error Response Generation

```ts
function generateErrorResponse(
  error: TargetingError,
  candidates: RankedCandidate[],
  policy: AiTargetingPolicyV1
): AIErrorResponse {
  const diagnostics: DiagnosticEntry[] = [];
  
  if (candidates.length > 0 && policy.max_diagnostics_bytes > 0) {
    diagnostics.push({
      kind: "ai_targeting_candidates_v1",
      code: error.code,
      phase: "targeting",
      detail: error.reason,
      candidates: candidates.slice(0, policy.max_candidates).map(c => ({
        span_id: c.candidate.span_id,
        block_id: c.candidate.block_id,
        match_vector: c.vector,
        distance: c.distance
      }))
    });
  }
  
  // Truncate diagnostics if over limit
  const serialized = JSON.stringify(diagnostics);
  if (serialized.length > policy.max_diagnostics_bytes) {
    diagnostics[0].candidates = diagnostics[0].candidates?.slice(0, 3);
    diagnostics[0].detail = diagnostics[0].detail?.slice(0, 100) + "...";
  }
  
  return {
    code: error.code,
    phase: "ai_gateway",
    retryable: error.retryable,
    current_frontier: error.current_frontier,
    failed_preconditions: error.failed_preconditions,
    diagnostics
  };
}
```

---

## 8. Conformance Test Requirements

### 8.1 Hash Algorithm Tests

```ts
describe("LFCC_SPAN_WINDOW_V1", () => {
  it("produces deterministic hash for same input", () => {
    const h1 = computeWindowHash("b1", 10, 20, "hello world test", { left: 5, right: 5 });
    const h2 = computeWindowHash("b1", 10, 20, "hello world test", { left: 5, right: 5 });
    expect(h1).toBe(h2);
  });
  
  it("normalizes CRLF to LF", () => {
    const h1 = computeWindowHash("b1", 5, 10, "ab\r\ncd", { left: 5, right: 5 });
    const h2 = computeWindowHash("b1", 5, 10, "ab\ncd", { left: 5, right: 5 });
    expect(h1).toBe(h2);
  });
  
  it("handles boundary at block start", () => {
    const h = computeWindowHash("b1", 0, 5, "hello", { left: 10, right: 5 });
    expect(h).toBeDefined();
  });
});
```

### 8.2 Relocation Tests

```ts
describe("deterministic relocation", () => {
  it("returns candidates in lexicographic span_id order", () => {
    const candidates = generateCandidates(pre, policy, "same_block", state);
    const ids = candidates.map(c => c.span_id);
    expect(ids).toEqual([...ids].sort());
  });
  
  it("auto-retargets when unique top candidate matches hard signals", () => {
    const result = shouldAutoRetarget(rankedWithClearWinner, policy);
    expect(result.success).toBe(true);
  });
  
  it("rejects when tied candidates", () => {
    const result = shouldAutoRetarget(rankedWithTie, policy);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("ambiguous_candidates");
  });
});
```

### 8.3 Layered Precondition Tests

```ts
describe("layered preconditions", () => {
  it("rejects on strong constraint failure before evaluating weak", () => {
    const result = await processLayeredPreconditions(
      { layered_preconditions: { strong: [failingPre], weak: [passingPre] } },
      policy
    );
    expect(result.success).toBe(false);
  });
  
  it("applies weak recovery on soft failure", () => {
    const result = await processLayeredPreconditions(
      { layered_preconditions: { strong: [], weak: [relocatablePre] } },
      policy
    );
    expect(result.success).toBe(true);
    expect(result.recoveries).toHaveLength(1);
  });
});
```

---

## 9. Metrics Collection

### 9.1 Prometheus Metrics (Recommended)

```ts
const metrics = {
  aiRequestTotal: new Counter({
    name: "lfcc_ai_request_total",
    help: "Total AI requests processed",
    labelNames: ["status", "atomicity"]
  }),
  
  aiPreconditionFailures: new Counter({
    name: "lfcc_ai_precondition_failures",
    help: "Precondition failures by reason",
    labelNames: ["reason", "policy"]
  }),
  
  aiRetargetTotal: new Counter({
    name: "lfcc_ai_retarget_total",
    help: "Auto-retarget attempts",
    labelNames: ["policy", "success"]
  }),
  
  aiTrimTotal: new Counter({
    name: "lfcc_ai_trim_total",
    help: "Auto-trim attempts",
    labelNames: ["success"]
  }),
  
  aiRelocateDistance: new Histogram({
    name: "lfcc_ai_relocate_distance",
    help: "Relocation distances in UTF-16 code units",
    labelNames: ["policy"],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  }),
  
  aiRetryRounds: new Histogram({
    name: "lfcc_ai_retry_rounds",
    help: "Retry rounds per request",
    labelNames: ["agent_id"],
    buckets: [0, 1, 2, 3, 4, 5, 10]
  })
};
```

---

## 10. SDK Integration Guide

### 10.1 Recommended Agent Flow

```ts
class AgentEditSession {
  private policy: AiTargetingPolicyV1;
  private gateway: AIGateway;
  
  async submitIntent(
    intent: EditIntent,
    targets: SpanReference[],
    options: SubmitOptions = {}
  ): Promise<EditResult> {
    const maxRetries = options.maxRetries ?? 3;
    let lastError: AIError | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 1. Refresh span state
      const spans = await this.refreshSpans(targets.map(t => t.span_id));
      
      // 2. Build preconditions
      const preconditions = this.buildPreconditions(targets, spans, options);
      
      // 3. Preview normalization (optional)
      if (options.previewFirst) {
        const preview = await this.previewNormalization(intent.payload);
        if (!preview.schema_valid) {
          return { success: false, finalError: { code: "PREVIEW_INVALID" } };
        }
      }
      
      // 4. Submit request
      const result = await this.gateway.submit({
        request_id: generateRequestId(),
        agent_id: this.agentId,
        intent_id: intent.id,
        targeting: {
          version: "v1",
          relocate_policy: this.policy.default_relocate_policy,
          auto_retarget: options.autoRelocate ?? true,
          allow_trim: options.autoTrim ?? false
        },
        layered_preconditions: preconditions,
        ops_xml: intent.payload,
        options: { return_delta: true }
      });
      
      if (result.success) {
        return {
          success: true,
          appliedFrontier: result.applied_frontier,
          recoveries: result.weak_recoveries,
          trimming: result.trimming,
          retries: attempt
        };
      }
      
      // 5. Handle retryable errors
      if (result.error.retryable) {
        lastError = result.error;
        await this.rebaseToFrontier(result.error.current_frontier);
        continue;
      }
      
      return { success: false, finalError: result.error, retries: attempt };
    }
    
    return { success: false, finalError: lastError, retries: maxRetries };
  }
  
  private buildPreconditions(
    targets: SpanReference[],
    spans: SpanState[],
    options: SubmitOptions
  ): LayeredPreconditions {
    return {
      strong: targets
        .filter(t => t.critical)
        .map(t => this.buildStrongPrecondition(t, spans)),
      weak: targets
        .filter(t => !t.critical)
        .map(t => this.buildWeakPrecondition(t, spans, options))
    };
  }
}
```

---

## 11. Migration from v0.9.1

### 11.1 Backward Compatibility

- Requests without `targeting` field continue to use v0.9 behavior
- Legacy preconditions are automatically mapped to v1 format
- Policy defaults enable gradual adoption

### 11.2 Recommended Rollout

1. **Phase 1:** Enable `ai_targeting_v1` capability in policy
2. **Phase 2:** SDK begins using v1 preconditions with `exact_span_only`
3. **Phase 3:** Enable `allow_soft_preconditions` and `same_block` relocation
4. **Phase 4:** Enable layered preconditions and auto-trim
5. **Phase 5:** Monitor metrics and adjust policy thresholds

---

## 12. References

- Proposal: `proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md`
- Core Spec: `LFCC_v0.9_RC.md` §11
- AI Envelope: `engineering/06_AI_Envelope_Specification.md`
- Policy Schema: `engineering/02_Policy_Manifest_Schema.md`
