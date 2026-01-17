# Cowork Top-Tier Chat + Agent Alignment Spec

## Status
- Owner: Product + Tech Lead
- Stage: Draft
- Target: Top-tier chat (Cherry Studio class) + agent task UX (Claude Cowork / Manus class)
- Last Updated: 2025-01-15

## Purpose
Align apps/cowork AI chat and agent task experiences with top-tier desktop clients.
The chat surface should match Cherry Studio level expectations, while task-mode execution
should feel like a premium, transparent agent workflow.

## Current State (apps/cowork)
### What exists
- Chat UI uses `ChatThread` with `ShellAIPanel` for streaming text.
- Task runtime uses CoworkTaskRuntime and TaskGraph streaming via SSE.
- Task timeline exists as a separate panel (`TaskContainer` + `TaskTimeline`).
- Task artifacts are emitted and listed in the right rail (plans, diffs, reports).
- Model selection is supported via settings and per-message metadata.
- Optimistic user messages exist in `useChatSession`.

### Key gaps vs top-tier chat clients
- Chat history persistence is stubbed (`GET /sessions/:id/chat` returns empty).
- Message actions are no-ops: edit, branch, quote, retry.
- Attachments are not supported (UI wired but disabled).
- No conversation search, tagging, pinning, or export.
- Task progress is fragmented between timeline panel and message stream.
- Model transparency is not visible in the chat UI (only headers).
- No explicit per-message model override or system prompt controls.
- No keyboard shortcuts, quick prompts, or prompt library.

## Benchmark: Cherry Studio parity (chat)
Cherry-class chat clients typically include:
- Multi-provider and multi-model switching, often per message.
- Conversation list with folders, search, tags, and pinning.
- Message editing, regenerate, branch, and quote.
- Attachments: images, files, and local knowledge sources.
- System prompt presets, persona profiles, and quick prompts.
- Streaming reliability with clear status and retry.
- Export (markdown, JSON), copy, and share.
- Keyboard shortcuts and command palette.

## Goals
- Message-first UX: chat is the primary narrative surface.
- Single narrative: a task equals one assistant message with inline progress.
- Cherry Studio parity on core chat controls and convenience features.
- Deliverable-first outputs with preview and actions.
- Model transparency: show actual provider + model and fallback events.
- Fast and resilient streaming with clear status.

## Non-Goals
- Replacing agent-runtime architecture or tool registry.
- Adding new CRDT or storage formats.
- Full multi-tenant or cloud sync.

## Experience Principles
- Immediate feedback: user message appears instantly, never reorders.
- No dead air: show visible progress within 2 seconds.
- Clear accountability: every tool call and approval is visible.
- Outcome-first: outputs are always discoverable and actionable.
- Honest routing: show actual model used and fallbacks.

## Product Requirements

### P0 Chat Parity (Cherry class)
- Session list with search, rename, and delete.
- Message actions: edit and resend, regenerate, branch, quote, copy.
- Per-session model selector and per-message override.
- System prompt and persona presets per session.
- Input supports slash commands, @mentions, and drag-drop files.
- Attachment support for images and files (local, max size policy).
- Stream status: queued, streaming, done, error with retry.
- Export session to markdown and JSON.

### P0 Agent Task Mode (Cowork class)
- Explicit task vs chat toggle (with auto intent detection fallback).
- Single assistant message per task with inline timeline:
  - status pill (queued/running/completed/failed)
  - model badge (provider + model)
  - elapsed time
  - streaming output
  - collapsible execution timeline
  - deliverables list
- Inline approvals with risk labels and reason.
- Control actions: pause, resume, cancel.
- Background execution with task queue visibility.

### P1 Enhancements
- Conversation folders, tags, pinned sessions.
- Prompt library and reusable templates.
- Context window and token usage display.
- Quick actions and command palette.
- Inline diff viewer with apply and revert.
- Artifact preview in main panel with side rail index.

