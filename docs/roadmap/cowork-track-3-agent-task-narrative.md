# Track 3: Agent Task Narrative (Message-First UX)

## Mission
Unify task execution into the chat thread so each task is one assistant message
with inline status, timeline, and deliverables.

## Primary Goal
Deliver a Manus-class task narrative: streaming output, inline steps, approvals,
and deliverables within the assistant message body.

## Scope
- Task stream projection into a single assistant message per task.
- Inline status pill, model badge, elapsed time.
- Collapsible execution timeline embedded in the message body.
- Deliverables list with preview and open action.
- Working state when no tokens for 2 seconds.
- Inline approvals with risk tags and reason.

## Non-Goals
- Chat history persistence and editing (Track 1).
- Chat UI parity features outside task view (Track 2).
- Agent runtime architecture changes.

## Inputs and References
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md`
- `apps/cowork/src/features/chat/utils/taskProjection.ts`
- `apps/cowork/src/features/tasks/hooks/useTaskStream.ts`
- `packages/shell/src/components/chat/MessageItem.tsx`

## Execution Steps (Do This First)
1. Review `apps/cowork/src/features/chat/utils/taskProjection.ts` and map task nodes to message metadata.
2. Update `packages/shell/src/components/chat/MessageItem.tsx` to render task header + timeline inline.
3. Ensure `apps/cowork/src/features/chat/hooks/useChatSession.ts` preserves task messages in order.
4. Wire inline approvals to `onTaskAction` handlers in `packages/shell/src/components/chat/MessageItem.tsx`.
5. Remove or de-emphasize separate TaskContainer use in `apps/cowork/src/app/routes/SessionRoute.tsx`.
6. Add working indicator logic in message rendering for stalled streams.

## Required Behavior
- One task equals one assistant message (no extra task cards).
- Task updates mutate the existing message in place.
- Deliverables appear after completion and stay visible.
- Approvals appear inline and can be resolved without leaving the message.

## Implementation Outline
1. Extend task projection to attach timeline + deliverables to message metadata.
2. Update message rendering to display:
   - status pill
   - model badge
   - elapsed time
   - inline timeline and artifacts
3. Remove or de-emphasize the separate TaskContainer panel for task narrative.
4. Ensure streaming updates do not reorder message list.
5. Add working indicator when no tokens for 2 seconds.

## Deliverables
- Message-first task rendering in chat thread.
- Inline timeline and approvals in MessageItem rendering.
- Artifact preview actions wired to the existing preview handler.

## Acceptance Criteria
- Task progress is visible inside the assistant message only.
- Deliverables appear within the message after completion.
- Model and fallback info appear in task message header.
- No duplicate task cards outside the message thread.

## Testing
- `pnpm test:e2e:core` or `pnpm test:e2e:smoke`
- Unit tests for task projection and message mapping.

## Dependencies
- Align metadata schema with Track 1 (message model fields).
- UI changes should not break Track 2 message actions.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
