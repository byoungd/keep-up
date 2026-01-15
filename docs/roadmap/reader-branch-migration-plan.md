# Reader Branch Migration Plan (Status: Phase 0 In Progress)

## Executive Summary
This document outlines the strategy to split the **Reader** application (and associated editor features) into a dedicated `apps/reader` branch. The `main` branch will retain shared packages and the **Cowork** application. This separation allows Reader to stabilize and evolve independently while Shared Packages and Cowork continue development on `main`.

> [!NOTE]
> **Current Status (2026-01-15, code scan)**: Phase 0 is complete in code (layout/sidebar/chat extracted to `@ku0/shell` and Reader consumes the shared shell). Phase 1 is pending verification (CI/build status not checked here). Phase 2 has not started (Reader still lives in `apps/reader` on `main`).

## 1. Branch Strategy

### **`apps/reader` Branch (New)**
*   **Purpose**: Dedicated branch for the Reader application.
*   **Contents**: 
    *   `apps/reader/` (The Application)
    *   `packages/*` (Shared code, synced from `main`)
    *   `e2e/` (Reader/Editor specific E2E tests)
    *   `docs/` (Relevant documentation)
*   **Workflow**: Feature development for Reader happens here. Regular merges from `main` to pull in shared package updates.

### **`main` Branch (Existing)**
*   **Purpose**: Home for Shared Packages and **Cowork** application.
*   **Contents**:
    *   `apps/cowork/`
    *   `packages/*`
    *   `e2e/` (Cowork-specific tests only, if any exist)
    *   [REMOVED] `apps/reader/`
    *   [REMOVED] Reader-specific E2E tests
*   **Workflow**: Development of shared infrastructure (`packages/`) and Cowork features.

## 2. Migration Scope

**Strategy**: Long-lived Divergence.
*   **Reader Development**: occurs exclusively on `apps/reader` branch.
*   **Cowork Development**: occurs exclusively on `main` branch.
*   **Reunification**: We will *wait* for the Reader app to reach a "Stable Period" before considering merging `apps/reader` back into `main`. The branches may remain separate for an extended time.

| Component | Destination | Action |
| :--- | :--- | :--- |
| `apps/reader` | `apps/reader` Branch | **Keep** in Branch, **Delete** from Main |
| `apps/cowork` | `main` Branch | **Keep** in Main, (Optional: Ignore in Branch) |
| `apps/desktop` | `main` Branch | Keep in Main (Assumed shared/legacy) |
| `packages/*` | Both | **Source of Truth** on Main. Synced to Branch. |
| `e2e/*.spec.ts` | `apps/reader` Branch | Most E2E is Reader-focused. Move to Branch. |
| `playwright.config.ts` | `apps/reader` Branch | Retain in Branch. Adjust/Remove in Main. |
| CI Workflows | Split | Adjust Main to skip Reader jobs. Branch runs Reader jobs. |

## 3. Sequencing & Dependencies

**Phase 0: Shared Component Extraction (Complete in code)**
*   **Objective**: Modularize core UI before the split so both branches can access them if needed (or to simply clean up architecture).
*   **Actions**:
    *   **[DONE] Sidebar/Nav**: Extracted to `packages/shell` (`@ku0/shell`) and wired through `AppShell`/`ReaderShellProvider`.
    *   **[DONE] Layout**: `ResizableThreePaneLayout`, `useThreePaneResize`, and resize utils live in `packages/shell`.
    *   **[DONE] Chat**: `AIPanel`/`AIPanelHeader` UI lives in `packages/shell`, consumed by Reader via wrapper.
*   **Success Metrics**: `apps/reader` imports shell layout and chat UI from `@ku0/shell` (e.g., `ReaderShellLayout` uses `AppShell`/`ReaderShellProvider`; `AIPanel` wraps `ShellAIPanel`). Remaining legacy hooks in `apps/reader/src/hooks` appear unused and can be cleaned up during Phase 3.

**Phase 1: Preparation (On Main)**
    *   Ensure all pending PRs for Reader are merged or closed.
    *   Verify CI is green.
    *   **Confirm Phase 0 is complete** (code-level extraction done; CI/build status still needs verification).

**Phase 2: Branch Cut**
    *   Create branch `apps/reader` from `main`.
**Phase 3: Cleanup (On Main)**
    *   Delete `apps/reader/`.
    *   Update `pnpm-workspace.yaml` (remove `apps/reader`).
    *   Delete Reader-specific E2E tests from `e2e/`.
    *   Update CI/CD configs to remove Reader deploy/test steps.
    *   Commit "chore: remove reader app from main".

