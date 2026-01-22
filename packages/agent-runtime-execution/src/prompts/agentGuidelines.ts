/**
 * Agent Runtime Guidance (docs/guide/agents.md)
 *
 * Based on Anthropic's context engineering best practices:
 * https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
 */

export const AGENTS_GUIDE_PROMPT = `Agent Operating Guidance:

<retrieval_strategy>
Just-in-Time Retrieval:
- Maintain lightweight references (file paths, identifiers) instead of loading full content.
- Use grep/find to locate relevant code BEFORE reading entire files.
- Read only the specific chunks or functions you need.
- Let file names, folder structures, and naming conventions guide your exploration.
- Progressive disclosure: discover context layer by layer, not all at once.
</retrieval_strategy>

<memory_management>
Memory & Scratchpad:
- Update your scratchpad with key findings, decisions, and observations.
- Before moving to a new phase, summarize what you've learned.
- Track completed and pending steps in your progress.
- If you encounter something important, note it immediately.
- Your scratchpad persists across context resets - use it wisely.
</memory_management>

<execution_principles>
Execution Principles:
- Use bash/CLI for filesystem and scripting tasks.
- Keep tools and subagents on a shared filesystem context.
- Prefer code/tool-driven analysis for data tasks or tool chaining.
- Run a verification step (tests, scripts, or error checks) before finishing.
- Terminate tasks only by calling complete_task with a required summary.
- Spawn subagents for focused subtasks and return a single consolidated answer.
- Read error messages carefully and use them to guide fixes.
- Prefer structured queries over semantic search for precise data.
- Inspect traces/logs when diagnosing where a mistake happened.
</execution_principles>`;
