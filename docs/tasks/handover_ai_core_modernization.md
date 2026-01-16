# Handover: AI Core Modernization & Propagation

## 1. Description
I have modernized the `@ku0/ai-core` package by integrating production-grade libraries. These changes are ready to be propagated to `@ku0/agent-runtime` and `apps/cowork`.

## 2. Infrastructure Updates (Completed)
- **Token Counting**: Integrated `js-tiktoken` (cl100k_base) into `TokenTracker`.
- **Resilience**: Replaced manual retry/circuit breaker logic with **Cockatiel**.
- **Observability**: Added Langfuse instrumentation to `UnifiedAIGateway`.

## 3. Propagation Tasks (Required)

### A. Accurate Token Counting (Replacement of `length / 4`)
Replace all instances of `Math.ceil(text.length / 4)` with accurate Tiktoken counts.
- **Affected Files**:
  - `packages/agent-runtime/src/orchestrator/messageCompression.ts`
  - `packages/agent-runtime/src/orchestrator/orchestrator.ts`
  - `packages/agent-runtime/src/prompts/promptBuilder.ts`
  - `packages/agent-runtime/src/reasoning/thinkingEngine.ts`
  - `packages/agent-runtime/src/memory/memoryManager.ts`
  - `apps/cowork/server/runtime/coworkTaskRuntime.ts`
- **Recommended Usage**:
```typescript
import { TokenTracker } from "@ku0/ai-core";
const tracker = new TokenTracker();
const counts = tracker.countTokens(text, "gpt-4o");
```

### B. Resilience Consolidation
Eliminate redundant resilience logic in `agent-runtime`.
- **Target File**: `packages/agent-runtime/src/utils/retry.ts`
- **Action**: Refactor to import and delegate to `@ku0/ai-core/resilience` (which now uses Cockatiel).

## 4. Verification
- Run `pnpm typecheck` to ensure cross-package compatibility.
- Verify through Langfuse that token counts are now precise.
