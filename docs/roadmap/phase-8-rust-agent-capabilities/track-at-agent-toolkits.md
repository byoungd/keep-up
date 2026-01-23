# Track AT: Agent Toolkit Library (Rust)

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime Team
> Dependencies: Track AQ gateway
> Estimated Effort: 3 weeks

---

## Overview

Implement the core agent toolkits in Rust to match the capability surface observed in
Eigent. Toolkits include document processing, data manipulation, media analysis, and
lightweight web deployment for previews.

## Architecture Context

- Product context: Open Wrap. Toolkits execute inside the runtime tool gateway.
- Runtime boundary: Rust executes all toolkit logic and file system mutations.
- TypeScript registers tool schemas and surfaces artifacts.

## Scope

- File and note operations (create, read, append, list).
- Markdown conversion for PDF, HTML, Office, and text.
- Document generation for PPTX and Excel.
- Media toolkits for image and audio analysis (provider-backed).
- Local web deploy for previewing generated content.

## Out of Scope

- Full UI for document editing (handled in `apps/cowork`).
- Cloud storage connectors.
- Model routing (Track AS).

## Deliverables

- `packages/agent-toolkit-rs/` crate with modular toolkit APIs.
- Rust adapters in `packages/agent-runtime-tools/` for tool invocation.
- Structured artifacts for toolkit outputs (files, reports, charts).
- Capability registry entries for each toolkit.

## Technical Design

### Toolkit Modules

- `file`: atomic writes, safe paths, encoding guards.
- `note`: markdown notes with registry index.
- `convert`: PDF, Office, HTML to markdown.
- `pptx`: slide creation and template support.
- `excel`: worksheets, tables, and charts.
- `media`: image and audio analysis via model fabric.
- `web_deploy`: local preview server with static assets.

### Rust-First Boundary

- Rust executes all toolkit logic and file system mutations.
- TypeScript passes high-level intents and renders artifacts.

## Implementation Spec (Executable)

This section is the authoritative execution guide. Follow it exactly to implement Track AT.

### 1) Data Model and Serialization

All JSON payloads use `camelCase` fields. Enums are serialized as `snake_case`.

Reuse `ArtifactEnvelope` and `ArtifactType` from `packages/agent-runtime-core/src/index.ts`.

Tool invocation payloads are JSON and must validate against tool schemas registered via
Track AQ (`MCPTool` + `JSONSchema`).

### 2) Toolkit APIs and Tool Names

Tools are registered into the Tool Gateway with the following canonical names:

- File toolkit:
  - `file.read` { path }
  - `file.write` { path, content, encoding? }
  - `file.append` { path, content }
  - `file.list` { path, pattern?, recursive? }
- Note toolkit:
  - `note.create` { title, content? }
  - `note.append` { noteId, content }
  - `note.list` { query? }
- Conversion toolkit:
  - `convert.toMarkdown` { sourcePath, format }
- PPTX toolkit:
  - `pptx.create` { title, slides[] }
- Excel toolkit:
  - `excel.create` { title, sheets[] }
- Media toolkit:
  - `media.analyzeImage` { imagePath, prompt?, modelRouteId? }
  - `media.analyzeAudio` { audioPath, prompt?, modelRouteId? }
- Web deploy toolkit:
  - `web.deploy` { path, port? }

### 3) File Safety Rules

- All paths are resolved against a workspace root provided by the runtime.
- Reject path traversal (`..`) and absolute paths outside the root.
- `file.write` and `file.append` use atomic write + rename.
- Default encoding is UTF-8; binary writes require explicit base64 encoding.

### 4) Deterministic Outputs

- Markdown conversion output must be deterministic (stable ordering, normalized whitespace).
- PPTX/Excel generators must produce deterministic artifact metadata (same inputs => same outputs).
- Media analysis must return a deterministic summary and include provider/model ids.

### 5) Artifacts

- Any tool that writes files returns an `ArtifactEnvelope` describing the created output.
- Artifacts include type, path, size, and checksum (SHA-256 hex).

### 6) FFI Boundary (Rust <-> Node)

Expose N-API class `AgentToolkitRegistry`:

- `registerAllTools()` (registers toolkit tools into Tool Gateway)
- `invoke(toolName, payload) -> ToolResult`
- `getToolList() -> MCPTool[]`
- `reset()`

Node loader:
- `@ku0/agent-toolkit-rs/node` uses `@ku0/native-bindings`.
- Env overrides: `KU0_AGENT_TOOLKIT_NATIVE_PATH` and `KU0_AGENT_TOOLKIT_DISABLE_NATIVE=1`.
- Required export: `AgentToolkitRegistry`.

### 7) TypeScript Integration

- `packages/agent-runtime-tools` uses the registry to register tool schemas and handlers.
- Tool outputs are stored via `agent-runtime-persistence` artifacts APIs.

### 8) Tests (Required)

Rust unit tests:
- Path safety rejects traversal.
- File write/read round-trips.
- Deterministic markdown conversion (snapshot test).

TypeScript validation:
- `packages/agent-runtime-tools` typecheck passes.

### 9) Validation Commands

- `cargo test` (in `packages/agent-toolkit-rs`)
- `pnpm -C packages/agent-runtime-tools typecheck`
- `pnpm biome check --write`

### 10) Definition of Done

- Toolkit tools are registered in the Tool Gateway.
- File operations are safe and deterministic.
- Conversion, PPTX, Excel, and media outputs emit artifacts.
- Native binding is callable from the runtime.

## Implementation Plan

| Week | Focus | Outcomes |
| :--- | :--- | :--- |
| 1 | File and note toolkit | safe IO, registry, tests |
| 2 | Document toolkit | markdown conversion, PPTX, Excel |
| 3 | Media and deploy toolkit | analysis adapters, local preview |

## Affected Code

- `packages/agent-runtime-tools/`
- `packages/agent-runtime-memory/`
- `packages/agent-toolkit-rs/` (new)

## Acceptance Criteria

- Create and update files with deterministic outputs.
- Convert PDFs and HTML to markdown with stable formatting.
- Generate PPTX and Excel artifacts via toolkit APIs.
- Produce image or audio analysis results via model fabric.

## Risks

- Cross-platform file handling edge cases.
- Media analysis cost control and quota enforcement.

## References

- `.tmp/analysis/eigent/docs/core/workforce.md`
- `.tmp/analysis/eigent/docs/core/workers.md`
