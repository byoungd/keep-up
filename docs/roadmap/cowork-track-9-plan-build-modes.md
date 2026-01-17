# Track 9: Plan Mode & Build Mode (Dual Agent Modes)

> **Status**: ✅ Core Implementation Complete (2026-01-17)
> **Location**: `packages/agent-runtime/src/modes/`
> **Remaining**: Plan.md artifact generation, Mode toggle UI, Keyboard shortcut

## Mission
Implement dual operating modes for the Cowork agent: **Plan Mode** for read-only
analysis and planning, and **Build Mode** for executing code modifications –
mirroring the successful pattern from OpenCode and Claude Code.

## Primary Goal
Give users explicit control over agent capabilities, reducing accidental modifications
and enabling safe exploration of unfamiliar codebases.

## Background
OpenCode's Tab-key mode switching between `plan` and `build` agents is a key UX
differentiator. Claude Code's Plan Mode with Opus 4.5 generates editable `plan.md`
files before execution. Both patterns address:
- Fear of unintended modifications
- Need for review before action
- Safe codebase exploration
- Architecture planning workflows

## Scope
- Dual mode system: Plan (read-only) and Build (full access).
- Mode indicator in UI with easy switching.
- Plan Mode: file read, search, analysis only.
- Build Mode: full tool access with confirmations.
- Plan artifact generation (plan.md with proposed changes).
- Mode-aware tool filtering.

## Mode Policy (Initial)
- Plan Mode allowed: `read_file`, `search`, `list_dir`, `view_file_outline`.
- Plan Mode denied: `write_file`, `apply_patch`, `run_command`, `delete_file`.
- Build Mode allowed: all tools, but destructive actions still require approval (Track 4).
- Blocked tool attempts should respond with a clear, user-facing message and suggest
  switching to Build Mode.

## Plan Artifact Format
- Artifact type: `plan`
- Required sections: problem summary, proposed file changes, step-by-step plan, risks.
- Stored in artifacts table with `status: pending` and linked to session.

## Persistence
- Mode is stored on the session record and survives page refresh.
- UI reflects the stored mode and prompts when switching away from a pending plan.

## Non-Goals
- Complex multi-agent orchestration (separate track).
- Approval workflows (covered in Track 4).
- Custom mode definitions.

## Inputs and References
- OpenCode: `plan` and `build` agent definitions
- Claude Code: Plan Mode with plan.md generation
- `packages/agent-runtime/src/tools/`
- `apps/cowork/server/runtime/coworkTaskRuntime.ts`

## Execution Steps (Do This First)
1. **Define Mode Schema**:
   ```typescript
   type AgentMode = 'plan' | 'build';
   
   interface ModeConfig {
     id: AgentMode;
     displayName: string;
     description: string;
     allowedTools: string[];
     deniedTools: string[];
     requiresApprovalFor: string[];
     systemPromptAddition: string;
   }
   
   const PLAN_MODE: ModeConfig = {
     id: 'plan',
     displayName: 'Plan Mode',
     description: 'Read-only analysis and planning',
     allowedTools: ['read_file', 'search', 'list_dir', 'view_file_outline'],
     deniedTools: ['write_file', 'run_command', 'delete_file'],
     requiresApprovalFor: ['run_command'], // Even reads may need approval
     systemPromptAddition: `You are in PLAN MODE. You can analyze and suggest changes,
       but cannot modify files. Generate a plan.md with proposed changes.`
   };
   
   const BUILD_MODE: ModeConfig = {
     id: 'build',
     displayName: 'Build Mode',
     description: 'Full development access',
     allowedTools: ['*'],
     deniedTools: [],
     requiresApprovalFor: ['delete_file', 'run_command'],
     systemPromptAddition: `You are in BUILD MODE. You have full access to
       implement changes. Follow best practices and request approval for
       destructive operations.`
   };
   ```

2. **Implement Mode Manager**:
   ```typescript
   class AgentModeManager {
     private currentMode: AgentMode = 'build';
     
     setMode(mode: AgentMode): void;
     getMode(): AgentMode;
     canUseTool(toolName: string): boolean;
     getSystemPromptAddition(): string;
     toggleMode(): AgentMode; // Switch between plan/build
   }
   ```

3. **Wire Mode into Tool Execution**:
   - Filter available tools based on mode.
   - Inject mode-specific system prompt.
   - Block denied tools with clear user message.

4. **Plan Artifact Generation**:
   - In Plan Mode, generate `plan.md` with:
     - Problem analysis
     - Proposed file changes (diff preview)
     - Implementation steps
     - Risk assessment
   - Allow user to edit plan before switching to Build Mode.

5. **Build Mode Selector UI**:
   - Toggle button in chat header.
   - Keyboard shortcut (Tab or Cmd+Shift+P).
   - Visual indicator of current mode.
   - Confirmation on mode switch if plan pending.

## Required Behavior
- Mode switch is instant and clearly indicated.
- Plan Mode cannot write files or run destructive commands.
- Plan Mode generates structured plan.md artifacts.
- Build Mode respects approval requirements from Track 4.
- Mode persists per session.

## Implementation Outline
1. Create `AgentModeManager` in agent-runtime.
2. Add mode filtering to tool execution middleware.
3. Implement plan.md generation template.
4. Add mode toggle UI component.
5. Wire keyboard shortcut.
6. Add mode to session state (persisted).
7. Emit mode changes in SSE events for live UI updates.

## Deliverables
- [x] `AgentModeManager` class with mode switching
- [x] Mode configurations (PLAN_MODE, BUILD_MODE)
- [x] Mode-aware tool filtering (`canUseTool`, `filterTools`)
- [x] System prompt additions for each mode
- [x] `agentMode` field added to `CoworkSession` type
- [x] Mode API endpoints (GET/PUT/toggle)
- [x] `SESSION_UPDATED` and `SESSION_MODE_CHANGED` SSE events
- [ ] Plan.md artifact generation in Plan Mode
- [ ] Mode toggle UI with keyboard shortcut
- [ ] Mode indicator badge

## Acceptance Criteria
- [x] AgentModeManager correctly filters tools by mode
- [x] Mode persists in session state
- [x] API endpoints for mode get/set/toggle work correctly
- [x] SSE events emitted on mode change
- [ ] Tab key (or shortcut) toggles between Plan and Build mode
- [ ] Plan Mode blocks file write attempts with clear message
- [ ] Plan Mode generates plan.md with proposed changes
- [ ] Build Mode executes changes with Track 4 approvals
- [ ] Mode indicator visible in UI at all times

## Testing
- Unit tests for mode manager and tool filtering.
- Integration test: verify tool blocking in Plan Mode.
- E2E test: mode toggle and plan generation.
- `pnpm vitest run --project agent-runtime`

## Dependencies
- Track 4: Build Mode uses approval workflow.
- Track 6: Plan.md may reference artifacts.

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
