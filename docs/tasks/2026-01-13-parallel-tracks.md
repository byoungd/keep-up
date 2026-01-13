# Keep Up Project Status & Parallel Execution Plan
**Date:** 2026-01-13
**Status:** Ready via `docs/tasks/2026-01-13-parallel-tracks.md`

## 1. Project Status Analysis

### 🟢 Delivered / Stable
*   **LFCC Bridge**: UI Contract is frozen (v1.0). Architecture is defined.
*   **Agent Runtime**: Basic event loop and optimization work (lazy init) is in progress/merged.
*   **UI Foundation**: "Linear-quality" aesthetic is being applied to AI Panel and general artifacts.
*   **Routes**: Basic structure exists for `reader`, `feeds`, `digest`, `topics`.

### 🟡 Risks / In-Progress
*   **Core Loop Reliability**: PRD specifically flagged "Reader entry" and "Import persistence" as P0 blockers. The existence of files doesn't guarantee the *flow* is bug-free.
*   **AI Grounding**: The PRD requirement for "Grounded Output & Citations" (FR4) is a critical differentiator but "ungrounded AI inputs" is a known issue.
*   **E2E Stability**: Recent history shows significant effort in fixing E2E tests, indicating potential brittleness in the test suite.

### 🔴 Missing / Blockers
*   **Living Briefs Integration**: While LFCC is frozen, the actual "Living Briefs" product feature (pinning, updating) needs end-to-end verification.
*   **Feed Provider Integration**: `SqliteFeedProvider` was implemented, but full integration with the UI for subscription management needs confirmation.

---

## 2. Parallel Development Tracks

Three distinct tracks are proposed to maximize velocity without collision.

### 🛤️ Track A: User Experience & Core Loop (Frontend Focus)
**Goal:** Restore and polish the "Reader Core Loop" (P0). Ensure users can reliably subscribe, read, and organize content.
**Context**: `apps/reader/app/[locale]/(feeds|reader|topics)`

#### Task A1: Feed Management UI Wire-up
*   **Description**: Connect the `SqliteFeedProvider` (already implemented in backend/core) to the Frontend `feeds` route. Replace mock data with real database queries via TRPC or Server Actions.
*   **Acceptance Criteria**:
    *   [x] "Add Feed" button accepts a generic RSS URL and validates it before saving.
    *   [x] Duplicate feeds are detected and rejected with a friendly toast message.
    *   [x] The `feeds` list page renders subscribed feeds with their latest fetch status (Healthy/Error).
    *   [x] Deleting a feed removes it from the list immediately (optimistic UI).

#### Task A2: Reader List & Detail View Polish
*   **Description**: Apply the "Linear-quality" design system to the Reader list. Ensure the transition from List -> Detail view is <100ms.
*   **Acceptance Criteria**:
    *   [x] Import via URL/Text appears in the list view within 5 seconds without manual refresh.
    *   [x] Clicking an item opens the `reader/[id]` route successfully (no 404s).
    *   [x] The Reader view supports basic "Mark as Read" and "Archive" actions that persist after reload.

#### Task A3: Topic Organization Flow
*   **Description**: Implement the `topics` route. Allow creating simple tag-based topics and mapping them to feeds or individual items.
*   **Acceptance Criteria**:
    *   [x] User can create a new Topic (e.g., "AI Infra") with a color/icon.
    *   [x] User can "Pin" a feed to a Topic.
    *   [x] The Topic Detail page shows an aggregated list of items from all pinned feeds.

---

### 🛤️ Track B: Intelligence & Grounding (Backend/Runtime Focus)
**Goal:** Implement the "Digest" generation and "Ask KU0" citation logic.
**Context**: `packages/agent-runtime`, `packages/ai-core`

#### Task B1: Digest Agent Orchestration
*   **Description**: Create `DigestAgent` in the runtime. It should accept a user ID and time window, fetch relevant unread items from `SqliteFeedProvider`, and cluster them by semantic similarity.
*   **Acceptance Criteria**:
    *   [ ] Agent can be triggered via a detailed generic "Plan" object.
    *   [ ] Output is a structured JSON: `Array<{ title, summary, items: [] }>` (Clusters).
    *   [ ] Deduplication logic runs successfully: similar articles from different feeds must be grouped in one cluster.

