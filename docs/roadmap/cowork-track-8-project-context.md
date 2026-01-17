# Track 8: Project Context System (AGENTS.md)

## Mission
Implement persistent project-level context that helps the AI agent understand
project structure, coding conventions, and custom instructions – inspired by
OpenCode's AGENTS.md and Claude Code's CLAUDE.md patterns.

## Primary Goal
Deliver automatic project analysis and persistent context storage that improves
agent accuracy, reduces repetitive instructions, and enables team-shared guidelines.

## Background
Both OpenCode and Claude Code use project root markdown files (AGENTS.md / CLAUDE.md)
as persistent memory for AI agents. This dramatically improves:
- First-interaction accuracy
- Coding style consistency
- Team convention adherence
- Reduced context window waste on repeated instructions

## Scope
- Automatic project structure analysis on first session.
- `AGENTS.md` generation with editable sections.
- Git-compatible format for team sharing.
- Custom instructions and coding conventions storage.
- Project pattern detection (frameworks, linters, test tools).
- Integration with agent system prompt.

## Non-Goals
- Replacing existing `Agents.md` file (different purpose).
- Full semantic code understanding (AST-level).
- Cross-project context sharing.

## Inputs and References
- OpenCode: AGENTS.md auto-generation pattern
- Claude Code: CLAUDE.md specification
- Existing `Agents.md` in repo root (different scope)
- `apps/cowork/server/runtime/coworkTaskRuntime.ts`

## Execution Steps (Do This First)
1. **Define AGENTS.md Schema**:
   ```markdown
   # Project: {project_name}
   
   ## Overview
   {auto-generated project description}
   
   ## Tech Stack
   - Language: TypeScript
   - Framework: Next.js / Hono
   - Testing: Vitest
   - Linting: Biome
   
   ## Directory Structure
   ```
   apps/
   ├── cowork/      # Main application
   └── reader/      # Document reader
   packages/
   ├── agent-runtime/
   └── shell/
   ```
   
   ## Coding Conventions
   - Always use TypeScript strict mode
   - No implicit `any`
   - Use `const`/`let`, never `var`
   - Prefer named exports
   
   ## Custom Instructions
   {user-editable section}
   
   ## Common Patterns
   {auto-detected patterns}
   ```

2. **Implement Project Analyzer**:
   ```typescript
   interface ProjectAnalysis {
     name: string;
     rootPath: string;
     techStack: TechStackInfo;
     structure: DirectoryTree;
     detectedPatterns: Pattern[];
     configFiles: ConfigFile[];
   }
   
   async function analyzeProject(rootPath: string): Promise<ProjectAnalysis>;
   ```

3. **Create AGENTS.md Generator**:
   - Detect package.json, tsconfig, biome.json, etc.
   - Infer tech stack from dependencies.
   - Map directory structure (depth-limited).
   - Extract coding conventions from linter configs.

4. **Integrate with Agent System Prompt**:
   - Load AGENTS.md content at session start.
   - Inject into system prompt with token budget.
   - Update context on file changes (debounced).

5. **Build UI for Context Management**:
   - View/edit AGENTS.md in settings.
   - Regenerate button.
   - Section-level enable/disable.

## Required Behavior
- AGENTS.md is auto-generated on first project open.
- User can edit and customize all sections.
- Context is injected into every agent interaction.
- File is Git-friendly (can be committed and shared).
- Regeneration preserves custom sections.

## Implementation Outline
1. Create `packages/project-context/` with analyzer and generator.
2. Add file watchers for project structure changes.
3. Implement AGENTS.md CRUD API: `GET/PUT /api/project/context`.
4. Inject context into `coworkTaskRuntime.ts` system prompt builder.
5. Build settings UI for viewing/editing context.
6. Add CLI command: `cowork context init` / `cowork context refresh`.

## Deliverables
- `@ku0/project-context` package.
- AGENTS.md auto-generation on project init.
- Context injection into agent system prompt.
- Settings UI for context management.
- CLI commands for context operations.

## Acceptance Criteria
- [ ] AGENTS.md is generated automatically on first session.
- [ ] Agent references project conventions without explicit instruction.
- [ ] Custom instructions section survives regeneration.
- [ ] Context visible in settings UI.
- [ ] File is valid markdown, Git-diffable.

## Testing
- Unit tests for project analyzer.
- Snapshot tests for generated AGENTS.md.
- Integration test: verify agent uses context in responses.
- `pnpm vitest run --project project-context`

## Dependencies
- None (can run in parallel with other tracks).

## Owner Checklist
- Follow `CODING_STANDARDS.md` (TypeScript only, no `any`, no `var`).
- Update `task.md` progress markers for this track.
- Document manual verification steps in `walkthrough.md`.
