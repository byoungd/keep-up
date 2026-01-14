/**
 * Skills Module
 *
 * Re-exports all Cowork skills for easy registration.
 */

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
