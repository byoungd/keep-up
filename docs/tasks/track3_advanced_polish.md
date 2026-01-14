# Track 3: Advanced Polish (Project Crystal Mind)

**Objective:**
Implement the "Trust" layer of the application. The AI agents must verify every claim and synthesize high-signal digests.

**Context:**
-   PRD P0: "No digest without citations".
-   The `agent-runtime` provides the tools, but we need to configure the specific *Agents*.

**Key Requirements:**
1.  **Verification Agent:**
    -   Create a `Verifier` agent config.
    -   Input: A claim + Source text.
    -   Output: Boolean (Verified/Hallucinated) + Evidence Snippet.
    -   *Tech:* `packages/agent-runtime/src/agents`.

2.  **Digest Synthesis Loop:**
    -   Implement the "Map-Reduce" style summarization:
        -   Map: Summarize each article with citations.
        -   Reduce: Cluster related summaries into a `DigestCard`.
    -   Ensure the `Synthesizer` uses the `Verifier` to check its own output.

3.  **Parallel Execution:**
    -   Utilize `packages/agent-runtime` parallel execution for processing multiple feeds simultaneously.

**Files of Interest:**
-   `packages/agent-runtime/src/orchestrator/orchestrator.ts`
-   `packages/agent-runtime/src/agents/*`
-   `packages/ai-core/src/prompts/*`

**Deliverables:**
-   [ ] `VerifierAgent` implementation.
-   [ ] `DigestSynthesis` pipeline configuration.
-   [ ] Integration test: Feed -> Digest -> Verified Citation.
