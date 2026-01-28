# Track CF: Pluggable Policy Engine

> Priority: P2
> Status: Proposed
> Owner: Security + Agent Runtime
> Dependencies: Track CE (Session Isolation)
> Source: docs/roadmap/phase-11-gateway-surfaces/README.md

---

## Objective

Implement a pluggable policy engine supporting allow/deny/ask_user rules
with external safety checkers. Based on patterns from Gemini CLI and Codex.

---

## Scope

- Policy rule schema (tool name, arguments, action)
- Rule matching engine
- Built-in actions: allow, deny, ask_user
- External safety checker plugin interface
- Policy decision telemetry
- Approval → Sandbox → Escalate pipeline

---

## Out of Scope

- UI for policy management (cowork track)
- Network-level policies
- Multi-tenant policy isolation

---

## Implementation Spec (Executable)

1) Define Policy Schema

- Create `packages/policy/src/types.ts`:
  - `PolicyRule`: match (tool, args pattern), action, reason
  - `PolicyAction`: 'allow' | 'deny' | 'ask_user'
  - `PolicyDecision`: action, rule, reason, auditId

2) Implement Rule Engine

- Create `packages/policy/src/engine.ts`:
  - Load rules from config
  - Match tool invocation against rules
  - Return first matching rule or default action

3) Add Safety Checker Interface

- Create `packages/policy/src/checkers/types.ts`:
  - `SafetyChecker`: check(tool, args) → SafetyResult
  - Support sync and async checkers
- Built-in: argument length limits, path traversal detection

4) Implement Approval Pipeline

- Create `packages/policy/src/pipeline.ts`:
  - Stage 1: Policy rule evaluation
  - Stage 2: Safety checker execution
  - Stage 3: Sandbox selection based on result
  - Stage 4: Escalation prompt if denied

5) Add Telemetry

- Emit policy decision events with:
  - Tool name, action taken, rule matched, reason
  - Escalation events with user response
- Integrate with existing audit system

---

## Deliverables

- `packages/policy/` - Policy engine package
- Built-in safety checkers
- Policy telemetry integration
- Documentation and examples

---

## Acceptance Criteria

- Policy rules control tool execution
- Safety checkers can block dangerous arguments
- ask_user prompts via Gateway protocol
- Decisions logged with telemetry
- Pipeline respects escalation responses

---

## Validation

```bash
pnpm --filter @ku0/policy test

# Manual: Configure deny rule, verify tool blocked
# Manual: Configure ask_user rule, verify prompt appears
```
