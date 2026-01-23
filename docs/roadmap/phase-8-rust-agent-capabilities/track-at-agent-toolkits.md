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

## Scope

- File and note operations (create, read, append, list).
- Markdown conversion for PDF, HTML, Office, and text.
- Document generation for PPTX and Excel.
- Media toolkits for image and audio analysis (provider-backed).
- Local web deploy for previewing generated content.

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
