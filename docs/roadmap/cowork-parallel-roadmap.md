# Cowork Parallel Roadmap (Top-Tier Completion)

## Goal
Reach near-complete top-tier product standard for Cowork chat + agent experience
by executing six parallel tracks with clear dependencies and acceptance gates.

## Tracks (Source of Truth)
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

## Contract Freeze (Read Before Coding)
- `docs/roadmap/cowork-contract-freeze.md`

## Execution Summary (Agent-Ready)
- Track 1: Follow "Execution Steps" in `docs/roadmap/cowork-track-1-chat-persistence.md`
- Track 2: Follow "Execution Steps" in `docs/roadmap/cowork-track-2-chat-ui-parity.md`
- Track 3: Follow "Execution Steps" in `docs/roadmap/cowork-track-3-agent-task-narrative.md`
- Track 4: Follow "Execution Steps" in `docs/roadmap/cowork-track-4-safety-permissions.md`
- Track 5: Follow "Execution Steps" in `docs/roadmap/cowork-track-5-reliability-telemetry.md`
- Track 6: Follow "Execution Steps" in `docs/roadmap/cowork-track-6-artifacts-apply-review.md`

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

## Cross-Track Contracts (Must Align)
- Message schema: status, modelId, providerId, fallbackNotice, parentId
- SSE events: message.created/delta/completed/error + task.* events
- Approval metadata: risk tags, reason, tool name, args
- Artifact metadata: version, status, source path, appliedAt

## Ownership and Handoff
- Each track owner updates `task.md` and `walkthrough.md` for their scope.
- Track 1 defines the message schema contract; Tracks 2/3/5 consume it.
- Track 4 defines approval payload; Track 3 renders it inline.
- Track 6 defines artifact apply state; Track 3 renders it in message bodies.

## Definition of Done (Global)
- Chat history persists and reloads without reordering.
- Task narrative is message-first (no duplicate task cards).
- Model/provider/fallback visible on every assistant output.
- Approvals are enforced and auditable.
- Artifacts can be applied/reverted with audit entries.
- Telemetry tracks TTFB/TTFT and fallback rates.

## Verification Plan
- Unit tests per track (cowork-server + shared utilities).
- Targeted e2e: `pnpm test:e2e:smoke` and `pnpm test:e2e:features`.
