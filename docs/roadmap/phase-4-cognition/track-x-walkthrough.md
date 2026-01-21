# Track X Walkthrough: Deep Code Perception

## Goal
Validate LSP-backed perception, navigation, rename, and impact analysis.

## Preconditions
- LSP server available (for example, `typescript-language-server`).
- `@ku0/tool-lsp` dependencies installed.
- Sample workspace contains a class with multiple references (for example, `AuthService`).

## Steps
1. Start the agent runtime with LSP enabled for the workspace.
2. Ask the agent to locate the `AuthService` class and confirm the file path and line number.
3. Run `nav_refs` on `AuthService.login` and confirm multiple call sites are returned.
4. Run `rename_sym` to rename `UserService` to `AccountService` and run a compile/typecheck to confirm 0 errors.
5. Edit `utils/auth.ts` and verify the impact analysis lists affected files.
6. Save a file and confirm `SymbolGraph` updates within the latency target.

## Expected Results
- Symbol resolution succeeds without manual file searches.
- Reference lists match IDE results.
- Rename is safe across imports with no compile errors.
- Impact analysis lists all dependent files.

## Automation
- `pnpm test:x1` through `pnpm test:x4`

## Evidence to Capture
- CLI output from navigation, rename, and impact analysis.
- Typecheck or build logs after rename.
- Timing logs for `SymbolGraph` update latency.
