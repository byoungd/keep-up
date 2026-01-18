# Track E: SOP Roles and Phase Gates

Owner: Runtime Developer + QA
Status: Planned

## Objective
Implement role-based SOPs and phase-gated tool filtering as defined in docs/specs/agent-runtime-spec-2026.md Section 7.

## Scope
- RoleRegistry and SOPExecutor
- Phase-based tool allowlists
- Initial SOPs for Coder and Researcher

## Non-Goals
- Model routing (Track F)
- AI Envelope integration (Track G)

## Responsibilities
- Dev: SOPExecutor and role registry
- QA: validate phase gating and quality gates

## Key Deliverables
- RoleDefinition types and registry
- SOPExecutor phase gate enforcement
- Preset SOPs for Coder and Researcher

## Tasks
1. Implement RoleRegistry and RoleDefinition
2. Implement SOPExecutor phase gating
3. Define Coder and Researcher SOPs
4. Add tests for phase and quality gates

## Acceptance Criteria
- Tool availability matches phase definitions
- Quality gates block advancement when unmet
- SOPs can be loaded and enforced per agent

## Required Tests
- Unit tests for phase gating and quality gates
- Integration test for SOP transitions

## Branch and PR Workflow
- Create branch: feature/agent-runtime-2026-track-e
- Run required tests, commit, open PR
