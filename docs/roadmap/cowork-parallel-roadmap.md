# Cowork Parallel Roadmap (Top-Tier Completion)

## Goal
Reach near-complete top-tier product standard for Cowork chat + agent experience
by executing ten parallel tracks with clear dependencies and acceptance gates.

> **Updated 2026-01-17**: Added Tracks 7-10 based on competitive analysis of OpenCode and Claude Code success factors.
> **Updated 2026-01-17**: Track 8 (Project Context) and Track 9 (Plan/Build Modes) core implementation completed.

## Tracks (Source of Truth)

### Phase 1: Foundation Tracks (1-6)
1) Track 1: Chat Persistence + API Contracts  
   - Doc: `docs/roadmap/cowork-track-1-chat-persistence.md`
   - Output: message storage + message/attachment APIs
2) Track 2: Chat UI Parity  
   - Doc: `docs/roadmap/cowork-track-2-chat-ui-parity.md`
   - Output: message actions, model badges, export, shortcuts
3) Track 3: Agent Task Narrative  
   - Doc: `docs/roadmap/cowork-track-3-agent-task-narrative.md`
   - Output: task-as-message timeline + inline approvals + deliverables
4) Track 4: Safety + Permissions  
   - Doc: `docs/roadmap/cowork-track-4-safety-permissions.md`
   - Output: grant enforcement, approvals, audit logs
5) Track 5: Reliability + Telemetry  
   - Doc: `docs/roadmap/cowork-track-5-reliability-telemetry.md`
   - Output: streaming resilience, ordering guarantees, metrics
6) Track 6: Artifact Review + Apply  
   - Doc: `docs/roadmap/cowork-track-6-artifacts-apply-review.md`
   - Output: apply/revert workflow + artifact audit trail

### Phase 2: Competitive Parity Tracks (7-10)
7) Track 7: Provider Agnostic Architecture
   - Doc: `docs/roadmap/cowork-track-7-provider-agnostic.md`
   - Output: multi-model support, API key management, model selector
   - Inspiration: OpenCode's 75+ model support, no vendor lock-in
   - Status: 🔲 Not Started
8) Track 8: Project Context System (AGENTS.md) ✅ COMPLETED
   - Doc: `docs/roadmap/cowork-track-8-project-context.md`
   - Output: auto-generated project context, persistent agent memory
   - Inspiration: OpenCode AGENTS.md, Claude Code CLAUDE.md
   - Status: ✅ Core implementation complete (analyzer, generator, API routes)
9) Track 9: Plan Mode & Build Mode ✅ CORE COMPLETE
   - Doc: `docs/roadmap/cowork-track-9-plan-build-modes.md`
   - Output: dual agent modes, plan.md generation, mode toggle UI
   - Inspiration: OpenCode plan/build agents, Claude Code Plan Mode
   - Status: ✅ AgentModeManager + API endpoints complete; UI pending
10) Track 10: Cost & Token Transparency
    - Doc: `docs/roadmap/cowork-track-10-cost-transparency.md`
    - Output: real-time token/cost display, context meter, session summary
    - Inspiration: OpenCode's always-visible cost display
    - Status: 🔲 Not Started

## Contract Freeze (Read Before Coding)
- `docs/roadmap/cowork-contract-freeze.md`

## Execution Summary (Agent-Ready)
### Phase 1 Tracks
- Track 1: Follow "Execution Steps" in `docs/roadmap/cowork-track-1-chat-persistence.md`
- Track 2: Follow "Execution Steps" in `docs/roadmap/cowork-track-2-chat-ui-parity.md`
- Track 3: Follow "Execution Steps" in `docs/roadmap/cowork-track-3-agent-task-narrative.md`
- Track 4: Follow "Execution Steps" in `docs/roadmap/cowork-track-4-safety-permissions.md`
- Track 5: Follow "Execution Steps" in `docs/roadmap/cowork-track-5-reliability-telemetry.md`
- Track 6: Follow "Execution Steps" in `docs/roadmap/cowork-track-6-artifacts-apply-review.md`

### Phase 2 Tracks (Competitive Parity)
- Track 7: Follow "Execution Steps" in `docs/roadmap/cowork-track-7-provider-agnostic.md`
- Track 8: Follow "Execution Steps" in `docs/roadmap/cowork-track-8-project-context.md`
- Track 9: Follow "Execution Steps" in `docs/roadmap/cowork-track-9-plan-build-modes.md`
- Track 10: Follow "Execution Steps" in `docs/roadmap/cowork-track-10-cost-transparency.md`

## Best-Order Execution (Parallel + Gates)
### Phase A: Foundation (must land first)
- Track 1 (storage + message contracts)
- Track 5 (stream reliability + telemetry)
Gate A: persisted chat history + stable streaming + metrics emitted

### Phase B: Experience (parallel once Gate A passes)
- Track 2 (chat UI parity)
- Track 3 (task narrative in message stream)
Gate B: message actions + task narrative fully in thread

### Phase C: Compliance + Output (parallel once Gate A passes)
- Track 4 (safety + permissions)
- Track 6 (artifact apply + review)
Gate C: approvals enforced + apply/revert workflow validated

### Phase D: Competitive Parity (parallel once Gate A passes)
- Track 7 (provider agnostic - depends on Track 1 message schema) - 🔲 Not Started
- Track 8 (project context - no dependencies) - ✅ Complete
- Track 9 (plan/build modes - depends on Track 4 approvals) - ✅ Core Complete
- Track 10 (cost transparency - depends on Track 7 provider pricing) - 🔲 Not Started
Gate D: multi-model support + project context + mode switching + cost visibility

## Cross-Track Contracts (Must Align)
- Message schema: status, modelId, providerId, fallbackNotice, parentId
- SSE events: message.created/delta/completed/error + task.* events + token.usage
- Approval metadata: risk tags, reason, tool name, args
- Artifact metadata: version, status, source path, appliedAt
- Provider metadata: providerId, pricing, capabilities, contextLimit
- Mode metadata: currentMode, allowedTools, deniedTools

## Ownership and Handoff
- Each track owner updates `task.md` and `walkthrough.md` for their scope.
- Track 1 defines the message schema contract; Tracks 2/3/5/7 consume it.
- Track 4 defines approval payload; Tracks 3/9 render it inline.
- Track 6 defines artifact apply state; Track 3 renders it in message bodies.
- Track 7 defines provider interface; Track 10 consumes pricing data.
- Track 8 can proceed independently (no dependencies).
- Track 9 depends on Track 4 for approval workflow in Build Mode.

## Definition of Done (Global)
### Phase 1 Criteria
- Chat history persists and reloads without reordering.
- Task narrative is message-first (no duplicate task cards).
- Model/provider/fallback visible on every assistant output.
- Approvals are enforced and auditable.
- Artifacts can be applied/reverted with audit entries.
- Telemetry tracks TTFB/TTFT and fallback rates.

### Phase 2 Criteria (Competitive Parity)
- Users can switch between OpenAI, Anthropic, Google, and Ollama models.
- AGENTS.md is auto-generated and injected into agent context.
- Plan Mode generates plan.md; Build Mode executes with approvals.
- Token usage and cost displayed in real-time.

## Verification Plan
- Unit tests per track (cowork-server + shared utilities).
- Targeted e2e: `pnpm test:e2e:smoke` and `pnpm test:e2e:features`.
- Provider integration tests with mocked responses.
- Mode switching e2e tests.

