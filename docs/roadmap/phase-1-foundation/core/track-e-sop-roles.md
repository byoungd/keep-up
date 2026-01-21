# Track E: SOP Roles and Phase Gates

Owner: Runtime Developer + QA
Status: Completed

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
1. [x] Implement RoleRegistry and RoleDefinition
2. [x] Implement SOPExecutor phase gating
3. [x] Define Coder and Researcher SOPs (+ Reviewer and Architect)
4. [x] Add tests for phase and quality gates
5. [x] Integrate SOPExecutor into AgentOrchestrator

## Acceptance Criteria
- Tool availability matches phase definitions
- Quality gates block advancement when unmet
- SOPs can be loaded and enforced per agent

## Required Tests
- [x] Unit tests for phase gating and quality gates
- [x] Integration test for SOP transitions

## Branch and PR Workflow
- Create branch: feature/track-e
- Run required tests, commit, open PR