### P2 Enhancements
- Multi-agent parallel tasks with status overview.
- Workspace knowledge base and retrieval selectors.
- Cross-session search and analytics.
- Shared sessions and collaboration (post-MVP).

## Information Architecture
- Left rail: sessions, search, folders, pinned.
- Center: chat thread with message-first timeline.
- Right rail: artifacts, approvals, context, model and cost summary.
- Mobile: single-column view with drawers for session list and artifacts.

## Interaction Flows
1. Chat message
   - User sends message -> optimistic render -> server ack -> stream -> done.
2. Task mode
   - User toggles task -> plan -> approval -> execution -> deliverables.
3. Approval
   - Tool requires approval -> inline card -> approve/reject -> resume.
4. Artifact review
   - Deliverable list appears -> preview -> apply or request revision.
5. Background run
   - Task continues -> notifications -> results pinned to chat.

## Data Model Updates

### ChatSession
```ts
interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: "chat" | "task";
  systemPrompt?: string;
  personaId?: string;
  defaultModelId?: string;
}
```

### ChatMessage
```ts
interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "pending" | "streaming" | "done" | "error" | "canceled";
  modelId?: string;
  providerId?: string;
  fallbackNotice?: string;
  parentId?: string; // for branches
  attachments?: ChatAttachmentRef[];
  taskId?: string; // if this message represents a task
  metadata?: Record<string, unknown>;
}
```

### Attachments
```ts
interface ChatAttachmentRef {
  id: string;
  kind: "image" | "file";
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageUri: string;
}
```

## API and Event Contracts

### Chat History
- `GET /sessions/:id/chat` returns ordered messages (server stored).
- `POST /sessions/:id/chat` accepts message + client_request_id and streams deltas.
- `PATCH /sessions/:id/messages/:id` updates message (edit/regenerate).
- `POST /sessions/:id/attachments` uploads and returns attachment refs.

### SSE Stream (chat + tasks)
- `message.created`, `message.delta`, `message.completed`, `message.error`
- `task.status`, `task.plan`, `task.step`, `task.tool`, `task.artifact`
- Each event includes `sessionId`, `messageId`, `taskId` where applicable.

## System Behavior
- Generate client_request_id per send; map to server message id on ack.
- Maintain stable ordering: user message stays in place, assistant updates in place.
- Stream chunks with rAF batching to avoid flicker.
- Show "Working..." state if no chunk within 2 seconds.

## Model Routing and Policy
- Default model from settings; per-message override takes precedence.
- Task mode uses SmartProviderRouter unless explicit model is set.
- All assistant messages render provider + model and fallback notice.

## Performance Budgets
- TTFB (ack): < 150ms
- First token: < 800ms
- Timeline update: < 500ms
- Artifact preview: < 1s after task completion

## Telemetry
- time_to_first_token
- time_to_complete
- fallback_rate
- tool_error_rate
- artifact_open_rate
- task_cancel_rate

## Accessibility
- Keyboard navigation for message actions, approvals, and artifact list.
- ARIA labels for icon-only buttons and status pills.
- Single main landmark per page.

## Risks and Mitigations
- Stream drift between chat and task SSE: unify into a single event channel.
- Message ordering conflicts: require client_request_id and server ack.
- Attachment size bloat: enforce per-file and per-session limits.

## Phased Rollout
1. Foundation
   - Persist chat history and message edits
   - Unified stream events
   - Message action wiring
2. Cherry parity
   - Model controls, search, export, prompt library
   - Attachments and @mention context
3. Agent depth
   - Inline timeline, approvals, deliverables
   - Background tasks and queue management

## Acceptance Criteria
- Chat history persists and reloads without reordering.
- All message actions (edit, retry, branch, quote) are functional.
- Attachments render and are available to the model.
- Task progress appears inside the assistant message.
- Model and fallback info is visible on every response.

## Open Questions
- Per-message model override UI: inline dropdown or command palette?
- Default task mode trigger: explicit toggle vs intent-only?
- Artifact apply workflow: inline or separate review screen?
