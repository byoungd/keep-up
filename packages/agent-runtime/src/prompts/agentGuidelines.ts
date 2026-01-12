/**
 * Agent Runtime Guidance (docs/guide/agents.md)
 */

export const AGENTS_GUIDE_PROMPT = `Agent Operating Guidance:
- Use bash/CLI for filesystem and scripting tasks.
- Keep tools and subagents on a shared filesystem context.
- Prefer code/tool-driven analysis for data tasks or tool chaining.
- Run a verification step (tests, scripts, or error checks) before finishing.
- Spawn subagents for focused subtasks and return a single consolidated answer.
- Avoid loading huge files; search and extract only the needed snippets.
- Read error messages carefully and use them to guide fixes.
- Prefer structured queries over semantic search for precise data.
- Inspect traces/logs when diagnosing where a mistake happened.`;
