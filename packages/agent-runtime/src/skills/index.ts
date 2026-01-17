/**
 * Skills Module
 *
 * Re-exports all Cowork skills for easy registration.
 */

export type { DataExtractionConfig, ExtractionResult } from "./dataExtraction";
export { createDataExtractionTools, dataExtractionSkill } from "./dataExtraction";
export {
  createSkillExecutionBridge,
  SkillExecutionBridge,
  type SkillExecutionBridgeOptions,
} from "./skillExecutionBridge";
export type { SkillFrontmatter, SkillParseOutcome } from "./skillParsing";
export { createSkillPolicyGuard, SkillPolicyGuard } from "./skillPolicyGuard";
export { createSkillPromptAdapter, SkillPromptAdapter } from "./skillPromptAdapter";
export {
  createSkillRegistry,
  type SkillDirectoryConfig,
  type SkillDiscoveryResult,
  SkillRegistry,
  type SkillRegistryOptions,
  type SkillValidationError,
} from "./skillRegistry";
export {
  createSkillResolver,
  SkillResolver,
  type SkillResolverOptions,
} from "./skillResolver";
export { createSkillSession, SkillSession } from "./skillSession";
export { createSkillToolServer, SkillToolServer } from "./skillToolServer";
export type { WebBrowsingConfig } from "./webBrowsing";
export { createWebBrowsingTools, webBrowsingSkill } from "./webBrowsing";

/**
 * All available skills for bulk registration.
 */
export const allSkills = [
  () => import("./dataExtraction").then((m) => m.dataExtractionSkill),
  () => import("./webBrowsing").then((m) => m.webBrowsingSkill),
];
