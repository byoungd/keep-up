/**
 * Cowork Risk Scoring
 *
 * Calculates deterministic risk scores from Cowork risk tags.
 */

import type { CoworkPolicyDecisionType } from "./policy";
import type { CoworkRiskTag } from "./types";

export const COWORK_RISK_WEIGHTS: Record<CoworkRiskTag, number> = {
  delete: 40,
  overwrite: 30,
  network: 25,
  connector: 20,
  batch: 15,
};

export function normalizeCoworkRiskTags(tags: string[] | undefined): CoworkRiskTag[] {
  if (!tags) {
    return [];
  }
  const normalized = new Set<CoworkRiskTag>();
  for (const tag of tags) {
    if (tag in COWORK_RISK_WEIGHTS) {
      normalized.add(tag as CoworkRiskTag);
    }
  }
  return Array.from(normalized);
}

export function computeCoworkRiskScore(
  tags: string[] | undefined,
  decision?: CoworkPolicyDecisionType
): number {
  if (decision === "deny") {
    return 100;
  }
  const normalized = normalizeCoworkRiskTags(tags);
  let score = 0;
  for (const tag of normalized) {
    score += COWORK_RISK_WEIGHTS[tag];
  }
  return Math.min(100, score);
}
