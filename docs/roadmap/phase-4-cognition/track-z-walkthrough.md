# Track Z Walkthrough: Agent Gym

## Goal
Validate the gym harness, scoring engine, and CI gate.

## Preconditions
- `@ku0/agent-gym` installed.
- Access to GitHub Actions for the repo.

## Steps
1. Run `pnpm test:z1` and confirm the harness boots and completes a run.
2. Run `pnpm test:z2` and confirm syntax errors are flagged correctly.
3. Trigger the Gym CI workflow with `gh workflow run gym` and confirm a report is published.
4. Introduce a controlled regression (lower model quality or swap to a weaker prompt) and confirm the CI gate fails.
5. Check the Cowork developer settings for the IQ score dashboard.

## Expected Results
- Harness and scoring tests pass locally.
- CI reports IQ deltas and blocks regressions.
- IQ metrics are visible in the UI.

## Automation
- `pnpm test:z1`
- `pnpm test:z2`

## Evidence to Capture
- Local test output.
- CI workflow run logs.
- Screenshot or export of the IQ dashboard.
