# Track 10: Cost & Token Transparency

> **Status**: 🏗️ Implementation in Progress (UI Complete)
## Mission
Provide real-time visibility into token usage, API costs, and context window
utilization – a key feature that OpenCode prominently displays and users expect.

## Primary Goal
Ensure users always know how much they're spending and how much context remains,
without requiring manual queries or external dashboard checks.

## Background
OpenCode's always-visible cost and context display is frequently cited as a UX
advantage. Users appreciate:
- No surprise API bills
- Understanding context limits
- Optimizing prompts for efficiency
- Comparing model costs in real-time

## Scope
- Real-time token counter (input/output).
- Cost estimation per message and session.
- Context window usage meter.
- Per-provider pricing data.
- Session cost summary.
- Export cost reports.

## Event and Storage Contracts
- SSE event: `token.usage` with `{ messageId, inputTokens, outputTokens, totalTokens, costUsd, modelId, providerId }`.
- Store token usage alongside messages or in a `token_usage` table for aggregation.
- If pricing is unknown, emit `costUsd: null` and show "N/A" in UI.

## Non-Goals
- Billing integration (users pay providers directly).
- Budget enforcement (future track).
- Historical analytics dashboard.

## Inputs and References
- OpenCode: persistent cost display pattern
- Track 7: Provider pricing metadata
- `apps/cowork/server/routes/chat.ts`
- `packages/agent-runtime/src/core/orchestrator.ts`

## Execution Steps (Do This First)
1. **Define Token Tracking Schema**:
   ```typescript
   interface TokenUsage {
     messageId: string;
     inputTokens: number;
     outputTokens: number;
     totalTokens: number;
     estimatedCostUsd: number;
     modelId: string;
     providerId: string;
     timestamp: Date;
   }
   
   interface SessionCostSummary {
     sessionId: string;
     totalInputTokens: number;
     totalOutputTokens: number;
     totalCostUsd: number;
     messageCount: number;
     byModel: Record<string, TokenUsage>;
   }
   ```

2. **Implement Token Counter Middleware**:
   - Intercept LLM responses.
   - Extract token counts (provider-specific).
   - Calculate cost using Track 7 pricing data.
   - Emit via SSE: `token.usage` event.

3. **Context Window Meter**:
   - Track current context size.
   - Compare against model's context limit.
   - Warn when approaching limit (80%, 90%).
   - Show remaining capacity.

4. **Build Cost Display UI**:
   - Persistent footer widget showing:
     - Current session cost
     - Token count (input/output)
     - Context usage bar
   - Per-message cost badge (optional, toggle).
   - Model cost comparison tooltip.

5. **Session Summary API**:
   - `GET /api/sessions/{id}/cost` returns SessionCostSummary.
   - Export as JSON/CSV for expense tracking.

## UI Notes
- Footer widget shows total session cost and token counts.
- Optional per-message cost badge (toggle in settings).
- Context meter warns at 80% and 90% usage and shows remaining tokens.

## Required Behavior
- Token usage updates in real-time during streaming.
- Cost is calculated immediately after each message.
- Context meter updates with every interaction.
- All costs are estimates based on provider pricing.
- UI never blocks on cost calculation.

## Implementation Outline
1. Add token tracking middleware to LLM adapter layer.
2. Create `CostTracker` service with accumulation logic.
3. Emit `token.usage` SSE events during streaming.
4. Build `CostDisplay` React component.
5. Add context meter to chat header.
6. Implement session cost API endpoint.

## Deliverables
- Token tracking middleware.
- `CostTracker` service.
- [x] Real-time cost display widget.
- [x] Context window usage meter.
- Session cost summary API.

## Acceptance Criteria
- [ ] Token count updates during streaming.
- [ ] Cost is displayed after each message.
- [x] Context meter shows percentage used.
- [x] Warning appears at 80% context usage.
- [ ] Session cost can be exported.

## Testing
- Unit tests for cost calculation logic.
- Integration test: verify SSE token events.
- Visual regression test for cost widget.
- `pnpm vitest run --project cowork-server`

## Dependencies
- Track 7: Provider pricing metadata.
- Track 1: Message storage for cost persistence.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
