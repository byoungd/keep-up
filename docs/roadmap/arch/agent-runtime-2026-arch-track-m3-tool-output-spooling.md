# Track M3: Tool Output Spooling and Truncation

Owner: Runtime Architect + Runtime Developer
Status: Ready
Date: 2026-01-19
Timeline: Week 4+

## Objective
Add deterministic tool output spooling and truncation to prevent context blowups while preserving
full output for audit and recovery.

## Dependencies
- docs/roadmap/agent-runtime-2026-track-l-architecture.md
- docs/architecture/agent-runtime-module-decomposition-rfc.md
- `@ku0/agent-runtime-core`
- `@ku0/agent-runtime-execution`
- `@ku0/agent-runtime-persistence`

## Scope
- Define spooling policy (max bytes/lines) and metadata schema.
- Persist full tool outputs to deterministic storage locations.
- Return truncated output to the LLM with explicit disclosure and file reference.
- Ensure spooling is deterministic and auditable.

## Non-Goals
- Changing tool execution policies (Track B).
- Modifying AI Envelope behavior (Track G).

## Responsibilities
- Architect: define truncation policy and disclosure format.
- Dev: implement spooling in execution pipeline.
- QA: validate truncation correctness and stored artifacts.

## Key Deliverables
- Spooling policy and metadata schema.
- Output store in persistence package (file-based or adapter).
- Execution pipeline applies truncation and references spool files.
- Tests for large outputs and deterministic paths.

## Tasks
1. Define `ToolOutputSpooler` interface in core (if missing).
2. Implement spool storage in persistence package.
3. Apply spooling in tool executor or turn executor for large outputs.
4. Include explicit truncation disclosure and file reference in tool response.
5. Add tests for truncation thresholds and spool file contents.

## Acceptance Criteria
- Tool outputs over threshold are truncated with a clear disclosure.
- Full output is persisted with deterministic naming.
- Tool responses include a reference to the spooled output.
- No direct cross-plane imports outside core interfaces.

## Required Tests
- Unit tests for spooling and truncation policy.
- Integration test with a large tool output.

## Branch and PR Workflow
- Create branch: `feature/agent-runtime-2026-track-m3-tool-spooling`
- Run required tests, commit, open PR with spooling policy notes
