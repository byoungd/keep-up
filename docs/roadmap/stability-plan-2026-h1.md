# Stability Plan (2026 H1)

## Goal
Reach a stable, top-tier release by hardening reliability, observability, and agent autonomy while keeping PRs small, tested, and reviewable.

## Stability Criteria
- 99%+ successful task runs in normal workloads (no crash / no unrecoverable error).
- Automatic recovery from transient failures (storage, tool, network) with retries.
- End-to-end observability: request IDs, correlation IDs, latency metrics, and compaction metrics.
- Targeted test coverage for runtime-critical paths (orchestrator, MCP server lifecycle, session persistence).

## Execution Loop (PR-per-task)
1. Define a single scoped task and expected outcome.
2. Create a new branch: `<type>/<task-slug>`.
3. Implement changes and add targeted tests.
4. Run `pnpm biome check --write` and relevant unit tests.
5. Open a PR with summary, tests, and risks.
6. After merge, re-evaluate and queue next task.

## Roadmap Loops

### Loop 0: Analysis (this PR)
- [x] Competitive analysis summary
- [x] Stability criteria + delivery loop

### Loop 1: Request Observability (cowork server)
- [ ] Add request ID middleware with per-request logs and latency
- [ ] Propagate correlation IDs to runtime errors
- [ ] Add tests for request ID propagation

### Loop 2: MCP Server Health + Backoff
- [ ] Add health state + retry/backoff to MCP server manager
- [ ] Emit MCP health events and surface in routes
- [ ] Add unit tests for failure recovery + cooldown

### Loop 3: Persistence Resilience
- [ ] Add bounded retry queue for checkpoint/session persistence
- [ ] Add telemetry on persistence failures and recoveries
- [ ] Add tests for retry and failure handling

### Loop 4: Runtime Reliability Tests
- [ ] Add route tests for approvals flow error paths
- [ ] Add SSE stream route tests with replay and unsubscribe
- [ ] Add scheduler/task queue fairness tests

## Initial Task Candidates (Ranked)
1. Request observability middleware (fast, high impact)
2. MCP server health + backoff (core reliability)
3. Persistence retry queue (data safety)
4. Missing high-risk tests (approvals, stream, scheduler)

