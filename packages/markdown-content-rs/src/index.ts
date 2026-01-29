import type { NativeMarkdownContentBinding } from "./types";

export type {
  LineRange,
  MarkdownAppliedOperation,
  MarkdownApplyOptions,
  MarkdownBlock,
  MarkdownCodeFenceBlock,
  MarkdownCodeSymbol,
  MarkdownContentHashOptions,
  MarkdownFrontmatterBlock,
  MarkdownFrontmatterPolicy,
  MarkdownHeadingBlock,
  MarkdownLineApplyResult,
  MarkdownOperation,
  MarkdownOperationEnvelope,
  MarkdownOperationError,
  MarkdownParseOptions,
  MarkdownParseResult,
  MarkdownPreconditionV1,
  MarkdownSemanticIndex,
  MarkdownSemanticResolutionResult,
  MarkdownSemanticTarget,
  MarkdownTargetingPolicyV1,
  NativeMarkdownContentBinding,
  PerformancePolicyV1,
} from "./types";

const browserError = new Error("Markdown content native bindings are not available in browser.");

export function getNativeMarkdownContent(): NativeMarkdownContentBinding | null {
  return null;
}

export function getNativeMarkdownContentError(): Error | null {
  return browserError;
}
