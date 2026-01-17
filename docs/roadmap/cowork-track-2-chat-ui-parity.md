# Track 2: Chat UI Parity (Frontend)

## Mission
Bring apps/cowork chat UI to Cherry Studio class parity with full message controls,
model transparency, and productivity features.

## Primary Goal
Deliver user-facing chat parity features without changing agent runtime internals.

## Scope
- Message actions: edit, regenerate, branch, quote, copy.
- Model transparency: show provider + model + fallback notice per assistant message.
- Session controls: rename, delete, search, pin (UI only if API exists).
- System prompt + persona presets per session.
- Chat export (markdown and JSON).
- Keyboard shortcuts for send, new chat, regenerate, search.
- Input enhancements: slash commands, @mentions, drag-drop files.

## Non-Goals
- Chat history persistence (Track 1).
- Task timeline or agent task stream changes (Track 3).
- Provider routing logic changes.

## Inputs and References
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md`
- `apps/cowork/src/features/chat/*`
- `packages/shell/src/components/chat/*`
- `apps/cowork/src/api/coworkApi.ts`

## Execution Steps (Do This First)
1. Inspect `packages/shell/src/components/chat/MessageItem.tsx` for message action hooks.
2. Update `apps/cowork/src/features/chat/CoworkAIPanel.tsx` to wire action handlers.
3. Use `apps/cowork/src/features/chat/hooks/useChatSession.ts` for action mutations.
4. Add model/provider badges in `packages/shell/src/components/chat/MessageItem.tsx`.
5. Implement export utilities under `apps/cowork/src/features/chat/utils/`.
6. Add keyboard shortcuts in `apps/cowork/src/app/layouts/RootLayout.tsx` or panel wrapper.

## Required Behavior
- User messages render immediately and never re-order.
- Streaming assistant message updates in place (no flicker).
- Model badge and fallback notice visible per assistant message.
- Message actions update server state and local cache.

## Implementation Outline
1. Wire message actions to new APIs:
   - edit + resend
   - retry/regenerate
   - branch (create new message with parentId)
2. Add model/provider badge UI to message header.
3. Implement export (markdown, JSON) using session history.
4. Add system prompt and persona UI controls in session settings.
5. Add keyboard shortcuts and command palette entries.
6. Enable attachments UI and wire to upload API (Track 1).

## Deliverables
- Updated chat UI components with message actions and badges.
- Session settings panel for prompts and personas.
- Export and shortcut support.
- UI tests or unit coverage for message actions.

## Acceptance Criteria
- All message action buttons work end-to-end.
- Model/provider/fallback are visible on assistant messages.
- Export produces correct markdown and JSON.
- Keyboard shortcuts operate without conflicts.

## Testing
- `pnpm test:e2e:smoke` (targeted)
- Unit tests for action handlers and formatting utilities.

## Dependencies
- Track 1 APIs for message updates and attachments.
- Align message schema with Track 1.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
