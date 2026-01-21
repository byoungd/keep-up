#!/usr/bin/env markdown
# Agent Runtime Claude Skills Support Spec (v1)

Status: Draft  
Owner: Agent Runtime  
Last Updated: 2026-01-15  
Applies to: Agent Runtime v1, LFCC v0.9 RC  
Related docs: `docs/specs/agent-runtime/agent-runtime-optimization-spec.md`, `docs/specs/cowork/cowork-sandbox-design.md`, `docs/specs/cowork/cowork-safety-spec.md`

## Context
Claude Skills (Agent Skills) are an open standard for packaging procedural expertise as folders containing a `SKILL.md` file plus optional scripts, references, and assets. Claude loads skill metadata at startup, then dynamically loads full instructions and resources when needed (progressive disclosure). The current `packages/agent-runtime/src/skills` module is a small, internal set of Cowork tools and does not implement the Agent Skills standard or Claude Skills workflows.

This spec defines full Agent Skills support for the agent runtime, aligned with Claude Skills behavior and the Agent Skills open specification.

## Goals
- Full compatibility with the Agent Skills format and validation rules.
- Progressive disclosure: load only metadata at startup; load full instructions/resources on activation.
- Skill discovery, enable/disable, and source provenance (builtin/org/user/third-party).
- Safe execution of skill scripts and access to bundled resources under sandbox policy.
- Integration with MCP tool registry and security policies.
- Deterministic audit logging of skill usage and activation.

## Non-Goals
- Building a complete UI for skill management (Cowork UI can be layered later).
- Replacing MCP or LFCC flows.
- Introducing a non-Loro CRDT or bypassing the AI Envelope.
- Acting as a remote skill store or marketplace backend.

## Source Research (Key Signals)
- Agent Skills spec (open standard): `https://agentskills.io/specification` (downloaded repo `agentskills/agentskills`).
  - `SKILL.md` with YAML frontmatter. Required fields: `name`, `description`.
  - Optional fields: `license`, `compatibility`, `metadata`, `allowed-tools`.
  - `name` constraints: <=64 chars, lowercase, alnum + hyphen, no leading/trailing hyphen, no consecutive hyphens, must match directory name.
  - Progressive disclosure: metadata at startup; full SKILL.md on activation; resources on demand.
- Integration guide: `https://agentskills.io/integrate-skills`
  - Two approaches: filesystem-based (read files directly) and tool-based (explicit tools).
  - Recommended `<available_skills>` XML block in system prompt for Claude models.
- Claude help center: `https://support.claude.com/en/articles/12512176-what-are-skills`
  - Skills are folders of instructions, scripts, and resources; Claude loads relevant ones dynamically.
  - Skills vs MCP: MCP provides tools and data; Skills provide procedural knowledge.
  - Agent Skills is published as an open standard, with a reference SDK.
- Claude help center: `https://support.claude.com/en/articles/12512180-using-skills-in-claude`
  - Skills require code execution; custom skills are uploaded as ZIPs; folder name must match skill name.
  - Skills Directory installs skills from repositories; partner skills can depend on MCP connectors.
  - Risks: prompt injection and data exfiltration; audit and trust required.
- Claude help center: `https://support.claude.com/en/articles/12512198-creating-custom-skills`
  - Custom skills can include scripts and resources; skills compose automatically.
  - Packaging rules: ZIP root must be the skill folder; `SKILL.md` required.
  - Notes about dependencies and environment compatibility (Claude/Claude Code vs API).
- Anthropic skill repo (examples + template): `https://github.com/anthropics/skills`

## Requirements

### R1: Skill Discovery
- Discover skills by scanning configured directories for `SKILL.md` or `skill.md`.
- Validate with Agent Skills rules (NFKC normalization, name constraints, description length, allowed fields).
- Reject skills with invalid frontmatter or mismatched directory name.
- Support multiple sources and precedence:
  1) Builtin (shipped with app/runtime)
  2) Org-provisioned (admin)
  3) User-installed
  4) Third-party/marketplace

### R2: Metadata Indexing
- Load only `name` and `description` at startup for all skills.
- Maintain an index entry with:
  - `skillId`, `name`, `description`, `source`, `path`, `hash`, `lastModified`.
- Cache index in memory; optional persistent cache for fast startup.

### R3: Prompt Injection Format
- For Claude models, emit `<available_skills>` in the system prompt:
  ```xml
  <available_skills>
    <skill>
      <name>pdf-processing</name>
      <description>Extracts text and tables from PDFs...</description>
      <location>/absolute/path/to/pdf-processing/SKILL.md</location>
    </skill>
  </available_skills>
  ```
- For non-filesystem clients, omit `location` and use `skillId` in tool calls.
- Keep metadata concise (target 50-100 tokens per skill).

### R4: Skill Activation
- When a model requests a skill:
  - Load the full `SKILL.md` body into context.
  - Record activation event with skill hash, source, and session id.
- Support multiple skill activations in a single task.
- Enforce progressive disclosure:
  - Do not automatically load reference files or assets unless requested.

### R5: Resource Access
- Skill resources (scripts, references, assets) are accessed only via a controlled loader:
  - Enforce path traversal protection.
  - Resolve only relative paths under the skill root.
  - Track read events for audit.
- Recommend one-level-deep references, but allow nested paths if explicitly enabled.

