# Track CC: Skills System Layering

> Priority: P1
> Status: Proposed
> Owner: Agent Runtime
> Dependencies: None
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Implement a layered skills system with three tiers (bundled, managed, workspace)
following Moltbot's pattern. Skills provide agent capabilities with a unified
SKILL.md format and tool definitions.

---

## Scope

- Skills directory structure (bundled/managed/workspace)
- SKILL.md schema and parser
- Skill discovery and registration
- Skill installation and updates (managed tier)
- Workspace skill loading from user directory
- Skills refresh on change (file watcher)

---

## Out of Scope

- Remote skill registry (future: ClawdHub equivalent)
- Skill execution environment (uses existing tool runtime)
- MCP tool integration (Track BE in Phase 10)

---

## Implementation Spec (Executable)

1) Define Skill Schema

- Create `packages/skills/src/types.ts`:
  - `SkillManifest`: name, description, version, tools[], dependencies
  - `SkillTier`: 'bundled' | 'managed' | 'workspace'
  - Parse SKILL.md frontmatter + markdown body

2) Implement Skill Loader

- Create `packages/skills/src/loader.ts`:
  - Load skills from three directories:
    - `packages/skills/bundled/` - Built-in skills
    - `~/.ku0/skills/managed/` - Platform-managed
    - `<workspace>/skills/` - User workspace skills
  - Merge skills with tier precedence (workspace > managed > bundled)

3) Implement Skill Registry

- Create `packages/skills/src/registry.ts`:
  - Register loaded skills
  - Expose skills as tool definitions
  - Track skill status (enabled, version, source)

4) Add File Watcher

- Watch workspace skills directory for changes
- Debounce refresh (30s delay as in Moltbot)
- Emit skill change events for connected nodes

5) Create Bundled Skills

- `coding-agent`: Core coding tools integration
- `github`: GitHub CLI wrapper
- `session-logs`: Session history access

---

## Deliverables

- `packages/skills/` - Skills package
- Bundled skills in `packages/skills/bundled/`
- Skills documentation
- Unit tests for loading and registry

---

## Acceptance Criteria

- Skills load from all three tiers in correct order
- SKILL.md files are parsed correctly
- Skills register tools with agent runtime
- File watcher detects workspace skill changes
- Skill status visible in cowork UI

---

## Validation

```bash
pnpm --filter @ku0/skills test

# Manual validation
# 1. Create skill in <workspace>/skills/test-skill/SKILL.md
# 2. Restart agent or wait for refresh
# 3. Verify skill tools are available
```
