# Cowork Top-Tier Agent Chat Spec

## Status
- Owner: Product + Tech Lead
- Stage: Draft
- Target: Top-tier chat + agent task experience (Manus-class)

## Problem Statement
The current cowork chat and task UX is MVP-level: user messages can appear late, task progress is fragmented into cards, outputs are hard to find, and model usage is not transparent. This spec defines a top-tier experience that is message-first, streaming-first, and deliverable-first.

## Goals
- Immediate user feedback: user messages never disappear or reorder after send.
- Continuous progress: every task updates in-stream with steps and tool activity.
- Deliverable clarity: outputs are visible, previewable, and actionable on completion.
- Model transparency: actual provider and model are displayed; no silent fallback.
- Consistent narrative: all task progress appears as a single assistant message.

## Non-Goals
- Rewriting core agent runtime architecture.
- Building a new tool ecosystem.
- Changing persistence or storage formats.

## Experience Principles
- Message-first: everything is a chat message.
- Single narrative: no duplicate task cards; one task equals one assistant message.
- Outcome-first: deliverables are front and center.
- No dead air: show progress within 2 seconds if no tokens arrive.
- Honest systems: show actual model used and fallback events.

## IA and UI Structure
### Thread
- User messages (right aligned).
- Assistant messages (left aligned).
- Task execution is rendered inside the assistant message body.

### Assistant Message Layout
1. Header row
   - Status pill (Queued/Running/Completed/Failed)
   - Model badge (provider + model id)
   - Elapsed time
2. Live output body
   - Streaming markdown (no raw-to-render swap)
3. Execution timeline (collapsible)
   - Steps with status and timestamps
   - Tool activity chips
4. Deliverables section
   - Cards with preview, size, type, and open action

## Interaction Flow
1. User sends message.
2. Message renders immediately with optimistic state.
3. Assistant sends acknowledgment within 150ms.
4. Streaming response updates in place.
5. Execution timeline updates in-place (no new cards).
6. Deliverables appear at task completion with preview and open action.

## Streaming Rules
- First token target: < 800ms.
- Use rAF batching for chunk updates.
- Render markdown progressively (no flicker, no raw markdown display).
- If no tokens for 2 seconds, show "Working..." beneath the active step.

## Execution Timeline
- Step statuses: queued, running, completed, failed.
- Active step stays expanded by default.
- Tool calls render as chips:
  - Searching ...
  - Browsing ...
  - Reading ...
  - Writing ...
  - Running ...
- Tool errors attach to the step with a short error summary.

## Deliverables
- Always visible after completion.
- Card layout:
  - Title
  - Type
  - Preview snippet
  - Open action
- If missing or empty:
  - Show "Empty output" state with a retry button.

## Model and Tool Policy
- A single task binds to one model unless explicitly re-routed by policy.
- User-selected model is respected by default.
- Cross-provider fallback must be visible to the user.
- Model badge appears on every assistant/task response.

## Routing Strategy (Target)
- Introduce a model router layer:
  - fast lane for quick answers
  - deep lane for long-form or multi-step
  - vision lane for image/file processing
  - code lane for code edits
- Routing inputs:
  - user selection
  - task class
  - tool capability
  - latency/cost budget

## Error Handling
- Stream error shows partial output + retry.
- Tool error shows inline step error + continue if possible.
- Failed task shows final status + recovery actions.

## Performance Budgets
- TTFB (ack): < 150ms
- First token: < 800ms
- Timeline update: < 500ms
- Deliverable preview: < 1s after completion

## Telemetry
- Metrics:
  - time to first token
  - task duration
  - tool error rate
  - fallback rate
  - deliverable open rate
- Log the effective provider + model for each response.

## Accessibility
- Keyboard navigation for timeline and deliverables.
- ARIA labels for icon-only buttons.
- Single main landmark per page.

## Acceptance Criteria
- User message always appears immediately and never disappears.
- One task equals one assistant message.
- Deliverable preview visible for every completed task.
- Actual model used is visible; fallback is announced.
- No raw markdown flash before rendering.

## Open Questions
- Should the model router allow per-step model switching?
- What is the default fallback policy when provider is down?
- Should deliverables be stored per-step or per-task?
