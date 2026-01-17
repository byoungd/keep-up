# Track 1: Chat Persistence + API Contracts (Backend)

## Mission
Implement durable chat history, message operations, and attachment APIs for apps/cowork
so the chat surface can reach Cherry Studio parity.

## Primary Goal
Replace the placeholder chat history with real storage, and provide stable APIs for
message lifecycle operations (create, edit, retry, branch, export) and attachments.

## Scope
- Chat message storage (SQLite or JSON store, consistent with cowork storage layer).
- API endpoints for:
  - `GET /sessions/:id/chat` (ordered messages)
  - `POST /sessions/:id/chat` (create + stream + meta headers)
  - `PATCH /sessions/:id/messages/:id` (edit + regenerate)
  - `POST /sessions/:id/attachments` (upload and return refs)
- Message metadata fields: `status`, `modelId`, `providerId`, `fallbackNotice`, `parentId`.
- Server-side export endpoint (optional if UI export can use cached history).

## Non-Goals
- UI changes in the chat panel.
- Agent task streaming or task timeline changes.
- Model routing policy changes.

## Inputs and References
- `docs/specs/cowork/cowork-top-tier-agent-chat-spec.md`
- `apps/cowork/server/routes/chat.ts`
- `apps/cowork/server/storage/*`
- `apps/cowork/src/api/coworkApi.ts`

## Required Behavior
- Stable ordering: user message must remain where sent; assistant updates in place.
- Acknowledge client request ID and map to server message ID.
- Persist assistant outputs with model/provider metadata.
- Support branching via `parentId` for derived messages.

## Implementation Outline
1. Define `ChatMessage` storage schema in cowork storage layer.
2. Add storage implementation to SQLite and JSON stores.
3. Implement message CRUD + list queries by session (ordered by createdAt).
4. Update `GET /sessions/:id/chat` to return stored messages.
5. Update `POST /sessions/:id/chat` to:
   - Persist user message
   - Stream assistant response
   - Persist assistant message with streaming updates
6. Add `PATCH /sessions/:id/messages/:id` for edit/regenerate.
7. Add attachment upload endpoint and storage refs.

## Deliverables
- Storage schema and persistence for chat messages.
- Updated chat routes with full history and message lifecycle.
- Attachment API with stored refs.
- Unit tests for storage and routes (server-side).

## Acceptance Criteria
- Chat history persists across reloads.
- Server returns ordered messages with correct metadata.
- Message edit/regenerate updates stored content.
- Attachment upload returns stable references.

## Testing
- `pnpm vitest run --project cowork-server`
- Add targeted tests for chat store and route handlers.

## Dependencies
- None required for parallel work, but align message schema with Track 2 UI.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
