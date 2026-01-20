# Cowork Testing Strategy

> **Goal**: Ensure reliability of the "Cowork" experience.
> **Tools**: **Vitest** (Unit/Integration) and **Playwright** (E2E).

**Related Specs:**
- [UI Quality Gates](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-ui-quality-gates.md) — Verification checks
- [Data Flow Spec](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-data-flow-spec.md) — State to test
- [Error Handling](file:///Users/han/Documents/Code/Parallel/keep-up/docs/specs/cowork/cowork-error-handling.md) — Error scenarios to cover

---

## 1. Unit Testing Strategy (Vitest)

We prioritize testing **Business Logic** and **State Reducers**.

### 1.1 Critical Paths
*   **State Reducers**: `coworkReducer` MUST be pure and tested with complex event sequences.
*   **Prompt Builders**: Test that context injection logic produces expected prompts.
*   **Data Parsers**: Verify robust parsing of partial JSON from LLMs.

### 1.2 "No-DOM" Policy
Keep logic out of React Components.
*   ❌ Bad: Testing complex logic inside `useEffect` via React Testing Library.
*   ✅ Good: Extracting logic to `useCoworkLogic` hook or pure functions and testing those.

## 2. E2E Testing Strategy (Playwright)

We simulate the **User Journey**.

### 2.1 Critical User Flows (P0)
1.  **" The Happy Path"**:
    *   Start Session -> Send Prompt -> Agent Thinks -> Agent Acts -> Task Complete.
    *   Verify: Artifacts appear in the UI. Cost meter updates.
2.  **"The Correction"**:
    *   Agent proposes Plan -> User Rejects -> Agent Re-plans -> User Approves.
3.  **"Stop & Resume"**:
    *   Start Task -> Click Stop (Verify immediate halt) -> Click Resume.

### 2.2 Mocking vs Real
*   **CI Environment**: Use **Mocked LLM Responses**. We record "Golden Path" traces (using `pollyjs` or custom interceptor) to ensure deterministic CI.
*   **Nightly**: Run against **Real LLM** (cheaper model like `gpt-4o-mini`) to catch schema drift.

## 3. Test Structure

```
tests/
  ├── e2e/
  │   ├── flows/
  │   │   ├── happy-path.spec.ts
  │   │   └── correction.spec.ts
  │   └── fixtures/
  │       └── mock-llm-responses.json
packages/
  ├── agent-runtime/
  │   └── src/__tests__/
  └── agent-runtime-tools/
      └── src/tools/code/__tests__/
```

## 4. Quality Gates
*   **Pre-Commit**: Unit Tests (Changed files only).
*   **PR Check**: All Unit Tests + Critical E2E (Mocked).
*   **Nightly**: Full E2E (Real Network).
