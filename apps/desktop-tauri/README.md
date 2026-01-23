# Desktop Tauri Shell

Tauri shell for the Cowork desktop app. The UI is served from `apps/cowork` in dev and built from
`apps/cowork/dist` for production.

## Development

```bash
# From repo root
pnpm dev:desktop
```

This starts:
- Cowork API server (`apps/cowork/server`)
- Tauri shell (which boots the Cowork Vite dev server via `beforeDevCommand`)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
