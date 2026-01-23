# Open Wrap - Claude Code Configuration

## Project Overview

**Name**: Open Wrap (legacy docs may say "Keep-Up" or "Reader")
**Stack**: TypeScript, React 19, pnpm monorepo, Turbo, Vite (Cowork), Rust (native accelerators)
**Core App**: `apps/cowork` (server + UI)
**LFCC Stack**: LFCC (Local-First Collaboration Contract) editor with Loro CRDT
**Namespace**: `@ku0/*` (TS), `ku0-*` (Rust crates)

## Quick Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev:cowork` | Start cowork app (vite) |
| `pnpm build` | Build all packages |
| `pnpm test:unit` | Run unit tests (vitest) |
| `pnpm lint` | Run biome + turbo lint |
| `pnpm typecheck` | TypeScript type check |
| `pnpm biome check --write` | Format & auto-fix |
| `cargo build --release` | Build Rust crates |
| `cargo test` | Run Rust tests |
| `cargo clippy` | Rust linting |

## Code Standards (Critical)

- **TypeScript only** - No `.js` files
- **Rust for performance** - OS-level isolation, tokenization, storage engine
- **No `any`** - Use `unknown` or proper types
- **No `var`** - Use `const` (default) or `let`
- **Biome** - Run `biome check --write` before commits
- **Clippy** - Run `cargo clippy` for Rust code
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
├── cowork/              # Core app (server + UI)
└── desktop/             # Desktop app (Tauri/Electron wrapper)

packages/
├── core/                # LFCC kernel, sync engine, persistence
├── lfcc-bridge/         # ProseMirror <-> LFCC adapter
├── agent-runtime/       # AI agent orchestration & MCP tools
├── ai-core/             # AI provider abstractions (OpenAI, etc.)
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
docs/                    # Product specs & documentation
```

## Key Documents

- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Full coding rules
- [Agents.md](./Agents.md) - AI collaboration protocol
- [.agent/](./.agent/) - Agent specs, quality gates, workflows
- [docs/product/](./docs/product/) - Product specs & LFCC protocol
- [docs/architecture/UI_CONTRACT.md](./docs/architecture/UI_CONTRACT.md) - UI ↔ LFCC Bridge contract
- [docs/roadmap/phase-6-rust-native/](./docs/roadmap/phase-6-rust-native/) - Rust native integration roadmap

## LFCC Rules (Non-Negotiable)

1. **Determinism**: `f(state, op) -> state` must be pure
2. **No silent drift**: Annotations fail-closed if uncertain
3. **UTF-16 indices**: All text offsets use UTF-16 code units
4. **Block ID rules**: Split=left keeps ID, Join=left keeps ID
5. **Loro only**: Single CRDT source of truth, no Yjs
6. **UI Contract**: UI depends on PM schema/Bridge API only, never direct Loro access

## E2E Testing Strategy

Follow `.agent/workflows/e2e-test.md` when E2E applies.  
If a change is limited to docs or non-E2E areas, use unit/integration tests (Vitest) or note "Not run (docs-only)".
