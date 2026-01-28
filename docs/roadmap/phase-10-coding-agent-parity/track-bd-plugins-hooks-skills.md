# Track BD: Plugin Ecosystem + Commands + Hooks + Skills

> Priority: P1
> Status: Completed
> Owner: Agent Runtime Tools
> Dependencies: Tracks BA, BC
> Source: docs/roadmap/phase-10-coding-agent-parity/README.md

---

## Objective

Deliver a Claude Code class plugin system with commands, hooks, and skills that
can be discovered, installed, and executed from CLI/Cowork.

---

## Scope

- Runtime plugin loader + registry wired into CLI and Cowork
- Command routing for slash commands (plugin commands + local commands)
- Hook events (SessionStart/Stop, PreToolUse/PostToolUse) in runtime flow
- Skills discovery + execution with policy gating
- Local plugin search paths and version management

---

## Out of Scope

- MCP tool governance (Track BE)
- IDE integration (Track BJ)

---

## Implementation Spec (Executable)

1) Plugin loader integration
- Initialize `createPluginLoader` and `createPluginRegistry` in runtime startup.
- Define plugin search paths: project `.keepup/plugins`, user `~/.keepup/plugins`.

2) Command + hook routing
- Implement CLI command router for `/command` and `keepup command run`.
- Emit hook events from tool execution and session lifecycle.

3) Skills integration
- Wire `createSkillRegistry` and `createSkillToolServer` into runtime registry.
- Add `keepup skill list/run` for CLI access.

4) Plugin management UX
- Add `keepup plugin list/install/enable/disable/update` commands.
- Expose plugin state in Cowork settings UI.

---

## Deliverables

- Plugin loader wired into runtime
- CLI commands for plugins/skills
- Hook event dispatch integrated with tool execution
- Documentation for plugin manifest + command definitions

---

## Acceptance Criteria

- CLI can install and enable a plugin from local path.
- Slash commands route to plugin command handlers.
- Hooks run on tool calls and session start/stop.
- Skills are discoverable and runnable from CLI.

---

## Validation

- `pnpm --filter @ku0/agent-runtime-tools test`
- `pnpm --filter @ku0/agent-runtime-execution test`
- Manual: run a local sample plugin with a slash command

---

## Single-Doc Execution Checklist

1) Create feature branch
- git fetch origin
- git checkout main
- git pull --ff-only
- git checkout -b feat/track-bd-plugins-hooks-skills

2) Initialize required artifacts
- task.md: add checklist items from this track
- implementation_plan.md: summarize steps and dependencies
- walkthrough.md: add validation steps and test commands

3) Implement the scope
- Follow the Implementation Spec in this document only
- Keep changes minimal and within scope

4) Validate
- Run the commands listed under Validation in this document
- Run: pnpm biome check --write

5) Commit and PR
- git add -A
- git commit -m "feat: track-bd plugins hooks skills"
- git push -u origin feat/track-bd-plugins-hooks-skills
- Open PR with the template below

### PR Template
- What changed and why
- Tests: <command(s)> or "Not run (docs-only)"
- Risks/known issues
- Spec sections satisfied (list exact headings)
