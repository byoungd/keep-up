export type WorkflowType = "tdd" | "refactoring" | "debugging" | "research" | "none";

const WORKFLOW_PROMPTS: Record<WorkflowType, string | null> = {
  tdd: `You are following a Test-Driven Development workflow.

Workflow Steps:
1. Write tests FIRST, before any implementation
2. Run tests to confirm they fail (red)
3. Implement minimal code to pass tests (green)
4. Refactor for clarity while keeping tests green

Principles:
- Each test should test one specific behavior
- Use descriptive test names
- Keep tests isolated and independent`,

  refactoring: `You are following a Safe Refactoring workflow.

Workflow Steps:
1. Ensure existing tests pass before any changes
2. Make ONE small refactoring change
3. Run tests to verify no regression
4. Commit the change
5. Repeat

Principles:
- Never change behavior, only structure
- Use IDE refactoring tools when possible
- Document why each change improves the code`,

  debugging: `You are following a Systematic Debugging workflow.

Workflow Steps:
1. Reproduce the bug reliably
2. Narrow down the cause through systematic elimination
3. Form a hypothesis about the root cause
4. Fix the issue
5. Add a regression test

Principles:
- Gather evidence before guessing
- Check recent changes first
- Add logging to trace execution flow`,

  research: `You are following a Research & Documentation workflow.

Workflow Steps:
1. Understand the question or topic clearly
2. Gather relevant information from multiple sources
3. Synthesize findings into clear explanations
4. Provide examples and code samples where applicable

Principles:
- Cite sources for key claims
- Start with overview, then go into details
- Anticipate follow-up questions`,

  none: null,
};

export function getWorkflowSystemPrompt(workflow: WorkflowType): string | null {
  return WORKFLOW_PROMPTS[workflow] ?? null;
}
