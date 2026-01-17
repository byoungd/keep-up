/**
 * Prompts Module
 *
 * Prompt templates and Zod schemas for structured LLM outputs.
 *
 * ## 2026 Standard
 *
 * Use the Zod schemas with Vercel AI SDK's `generateObject`:
 * - `DigestMapOutputSchema` + `buildDigestMapUserPrompt`
 * - `DigestReduceOutputSchema` + `buildDigestReduceUserPrompt`
 * - `VerifierOutputSchema` + `buildVerifierUserPrompt`
 *
 * Legacy prompt builders that include JSON schema strings are deprecated.
 */

// ============================================================================
// Modern Zod Schemas (Recommended)
// ============================================================================
export {
  // Prompt builders (for use with generateObject)
  buildDigestMapSystemPrompt,
  buildDigestMapUserPrompt,
  buildDigestReduceSystemPrompt,
  buildDigestReduceUserPrompt,
  buildVerifierSystemPrompt,
  buildVerifierUserPrompt,
  // Types
  type Citation,
  // Schemas
  CitationSchema,
  type DigestMapInput,
  type DigestMapOutput,
  DigestMapOutputSchema,
  type DigestReduceInput,
  type DigestReduceOutput,
  DigestReduceOutputSchema,
  type VerifierInput,
  type VerifierOutput,
  VerifierOutputSchema,
} from "./digestSchemas";

// ============================================================================
// Legacy Prompt Builders (Deprecated)
// ============================================================================

export type {
  DigestMapPromptInput,
  DigestReducePromptInput,
  VerifierPromptInput,
} from "./digest";
/**
 * @deprecated Use `buildDigestMapUserPrompt` with `generateObject` and `DigestMapOutputSchema` instead.
 */
/**
 * @deprecated Use `buildDigestReduceUserPrompt` with `generateObject` and `DigestReduceOutputSchema` instead.
 */
/**
 * @deprecated Use `buildVerifierUserPrompt` with `generateObject` and `VerifierOutputSchema` instead.
 */
export { buildDigestMapPrompt, buildDigestReducePrompt, buildVerifierPrompt } from "./digest";
