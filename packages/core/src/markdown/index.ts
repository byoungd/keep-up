export {
  computeMarkdownContentHash,
  computeMarkdownLineHash,
  normalizeMarkdownText,
  splitMarkdownLines,
} from "./hash.js";
export { applyMarkdownLineOperations } from "./lineOps.js";
export { buildMarkdownSemanticIndex, resolveMarkdownSemanticTarget } from "./semantic.js";
export type {
  LineRange,
  MarkdownAppliedOperation,
  MarkdownCodeFenceBlock,
  MarkdownFrontmatterBlock,
  MarkdownHeadingBlock,
  MarkdownLineApplyResult,
  MarkdownOperation,
  MarkdownOperationEnvelope,
  MarkdownOperationError,
  MarkdownOperationErrorCode,
  MarkdownPreconditionV1,
  MarkdownSemanticIndex,
  MdDeleteLines,
  MdInsertLines,
  MdReplaceLines,
} from "./types.js";
