# Track Y Walkthrough: Adaptive Learning

## Goal
Validate preference extraction, cross-session memory, and rule management.

## Preconditions
- Cowork app and server running.
- Lesson storage configured and persisted between sessions.
- A memory profile exists (default is fine).

## Steps
1. Open Cowork and create a task that generates TypeScript with `let`.
2. Provide feedback: "Do not use let. Prefer const."
3. Confirm a lesson appears in the lessons UI and is scoped to the current project.
4. Start a new session and repeat a similar task; confirm the agent uses `const` without prompting.
5. Delete the lesson and repeat the task; confirm the rule is no longer enforced.
6. Switch to a different profile and confirm the previous lesson does not apply.

## Expected Results
- Preferences are extracted into a persisted rule.
- Rules apply automatically in new sessions.
- Deletion and profile changes stop rule application.

## Automation
- `pnpm test:y1` through `pnpm test:y4`

## Evidence to Capture
- Lesson list before and after feedback.
- Session transcript showing rule application.
- Deletion confirmation and post-delete behavior.