**Phase 4: Stabilization (On Branch)**
    *   (Optional) Remove `apps/cowork` to speed up install/build.
    *   Verify `pnpm build` works.
    *   Verify `pnpm test:e2e` passes.
5.  **Steady State (Split Development)**
    *   **Cowork**: Develops on `main`.
    *   **Reader**: Develops on `apps/reader`.
    *   **Sync**: `apps/reader` branch merges `main` (downstream sync) periodically to get package updates.
    *   **Merge Back**: **DEFERRED**. Do not merge `apps/reader` -> `main` until Reader stabilizes.

## 4. Testing Strategy

*   **During Split**:
    *   Run full E2E suite on `main` *before* cut.
    *   Run full E2E suite on `apps/reader` branch *immediately after* cut.
    *   Verify `packages/*` unit tests pass on both.
*   **After Split**:
    *   **Reader Branch**: Runs `apps/reader` E2E and Unit tests.
    *   **Main Branch**: Runs `packages/*` Unit tests and `apps/cowork` tests.
    *   **Cross-Branch**: When merging `main` -> `apps/reader`, run full regression on the branch.

## 5. Risks & Rollback

*   **Risk**: Divergence of `packages/*`. Breaking changes in `main` might be hard to integrate into `apps/reader`.
    *   *Mitigation*: Frequent merges from `main` to `apps/reader`. Strict semver or changelogs for internal packages.
*   **Risk**: Lost history.
    *   *Mitigation*: Git preserves history. The branch creation point marks the fork.
*   **Rollback Plan**:
    *   If the split fails (e.g., CI broken, build failures), simply abandon/delete the `apps/reader` branch and revert the deletion commit on `main`.

## 6. Checklists

### PM Review Checklist
- [x] Confirmed strict code freeze timeline for Reader team.
- [ ] Identified any "in-flight" features that must land on Main before split.
- [ ] Communicated to team: "All Reader PRs must target `apps/reader` branch after [Date]."

### Branch Cut Checklist (Day of Migration)
- [x] **Pre-requisite**: confirmed Side/Layout/Chat are moved to shared packages (`@ku0/shell`) and Reader consumes the shared shell.
- [ ] **Step 1**: `git checkout main && git pull`
- [ ] **Step 2**: Check CI status (Must be GREEN).
- [ ] **Step 3**: `git checkout -b apps/reader` && `git push -u origin apps/reader`
- [ ] **Step 4**: `git checkout main`
- [ ] **Step 5**: `rm -rf apps/reader`
- [ ] **Step 6**: Remove Reader tests from `e2e/`.
- [ ] **Step 7**: Update `pnpm-workspace.yaml` (exclude apps/reader).
- [ ] **Step 8**: Commit "chore: remove reader app from main".
- [ ] **Step 9**: Verify `pnpm install && pnpm build` on Main.
- [ ] **Step 10**: Switch to `apps/reader` branch, verify `pnpm install && pnpm test`.

## 7. Appendix: Technical Analysis for Extraction

### 1. Resizable Layout
*   **Files**: 
    *   `packages/shell/src/components/layout/ResizableThreePaneLayout.tsx`
    *   `packages/shell/src/hooks/useThreePaneResize.ts`
    *   `packages/shell/src/lib/layout/resizeUtils.ts`
*   **Status**: **DONE**. Reader uses the shared layout via `@ku0/shell`.
*   **Action**: Optional cleanup: remove the unused legacy hook in `apps/reader/src/hooks/useThreePaneResize.ts`.

### 2. Sidebar System
*   **Files**: `packages/shell/src/components/layout/sidebar/*` and `packages/shell/src/lib/sidebar/*`
*   **Blocking Dependencies**:
    *   `@/providers/FeedProvider`
    *   `@/context/ImportContext`
    *   `@/components/feeds/RssManagementModal`
*   **Status**: **DONE**. Shared sidebar lives in `@ku0/shell`; Reader injects app-specific content via `renderItemChildren` and sidebar props.
*   **Recommended Refactor**:
    *   Keep Reader-only logic (RSS/import) in `apps/reader` and continue injecting via slots/handlers.

### 3. Chat / AIPanel
*   **Files**: `packages/shell/src/components/chat/*`, `apps/reader/src/components/layout/AIPanel.tsx`
*   **Status**: **DONE** (UI extracted to `@ku0/shell`; Reader retains state/translation wiring).
*   **Action**:
    *   Optional cleanup: remove unused `apps/reader/src/hooks/useChatUIState.ts` if it is no longer referenced.