### R6: Script Execution
- Script execution is optional and must be gated by:
  - Sandbox policies (same as core bash/code/file servers).
  - Skill trust level (higher restrictions for third-party).
  - Explicit user approval for destructive or external-network operations.
- Use existing core tool servers (bash/code) as execution backend.
- `allowed-tools` frontmatter can pre-approve tool patterns; runtime must enforce it as a hard allowlist.

### R7: MCP Integration
- Skills can be written to guide usage of MCP connectors.
- Runtime must pass skill context into tool calls via `ToolContext`.
- If a skill’s `allowed-tools` conflicts with a tool call, the call is blocked.

### R8: Security and Safety
- Record skill activation, resource reads, and script execution in audit logs.
- Treat third-party skills as untrusted by default:
  - No automatic network access.
  - Require approval before executing scripts.
- Store provenance metadata:
  - `source`, `originUrl`, optional signature and hash.

### R9: Determinism & LFCC Constraints
- Skill usage must not bypass the AI Envelope.
- All doc mutations remain through LFCC requests with preconditions.
- Skill activation should be replayable from logs with stable skill hashes.

## Proposed Architecture

### Components
1) **SkillRegistry**
   - Discovers skills and maintains index.
   - Exposes list/search/metadata.

2) **SkillResolver**
   - Loads `SKILL.md` and resource files on demand.
   - Applies path safety checks and keeps read logs.

3) **SkillPromptAdapter**
   - Generates `<available_skills>` blocks.
   - Handles model-specific formats.

4) **SkillPolicyGuard**
   - Interprets `allowed-tools` and source trust.
   - Integrates with `securityPolicy` and approvals.

5) **SkillExecutionBridge**
   - Routes skill script execution via existing tool servers.
   - Applies sandbox + approval policies.

6) **SkillAuditEmitter**
   - Emits structured events:
     - `skill.discovered`
     - `skill.activated`
     - `skill.resource_read`
     - `skill.script_executed`

### Data Model (TypeScript)
```ts
export type SkillSource = "builtin" | "org" | "user" | "third_party";

export type SkillIndexEntry = {
  skillId: string;
  name: string;
  description: string;
  source: SkillSource;
  path: string;
  hash: string;
  lastModified: string;
  metadata?: Record<string, string>;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
};

export type SkillActivation = {
  skillId: string;
  hash: string;
  source: SkillSource;
  sessionId: string;
  taskId?: string;
  activatedAt: string;
};
```

## Tooling and APIs

### Tool-based Interface (optional)
Provide a dedicated tool server for skill management:
- `skills.list` -> returns metadata list
- `skills.read` -> returns SKILL.md body
- `skills.read_resource` -> returns a resource file
- `skills.run_script` -> executes a script (guarded)

### Filesystem-based Interface
If the model can access a filesystem, it can use `file.read` or `bash` to read:
- `/skills/<skill>/SKILL.md`
- `references/`, `scripts/`, `assets/`

## Validation Rules (Agent Skills)
- Must contain YAML frontmatter and close with `---`.
- Allowed fields: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`.
- `name`: lowercase, <=64 chars, alnum + hyphen, no leading/trailing hyphen, no `--`.
- `description`: 1-1024 chars.
- Directory name must match `name` (NFKC normalized).

## Packaging and Install
- Install from local folders or ZIP files.
- ZIP must contain the skill folder at root; folder name must match `name`.
- Store skills under `.keep-up/skills/<name>/` with provenance metadata.

## Compatibility and Dependencies
- `compatibility` is a free-form hint for environment requirements.
- If a skill requires external packages, it must:
  - Either depend on pre-installed packages in the runtime environment,
  - Or request explicit installation via approved tools.
- For API-style runtimes without installation, reject or warn on unsupported dependencies.

## Security Controls
- Trust tiers drive policy:
  - builtin/org: allow execution within sandbox by default.
  - user: require confirmation for scripts.
  - third-party: confirmation + no network unless explicitly allowed.
- Block access to paths outside skill root when reading resources.
- Enforce tool-level guardrails with `allowed-tools` if present.

## Observability
- Emit per-skill metrics:
  - activation count, activation failures, resource reads, script failures.
- Record skill hash in task graph events to support deterministic replay.

## Testing Strategy
- Unit tests:
  - Frontmatter parsing, validation errors, path traversal.
  - `allowed-tools` enforcement.
- Integration tests:
  - Skill discovery + prompt injection.
  - Skill activation + resource load + script execution under sandbox.

## Rollout Plan
1) Implement SkillRegistry + validation + prompt injection.
2) Add SkillResolver + resource reading with audit events.
3) Add SkillExecutionBridge and policy guardrails.
4) Add provenance and trust tier policies.

## Open Questions
- Should `dependencies` be supported as a structured metadata field or `metadata.dependencies`?
- Should we adopt `skills-ref` reference implementation in TypeScript, or port key pieces?
- How should skill trust be verified (signatures vs curated allowlist)?

## Appendix: Example SKILL.md
```markdown
---
name: brand-guidelines
description: Apply Acme brand guidelines to presentations and documents.
license: Proprietary
compatibility: Requires access to fonts under /assets/fonts
allowed-tools: Read Write Bash(convert:*) Bash(jq:*)
metadata:
  author: acme
  version: "1.0"
---

# Brand Guidelines

Follow these rules when generating any deck or report.

## Examples
- Use the Acme title slide template for all decks.
```
