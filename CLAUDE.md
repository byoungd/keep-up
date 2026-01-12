# Keep-Up Reader - Claude Code Configuration

## Project Overview

**Name**: Keep-Up Reader
**Stack**: TypeScript, Next.js 15, React 19, pnpm monorepo, Turbo
**Core**: LFCC (Local-First Collaboration Contract) editor with Loro CRDT
**Namespace**: `@keepup/*`, `@keepup/*`

## Quick Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start dev server (reader app) |
| `pnpm dev:desktop` | Start reader + desktop app |
| `pnpm build` | Build all packages |
| `pnpm test:unit` | Run unit tests (vitest) |
| `pnpm test:e2e:smoke` | Quick E2E sanity check |
| `pnpm test:e2e:core` | Editor/selection E2E tests |
| `pnpm test:e2e:collab` | Collaboration E2E tests |
| `pnpm lint` | Run biome + turbo lint |
| `pnpm typecheck` | TypeScript type check |
| `pnpm biome check --write` | Format & auto-fix |

## Code Standards (Critical)

- **TypeScript only** - No `.js` files
- **No `any`** - Use `unknown` or proper types
- **No `var`** - Use `const` (default) or `let`
- **Biome** - Run `biome check --write` before commits
- **React buttons** - Always add `type="button"`
- **Array keys** - Use unique IDs, never indices
- **Loops** - Use `for...of`, not `forEach`
- **Loro only** - No Yjs or other CRDTs

## Accessibility Standards (A11y)

- **Icon-only buttons** - Always add `aria-label` for buttons containing only icons
- **Form inputs** - Add `aria-label` or associate with `<label>` element
- **Range inputs** - Always provide `aria-label` describing the control
- **Interactive elements** - Use semantic elements (`<button>`, `<a>`) instead of `<div>` with click handlers
- **Scrollable regions** - Add `tabIndex={0}` with `biome-ignore` comment for keyboard navigation
- **Landmarks** - Only one `<main>` per page; use `<article>`, `<section>`, `<aside>` for sub-regions
- **Color selectors** - Use `<button>` with `aria-label` describing the color, wrap in `role="radiogroup"`

## Architecture

```
apps/
├── reader/              # Next.js 15 web application
├── collab-server/       # WebSocket collaboration server
└── desktop/             # Desktop app (Tauri/Electron wrapper)

packages/
├── core/                # LFCC kernel, sync engine, persistence
├── lfcc-bridge/         # ProseMirror <-> LFCC adapter
├── agent-runtime/       # AI agent orchestration & MCP tools
├── ai-core/             # AI provider abstractions (OpenAI, etc.)
├── collab-server/       # Collaboration server library
├── conformance-kit/     # LFCC v0.9 conformance testing (fuzz + semantic)
├── overlay/             # Overlay/annotation rendering
├── app/                 # Shared React app components
├── shared/              # Shared utilities (cn, tailwind-merge)
├── db/                  # Database layer (IndexedDB/SQLite)
├── crypto/              # Cryptographic utilities
├── token/               # Tokenization utilities
├── translator/          # Translation services
├── tts/                 # Text-to-speech
├── ingest-youtube/      # YouTube caption ingestion
├── bench/               # Performance benchmarks
└── compat/              # Compatibility tests (IME, mobile)

e2e/                     # Playwright E2E tests
docs/                    # Product specs & documentation
```

## Key Documents

- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Full coding rules
- [Agents.md](./Agents.md) - AI collaboration protocol
- [.agent/](./.agent/) - Agent specs, quality gates, workflows
- [docs/product/](./docs/product/) - Product specs & LFCC protocol

## LFCC Rules (Non-Negotiable)

1. **Determinism**: `f(state, op) -> state` must be pure
2. **No silent drift**: Annotations fail-closed if uncertain
3. **UTF-16 indices**: All text offsets use UTF-16 code units
4. **Block ID rules**: Split=left keeps ID, Join=left keeps ID
5. **Loro only**: Single CRDT source of truth, no Yjs

## E2E Testing Strategy

**Never run full E2E suite during development.** Use targeted tests:

| Changed Area | Command |
|--------------|---------|
| Editor, formatting, selection | `pnpm test:e2e:core` |
| Block NodeView, drag-drop | `pnpm test:e2e:blocks` |
| Collab, WebSocket, sync | `pnpm test:e2e:collab` |
| Annotations, highlights | `pnpm test:e2e:annotations` |
| Import, AI, persistence | `pnpm test:e2e:features` |
| Quick sanity check | `pnpm test:e2e:smoke` |
| Accessibility | `pnpm test:e2e:a11y` |
