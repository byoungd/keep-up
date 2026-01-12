# Contributing Guide

Welcome! We are building a **reliable, local-first collaborative editor**. This project adheres to the **Local-First Collaboration Contract (LFCC) v0.9 RC**.

## 1. Getting Started

1.  **Clone the repo**:
    ```bash
    git clone <repo-url>
    cd English-level-up-tips
    ```
2.  **Install dependencies**:
    ```bash
    pnpm install
    ```
3.  **Install Playwright browsers (one-time)**:
    ```bash
    pnpm exec playwright install
    ```
4.  **Run Tests**:
    ```bash
    pnpm test
    ```
5.  **Run Web App**:
    ```bash
    pnpm dev:reader
    ```
6.  **Run Desktop App** (requires the web dev server):
    ```bash
    pnpm dev:desktop
    ```

## 2. Development Workflow

*   **Feature Branches**: Create branches from `main` (e.g., `feat/new-block-type`).
*   **PR Process**: All PRs strictly require passing the **Conformance Gates**.

## 3. Conformance & Testing (Required)

Because this is a distributed system, "it works on my machine" is not enough. You must pass the **LFCC Conformance Suite**.

### 3.0 Test Commands
*   **Unit tests**: `pnpm test:unit`
*   **E2E tests**: `pnpm test:e2e`
*   **CI full suite**: `pnpm test:ci`
*   **Lint**: `pnpm lint`
*   **Typecheck**: `pnpm typecheck`

### 3.1 Mode B "Semantic Double-Blind"
We use a "Shadow Model" architecture to verify correctness.
*   **What it does**: Runs your operation on the Real Editor AND the Shadow Model.
*   **Check**: Canonicalizes both outputs. They **MUST** be identical.
*   **Failure**: If they drift, the test fails. Check `impl.canonicalize(editorState)` implementations.

### 3.2 Fuzzing
*   We run randomized fuzz tests (interleaved operations from multiple simulated users).
*   **Requirement**: Zero critical determinism failures across 10k fuzz cases.
*   **Seeds**: If a fuzzer fails, it provides a `seed`. Add this seed to the regression suite.

### 3.3 AI Safety Checks
If you touch the AI Gateway or Bridge:
*   Ensure **Dry-Run** tests pass.
*   Verify that `malicious` payloads (scripts, iframes) are correctly stripped or rejected.

## 4. Debugging Tools

The project includes a **Developer Overlay** in the UI.
*   **Force Full Integrity Scan**: Button available in DevTools. Runs a full reconciliation check between the View and the CRDT.
*   **State Visualization**: Shows the internal state of Annotations (`active_unverified`, `broken_grace`, etc.).

## 5. Documentation

*   **Architecture Truth**: `docs/product/Local-First_Collaboration_Contract_v0.9_RC.md` is the Single Source of Truth.
*   **Updates**: If you change behavior that contradicts the LFCC, you **MUST** update the RFC/Spec first. Code follows Spec.

## 6. Collaborating with AI Agents

This project uses a "Multi-Agent" simulation for development. As a human, your role is **Architect & Reviewer**.

### 6.1 Workflow
1.  **Assign Task**: Update `task.md` with your request.
2.  **Review Plan**: The Agent (PM/Architect persona) will generate `implementation_plan.md`. **Read this carefully**.
    *   If you agree, approve.
    *   If you disagree, ask for a revision *before* any code is written.
3.  **Verify Result**: After the Agent (Developer persona) finishes, it produces `walkthrough.md`.
    *   Use this to check the work.
    *   Run the verification steps manually if needed.

### 6.2 Artifacts
*   `task.md`: The living backlog.
*   `implementation_plan.md`: The contract for the next batch of work.
*   `walkthrough.md`: The proof of work.
