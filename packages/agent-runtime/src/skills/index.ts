/**
 * Skills Module
 *
 * Re-exports all Cowork skills for easy registration.
 */

export {
  SkillRegistry,
  createSkillRegistry,
  type SkillDirectoryConfig,
  type SkillDiscoveryResult,
  type SkillRegistryOptions,
  type SkillValidationError,
} from "./skillRegistry";
export {
  SkillResolver,
  createSkillResolver,
  type SkillResolverOptions,
} from "./skillResolver";
export { SkillPromptAdapter, createSkillPromptAdapter } from "./skillPromptAdapter";
export { SkillPolicyGuard, createSkillPolicyGuard } from "./skillPolicyGuard";
export { SkillSession, createSkillSession } from "./skillSession";
export {
  SkillExecutionBridge,
  createSkillExecutionBridge,
  type SkillExecutionBridgeOptions,
} from "./skillExecutionBridge";
export { SkillToolServer, createSkillToolServer } from "./skillToolServer";
export type { SkillFrontmatter, SkillParseOutcome } from "./skillParsing";

export { createDataExtractionTools, dataExtractionSkill } from "./dataExtraction";
export type { DataExtractionConfig, ExtractionResult } from "./dataExtraction";

export { createWebBrowsingTools, webBrowsingSkill } from "./webBrowsing";
export type { WebBrowsingConfig } from "./webBrowsing";

/**
 * All available skills for bulk registration.
 */
export const allSkills = [
  () => import("./dataExtraction").then((m) => m.dataExtractionSkill),
  () => import("./webBrowsing").then((m) => m.webBrowsingSkill),
];
