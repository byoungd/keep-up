# Task Prompt: Agent Workflow (Task Logic & Artifacts)

## 🎯 Objective
Build the **Task Execution Engine** and **Artifact Renderers**. This agent owns the "coworking" intelligence visualization.
**Goal**: Make the AI's thought process transparent, interactive, and beautiful.

## 🧱 Boundaries & Scope
- **IN SCOPE**:
  - `apps/cowork/src/features/tasks/*` (Timeline, Nodes).
  - `apps/cowork/src/features/artifacts/*` (Diffs, Plans, Checklists).
  - `apps/cowork/src/features/approvals/*` (Gate UI).
  - State sync with backend SSE events.
- **OUT OF SCOPE**:
  - The Chat composer (Beta's job).
  - File system API calls (Core's job).
  - Sidebar/Layout (Beta's job).

## 💎 Top-Tier Quality Standards
- **Interactivity**: Artifacts must be actionable (e.g., checkboxes work, diffs can be applied).
- **Legibility**: Syntax highlighting for code is mandatory (Shiki or fine-tuned Prism).
- **Feedback**: When a user clicks "Approve", the UI must instantly change state (optimistic) then confirm.
- **Safety**: "Risk" tags (Red/Yellow/Green) must be visually distinct and impossible to miss.

## 📋 Requirements
1. **Task Timeline**:
   - Render a vertical "Step" list. Steps can be: `Planning`, `Thinking`, `Tool Call`, `Output`, `Error`.
   - **Auto-scroll**: Keep view at bottom while streaming, unless user scrolls up.
   - **Collapsible**: "Thinking" blocks should be collapsed by default if >3 lines.
2. **Approval Gates**:
   - Create a `PendingApprovalCard`.
   - Show: `Tool Name`, `Arguments` (formatted JSON), `Risk Level`.
   - Actions: `Approve Once`, `Approve All`, `Reject`.
3. **Artifact: Plan**:
   - Markdown rendered checklist.
   - Progress bar showing % completed items.
4. **Artifact: Diff**:
   - Split-view or Unified diff component.
   - **Must have**: "Apply Changes" button that calls the backend API.
5. **State Machine Hook**:
   - `useTaskStream(sessionId)`: Connects to SSE, merges delta updates into a `TaskGraph` object.

## ✅ Definition of Done
- [x] `TaskTimeline` component renders a mock task with 5 steps correctly.
- [x] `PendingApprovalCard` triggers an API call on click.
- [x] `DiffCard` renders a sample Git diff with syntax highlighting.
- [x] Toggling a checklist item in the Plan artifact persists state (local or remote).
