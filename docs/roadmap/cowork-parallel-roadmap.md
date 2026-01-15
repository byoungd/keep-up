# Cowork Parallel Development Roadmap

This roadmap breaks down the Cowork app (`apps/cowork`) into three parallel development tracks designed for autonomous agents.

## Track 1: [Agent Core](task-core-infra.md) (Core & Infrastructure)
**Focus**: Backend stability, persistence, and agent-runtime orchestration.

- [x] Initialize Bun + Hono server in `apps/cowork/server`.
- [x] Implement `.keep-up/state` persistence (Sessions, Tasks, Approvals).
- [x] Set up SSE (Server-Sent Events) for TaskGraph event streaming.
- [x] Integrate with `packages/agent-runtime` for tool execution.
- [x] Implement approval gate logic in the backend.
- [x] Implement `ConfigStore` and Settings API (API Keys, Preferences).

## Track 2: [Agent UI](task-ui-chat.md) (UI & Chat Experience)
**Focus**: Visual polish, navigation, and core chat interaction.

- [x] Initialize React 19 SPA in `apps/cowork/src` with TanStack Router/Query.
- [x] Implement Workspace selection and Folder access granting.
- [x] Build the Chat Interface (Threaded context, message rendering).
- [x] Implement Sidebar navigation and Session history.
- [x] Set up design system tokens from `packages/app`.
- [x] Build `/settings` page (API Keys, Model Selection).

## Track 3: [Agent Workflow](task-workflow-artifacts.md) (Task Logic & Artifacts)
**Focus**: The "Task Mode" lifecycle and artifact-first UI components.

- [x] Implement Task State Machine (Plan → Execution → Review → Summary).
- [x] Build Approval UI (Risk tags, reason prompts, gate interaction).
- [x] Create Artifact Rendering components (Rich Diffs, Checklists, Plan cards).
- [x] Implement "Apply" handlers for code artifacts (tied to AI Envelope).
- [x] Build the Task Timeline and tool log observability.

---

## Dependencies & Milestones

1. **Milestone: Connectivity (Core + UI)**: UI can create a session and Backend persists it.
2. **Milestone: Planning (UI + Workflow)**: User submits a prompt, and a "Plan Artifact" renders.
3. **Milestone: Execution (Core + Workflow)**: Backend executes tools, and Workflow renders the timeline/diffs.
4. **Milestone: Feature Complete (All)**: Settings configured, full end-to-end flow working.
