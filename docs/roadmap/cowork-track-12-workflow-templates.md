# Track 12: Workflow Templates + Skills

> [!TIP]
> **Parallel Execution**
> This track is independent of the Phase F architecture changes and can be developed in parallel.


## Mission
Make repeatable agent workflows first-class so teams can standardize quality
and reduce prompt overhead.

## Primary Goal
Deliver a skill and workflow system that lets users create, share, and run
template-driven tasks with predictable outputs.

## Background
OpenCode promotes skill packs and reusable commands, while Claude Code users
depend on shared instructions to keep behavior consistent across tasks. A
template system reduces variance and enables team-wide automation.

## Scope
- Workflow template schema and storage.
- Skill registry and discovery UI.
- Import/export of templates (JSON/Markdown).
- Parameterized prompts with required inputs.
- Run history and last-used configuration.

## Non-Goals
- Public marketplace or remote distribution.
- Auto-generation of templates without user review.

## Inputs and References
- `packages/agent-runtime/src/skills/skillRegistry.ts`
- Track 9 (Plan/Build modes)
- Track 8 (Project Context)

## Execution Steps (Do This First)
1. Define template schema:
   ```ts
   interface WorkflowTemplate {
     id: string;
     name: string;
     description: string;
     mode: "plan" | "build";
     inputs: Array<{ key: string; label: string; required: boolean }>;
     prompt: string;
     expectedArtifacts: string[];
     version: string;
   }
   ```
2. Add storage for templates (local JSON + optional DB).
3. Build template runner to inject inputs and start a session.
4. Add UI to create/edit/run templates.
5. Add import/export with validation.

## Required Behavior
- Templates can be created and edited in-app.
- Running a template launches a session with a prefilled prompt.
- Mode selection respects Plan/Build constraints.
- Template versioning prevents silent breaking changes.

## Implementation Outline
1. Extend skill registry to load workflow templates.
2. Add server endpoints: `GET/POST/PUT/DELETE /api/workflows`.
3. Add UI for template management and execution.
4. Log template usage in audit logs.

## Deliverables
- Workflow template schema and storage.
- UI for creating and executing templates.
- Import/export support with validation.
- Usage tracking for templates.

## Acceptance Criteria
- [ ] Team can share a template and reproduce outputs.
- [ ] Template inputs are validated before run.
- [ ] Templates can enforce Plan or Build mode.
- [ ] Usage is visible in session metadata.

## Testing
- Unit tests for schema validation.
- Integration tests for template CRUD.
- UI tests for template execution.

## Dependencies
- Track 9 for mode enforcement.
- Track 4 for approvals in Build mode.

## Owner Checklist
- Follow `CODING_STANDARDS.md`.
- Update `task.md` progress markers.
- Document manual verification steps in `walkthrough.md`.
