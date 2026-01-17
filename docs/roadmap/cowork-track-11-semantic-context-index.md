# Track 11: Semantic Context Indexing (Context Packs)

> [!TIP]
> **Parallel Execution**
> This track is independent of the Phase F architecture changes and can be developed in parallel.


## Mission
Provide fast semantic retrieval of project context so agents can pull relevant
code and documentation without manual file selection.

## Primary Goal
Ship a local context index that powers semantic search and reusable context packs
for agent sessions.

## Background
Top IDE agents (Cursor, OpenCode) build a semantic index to reduce prompt waste
and increase accuracy on multi-file changes. A context pack acts like a curated
bundle of snippets that can be reused across tasks and shared in a project.

## Scope
- Local indexing pipeline for source files and docs.
- Embedding generation and storage.
- Semantic query API with ranking.
- Context pack creation and management.
- UI for search, preview, and pinning packs.
- Budget-aware prompt injection (token-limited).

## Non-Goals
- Full program analysis or AST-level refactors.
- Cross-project global search.
- External hosted indexing service.

## Inputs and References
- Track 8 (Project Context baseline)
- Track 7 (Provider metadata for embeddings)
- `packages/agent-runtime/src/core/orchestrator.ts`
- `apps/cowork/server/routes/chat.ts`

## Execution Steps (Do This First)
1. Define index schema:
   ```ts
   interface ContextChunk {
     id: string;
     sourcePath: string;
     content: string;
     tokenCount: number;
     embedding: number[];
     updatedAt: number;
   }

   interface ContextPack {
     id: string;
     name: string;
     chunkIds: string[];
     createdAt: number;
     updatedAt: number;
   }
   ```
2. Add file scanning + chunking with ignore rules.
3. Implement embedding provider abstraction (local or remote).
4. Store embeddings in a local DB (sqlite or vector-lite).
5. Build query API: `POST /api/context/search`.
6. Add context pack CRUD: `GET/POST/PUT/DELETE /api/context/packs`.
7. Inject top-ranked chunks into system prompt within a token budget.

## Required Behavior
- Search returns ranked, deterministic results for a query.
- Index updates incrementally on file changes.
- Context packs can be pinned to sessions.
- Prompt injection respects a token budget and truncates safely.

## Implementation Outline
1. Create `packages/context-index` for scanning, chunking, embeddings.
2. Add a storage layer for chunks + packs.
3. Wire server routes for search and packs.
4. Add UI search/pin workflow in Cowork settings.
5. Inject selected pack into `coworkTaskRuntime.ts`.

## Deliverables
- Context index package with search API.
- Context pack CRUD endpoints.
- UI for search, preview, and pinning.
- Prompt injection logic with token budgets.

## Acceptance Criteria
- [ ] Search returns relevant matches for a query within 200ms on medium repos.
- [ ] Packs can be created, renamed, and reused across sessions.
- [ ] Agent responses cite context pack usage in metadata.
- [ ] Index updates incrementally without full re-scan.

## Testing
- Unit tests for chunking + ranking.
- Integration tests for search API.
- UI tests for pack creation and injection.
- `pnpm vitest run --project context-index`

## Dependencies
- Track 8 for base project metadata.
- Track 7 for embedding providers.

## Owner Checklist
- Follow `CODING_STANDARDS.md`.
- Update `task.md` progress markers.
- Document manual verification steps in `walkthrough.md`.
