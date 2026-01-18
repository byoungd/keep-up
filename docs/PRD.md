# KU0 · Keep Up (Cowork) — Product Requirements Document (PRD)

> [!IMPORTANT]
> **Scope Refined (2026-01-18)**: This product is strictly the **Cowork App**.
> Previous concepts of "Reader", "RSS Portal", or "Digest App" are removed or deprecated.
> **Core Value**: Local-first agentic task execution.

- **Product:** KU0 Cowork
- **Type:** Agentic Workspace
- **Version:** v2.0 (Pivot)
- **Status:** Active Implementation

---

## 1. Executive Summary

**KU0 Cowork** is a **local-first agentic workspace** that allows technical users to collaborate with AI agents to complete complex tasks.

Unlike chat interfaces or "copilots" that just generate text, Cowork provides a **runtime environment** where agents can:
1.  **Plan**: Break down requests into step-by-step Execution Plans.
2.  **Act**: Execute real tools (File I/O, Command Line, Search) in a sandboxed safety layer.
3.  **Collaborate**: Request explicit user approval for sensitive actions.
4.  **Persist**: Store context, artifacts, and history locally (Local-First).

**The "App" is effectively a UI wrapper around the `agent-runtime`, providing the "Human-in-the-loop" control plane.**

---

## 2. Core Value Proposition

1.  **Beyond Chat**: We do not want a chatbot. We want an **employee** that runs on our machine.
2.  **Provider Agnostic**: "Bring Your Own Key" (BYOK). Use OpenAI for reasoning, Anthropic for coding, and local Llama for privacy. Cowork orchestrates them all.
3.  **Safety First**: Agents operate within strict granular policies (Tools, Paths, Approvals). The user is always in control.
4.  **Tangible Artifacts**: Output is not just a chat bubble; it is a File, a PR, a Document, or a structured Report.

---

## 3. Goals & Success Metrics

### 3.1 Primary Goals
1.  **Ship the Cowork App**: A standalone Desktop/Web app (`apps/cowork`) that interfaces with `agent-runtime`.
2.  **Robust Orchestration**: Ensure the UI correctly streams agent events (Thought -> Plan -> Tool -> Result).
3.  **Transparent Governance**: The user must see *exactly* what the agent wants to do and approve/deny it.
4.  **Project Context Awareness**: The agent must understand the repository it is working in (`docs/tasks`, file structure).

### 3.2 Success Metrics
- **Task Completion Rate**: % of user requests that result in a successfully completed task (verified by user).
- **Safety**: 0 unauthorized file modifications.
- **Latency**: UI updates < 50ms after an agent event.

---

## 4. Key Capabilities (MVP)

### 4.1 The "Session"
- A persistent workspace where User and Agent collaborate.
- Stores: Chat history, Tool interactions, Approvals, Draft Artifacts.
- Local-first persistence (SQLite/JSON).

### 4.2 The "Agent" (Runtime)
- **Orchestrator**: Manages the loop (Plan -> Act -> Observe).
- **Skill Registry**: Coding, Research, Data Analysis skills.
- **Model Routing**: Dynamically selecting the best model for the current step.

### 4.3 The "Control Plane" (Approvals)
- **Sensitive Operations**: Write File, Execute Command.
- **UX**: Before executing, the Agent pauses. The UI shows a "Request Approval" card. User clicks "Approve" or "Reject".

### 4.4 Artifacts
- Agents produce **Artifacts** (Markdown docs, Code patches, Diagrams).
- UI renders these distinctly from chat messages.
- Artifacts can be iterated upon.

---

## 5. User Journey

1.  **Setup**: User opens Cowork, points it to a local folder (Project).
2.  **Task**: User types: "Analyze the 'auth' package and propose a refactor to remove legacy tokens."
3.  **Plan**: Agent responds with a "Plan Artifact": "I will scan files X, Y, Z, then draft a plan."
4.  **Action**: Agent asks: "Can I run `grep` on these files?" -> User Approves.
5.  **Result**: Agent reads files, thinks, and produces: "Implementation Plan.md".
6.  **Mutation**: User types: "Looks good, apply it." -> Agent asks permission to `write_file`. -> User Approves.

---

## 6. Architecture Alignment

- **Frontend**: `apps/cowork` (React 19, TanStack Router/Query).
- **Backend (BFF)**: Hono server (embedded).
- **Core**: `packages/agent-runtime` (The brain).
- **Protocol**: Server-Sent Events (SSE) for real-time agent streams.

---

## 7. Out of Scope (Deprecated)

- **RSS Reader / Feed Aggregator**: Not the core product.
- **Public "News" Digest**: Not the core product.
- **Social Features**: Not the core product.
- **Hosting / Cloud Sync**: MVP is Local-First.

---

## 8. Roadmap Priorities

1.  **`apps/cowork` Implementation**: Build the UI shell, Chat interface, and Approval cards.
2.  **Runtime Integration**: Wire `agent-runtime` into the Cowork BFF.
3.  **Project Context**: Ensure the agent can "see" the user's project files.