#### Task B2: Citation & Grounding Middleware
*   **Description**: Implement a middleware for the AI Core that intercepts LLM generation. It must verify that every claim in the generated text has a corresponding `[sourceId]` reference.
*   **Acceptance Criteria**:
    *   [ ] Middleware parses the LLM stream; if a sentence lacks a citation but looks factual, it injects a "Low Confidence" marker or flags it.
    *   [ ] Final JSON output guarantees that every `summary` field has a `citation` field containing valid URLs/IDs.
    *   [ ] "Ask KU0" responses explicitly link to the source document chunks (using `EvidenceAnchor`).

#### Task B3: Multi-Lane Model Support (BYOK)
*   **Description**: Implement the logic to switch between "Fast" (e.g., Haiku/Flash) and "Deep" (e.g., Opus/Pro) models based on user preference or task complexity.
*   **Acceptance Criteria**:
    *   [ ] Runtime configuration allows injecting different API keys for distinct model tiers.
    *   [ ] The "Consensus" lane executes 2 different models in parallel and returns a merged result (or highlights diff).

---

### 🛤️ Track C: Foundation & Collaboration (Infrastructure Focus)
**Goal:** Solidify LFCC (Living Briefs) and stabilize the Quality Assurance net.
**Context**: `packages/lfcc-bridge`, `e2e`, `scripts`

#### Task C1: Living Briefs E2E (Offline/Sync)
*   **Description**: Create a dedicated Playwright test suite for the "Living Brief" lifecycle. This is the critical "Collaboration" feature.
*   **Acceptance Criteria**:
    *   [ ] **Test Case 1**: User A creates a brief -> goes Offline -> edits content -> goes Online -> content is synced to Server.
    *   [ ] **Test Case 2**: User A and User B edit separate paragraphs; system merges without data loss.
    *   [ ] **Test Case 3**: Verify "Suggestion Mode" (Agent updates) appears as a tracked change/comment, not a direct overwrite.

#### Task C2: Bridge Performance Profiling
*   **Description**: Ensure the LFCC Bridge doesn't introduce typing latency.
*   **Acceptance Criteria**:
    *   [ ] Input latency in the Editor is <16ms (60fps) even with a document size of 50kb (approx 10 pages).
    *   [ ] Memory usage does not grow linearly with every keystroke (leak check).

#### Task C3: E2E Test Hardening
*   **Description**: Remove `any` casts from existing E2E tests and replace fixed timeouts with deterministic locators.
*   **Acceptance Criteria**:
    *   [ ] `annotator-reorder.spec.ts` passes 10/10 runs locally (flake-free).
    *   [ ] CI pipeline green for 3 consecutive commits.

---

## 4. Responsibility Boundaries (Do Not Touch)

To prevent code collisions and architectural drift, strict boundaries are defined:

### 🚫 Shared Boundaries
1.  **UI Contract (`docs/architecture/UI_CONTRACT.md`)**: Frozen. No changes allowed to strictness levels or exception lists without Principal Architect approval.
2.  **`packages/core` interfaces**: Defined interfaces for Data/Storage are stable. Do not refactor core entities (`Item`, `Feed`, `Brief`) unless strictly required.

### 🚫 Track A (Frontend) Limits
*   **Do Not Touch**: `packages/lfcc-bridge` internals (CRDT logic, Loro integration). Use the `DocumentFacade` or `Bridge` public API only.
*   **Do Not Touch**: Backend Agent Runtime logic (`packages/agent-runtime`). Integration should happen via stable API endpoints.

### 🚫 Track B (Backend/AI) Limits
*   **Do Not Touch**: React Components (`apps/reader/src/components`). AI logic must be delivered as structured JSON/streams; rendering is Frontend's job.
*   **Do Not Touch**: E2E Tests (`e2e/`). Focus on unit/integration tests for the runtime.

### 🚫 Track C (Infra) Limits
*   **Do Not Touch**: Product UI features. If a test fails due to a UI bug, file a ticket or fix the *test logic*, do not redesign the Component.
*   **Do Not Touch**: `docs/PRD.md`. Feature scope is fixed.

---

## 5. Recommended Immediate Action (Prompt)

Select one track to begin.
*   **If choosing A**: "Start by wiring up the `SqliteFeedProvider` to the `feeds` page UI."
*   **If choosing B**: "Implement the basic `DigestAgent` in `agent-runtime` that mocks fetching items and verifying citations."
*   **If choosing C**: "Write a new Playwright test for the 'Offline Brief Editing' flow to verify LFCC stability."
