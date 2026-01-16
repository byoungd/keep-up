# Task Prompt: Agent Core (Core & Infrastructure)

## 🎯 Objective
Build the **backend foundation** for `apps/cowork`. This agent owns the server process, data persistence, and tool orchestration.
**Goal**: A rock-solid, crash-proof local server that streams state to the frontend under 50ms latency.

## 🧱 Boundaries & Scope
- **IN SCOPE**:
  - `apps/cowork/server/*` (Hono server for Node/Edge runtimes).
  - Persistence layer interactions (`.keep-up/state`).
  - `packages/agent-runtime` integration.
  - API Schema definitions (shared types).
- **OUT OF SCOPE**:
  - UI Components (React).
  - Client-side state management (TanStack Query).
  - Implementing the actual tools (tools exist in runtime, you just orchestrate).

## 💎 Top-Tier Quality Standards
- **Zero Type Errors**: Strict `tsconfig.json`, no `any`.
- **Zod Everywhere**: All API inputs/outputs and DB schemas must be validated with Zod.
- **Auditable**: Every state change (Task created, Approval granted) must be logged.
- **Resilient**: Server must auto-recover from runtime errors; SSE must auto-reconnect.

## 📋 Requirements
1. **Server Setup**:
   - Initialize `apps/cowork/server/index.ts` using `Hono`.
   - Configure CORS and rigorous error handling middleware (JSON responses for all errors).
2. **Persistence Layer**:
   - Implement `SessionStore`, `TaskStore`, and `ApprovalStore` using `better-sqlite3` or a flat-file JSON adapter (start simple but interface-backed).
   - **Critical**: Ensure atomic writes for state updates.
3. **Configuration & Settings**:
   - Implement `ConfigStore` to persist user preferences (Model ID, Context Window size) and secrets (API Keys - stored securely/encrypted if possible).
   - Endpoints: `GET/PATCH /api/settings`.
4. **Agent Runtime Bridge**:
   - Create a `CoworkRuntime` class that wraps `packages/agent-runtime`.
   - Implement the **Cowork Policy Check**: before running *any* tool, check if it needs approval.
   - If approval needed -> pause execution -> emit `APPROVAL_NEEDED` event -> wait for API signal.
4. **SSE Streaming (High Performance)**:
   - Endpoint: `GET /api/sessions/:id/stream`.
   - buffer last 100 events in memory to support `Last-Event-ID` re-connection without gaps.

## ✅ Definition of Done
- [ ] Server starts via `pnpm -C apps/cowork/server dev` on port 3000 (proxied by Vite later).
- [ ] `curl localhost:3000/api/health` returns 200 OK.
- [ ] Creating a session via POST returns 201 and persists to disk.
- [ ] SSE endpoint connects and pushes a "hello" event.
- [ ] Unit tests cover the `CoworkRuntime` policy check logic.
