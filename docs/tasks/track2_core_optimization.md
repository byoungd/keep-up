# Track 2: Core Simplification (Project Iron Core)

**Objective:**
Ensure the "Core Loop" (Ingestion -> Storage -> Retrieval) is bulletproof and simple. Remove "magic" and replace with robust, typed pipelines.

**Context:**
-   Data ingestion is the lifeblood of the app.
-   `packages/ingest` and `packages/core` must communicate seamlessly.
-   We need to prevent "silent failures" where feeds stop updating.

**Key Requirements:**
1.  **Robust Ingestion Pipeline:**
    -   Review `IngestManager` in `packages/ingest`.
    -   Implement explicit **Retry Policies** (exponential backoff) for failed RSS fetches.
    -   Add structured logging for every ingest stage (Fetch -> Parse -> Norm -> Save).

2.  **Data Persistence refinement:**
    -   Verify `packages/db` schema for `Articles` / `Feeds`.
    -   Ensure `Deduplication` (checking `guid` or `url` hash) happens *before* expensive processing.
    -   Optimize query performance for "Get Unread Items".

3.  **Simplification:**
    -   Identify any circular dependencies between `core` and `ingest`.
    -   Refactor complex classes into pure functions where possible.

**Files of Interest:**
-   `packages/ingest/src/manager.ts` (or similar)
-   `packages/core/src/persistence/*`
-   `packages/db/schema.prisma` (if applicable)

**Deliverables:**
-   [ ] Refactored `IngestManager` with error handling.
-   [ ] Optimization report for DB queries.
-   [ ] Unit tests for the Ingestion Pipeline.
