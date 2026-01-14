/**
 * LFCC Conformance Kit - Canonical Tree Comparator
 *
 * Deep structural comparison of CanonNode trees.
 */

import { type CanonNode, isCanonText } from "@ku0/core";
import type { MismatchInfo } from "./types";

/** Comparison result */
export type CompareResult = {
  equal: boolean;
  mismatch?: MismatchInfo;
};

function getNodeType(node: CanonNode): string {
  return isCanonText(node) ? "text" : node.type;
}

/**
 * Compare two canonical trees for semantic equality
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: comparator logic is naturally complex
export function compareCanonTrees(
  loro: CanonNode,
  shadow: CanonNode,
  stepIndex: number,
  path = "root"
): CompareResult {
  const loroType = getNodeType(loro);
  const shadowType = getNodeType(shadow);

  // Compare type
  if (loroType !== shadowType) {
    return {
      equal: false,
      mismatch: {
        stepIndex,
        path,
        loroValue: loroType,
        shadowValue: shadowType,
        description: `Type mismatch: loro="${loroType}", shadow="${shadowType}"`,
      },
    };
  }

  // Compare attrs (if present on block nodes)
  if ("attrs" in loro && "attrs" in shadow) {
    const loroAttrs = JSON.stringify(sortKeys(loro.attrs ?? {}));
    const shadowAttrs = JSON.stringify(sortKeys(shadow.attrs ?? {}));
    if (loroAttrs !== shadowAttrs) {
      return {
        equal: false,
        mismatch: {
          stepIndex,
          path: `${path}.attrs`,
          loroValue: loro.attrs,
          shadowValue: shadow.attrs,
          description: "Attrs mismatch",
        },
      };
    }
  }

  // Compare text content (for text nodes)
  if ("text" in loro && "text" in shadow) {
    if (loro.text !== shadow.text) {
      return {
        equal: false,
        mismatch: {
          stepIndex,
          path: `${path}.text`,
          loroValue: loro.text,
          shadowValue: shadow.text,
          description: `Text mismatch: loro="${truncate(loro.text, 50)}", shadow="${truncate(shadow.text, 50)}"`,
        },
      };
    }
  }

  // Compare marks (for text nodes)
  if ("marks" in loro && "marks" in shadow) {
    const loroMarks = normalizeMarks(loro.marks ?? []);
    const shadowMarks = normalizeMarks(shadow.marks ?? []);

    if (JSON.stringify(loroMarks) !== JSON.stringify(shadowMarks)) {
      return {
        equal: false,
        mismatch: {
          stepIndex,
          path: `${path}.marks`,
          loroValue: loroMarks,
          shadowValue: shadowMarks,
          description: "Marks mismatch",
        },
      };
    }
  }

  // Compare children
  if ("children" in loro && "children" in shadow) {
    const loroChildren = loro.children ?? [];
    const shadowChildren = shadow.children ?? [];

    if (loroChildren.length !== shadowChildren.length) {
      return {
        equal: false,
        mismatch: {
          stepIndex,
          path: `${path}.children`,
          loroValue: loroChildren.length,
          shadowValue: shadowChildren.length,
          description: `Children count mismatch: loro=${loroChildren.length}, shadow=${shadowChildren.length}`,
        },
      };
    }

    for (let i = 0; i < loroChildren.length; i++) {
      const childResult = compareCanonTrees(
        loroChildren[i],
        shadowChildren[i],
        stepIndex,
        `${path}.children[${i}]`
      );
      if (!childResult.equal) {
        return childResult;
      }
    }
  }

  return { equal: true };
}

/**
 * Normalize marks for comparison (sort by type)
 */
function normalizeMarks(marks: string[]): string[] {
  return [...marks].sort();
}

/**
 * Sort object keys for deterministic comparison
 */
function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/**
 * Truncate string for display
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  return `${str.slice(0, maxLen - 3)}...`;
}

/**
 * Generate readable diff between two canonical trees
 */
export function generateCanonDiff(loro: CanonNode, shadow: CanonNode): string {
  const lines: string[] = [];
  lines.push("=== Canonical Tree Diff ===");
  lines.push("");

  diffNode(loro, shadow, "", lines);

  return lines.join("\n");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diff logic is complex
function diffNode(loro: CanonNode, shadow: CanonNode, indent: string, lines: string[]): void {
  const loroType = getNodeType(loro);
  const shadowType = getNodeType(shadow);

  if (loroType !== shadowType) {
    lines.push(`${indent}TYPE MISMATCH:`);
    lines.push(`${indent}  loro:   ${loroType}`);
    lines.push(`${indent}  shadow: ${shadowType}`);
    return;
  }

  lines.push(`${indent}${loroType}:`);

  // Compare text
  if ("text" in loro && "text" in shadow) {
    if (loro.text !== shadow.text) {
      lines.push(`${indent}  TEXT MISMATCH:`);
      lines.push(`${indent}    loro:   "${truncate(loro.text, 40)}"`);
      lines.push(`${indent}    shadow: "${truncate(shadow.text, 40)}"`);
    }
  }

  if ("marks" in loro && "marks" in shadow) {
    const loroMarks = JSON.stringify(normalizeMarks(loro.marks ?? []));
    const shadowMarks = JSON.stringify(normalizeMarks(shadow.marks ?? []));
    if (loroMarks !== shadowMarks) {
      lines.push(`${indent}  MARKS MISMATCH:`);
      lines.push(`${indent}    loro:   ${loroMarks}`);
      lines.push(`${indent}    shadow: ${shadowMarks}`);
    }
  }

  // Compare children
  if ("children" in loro && "children" in shadow) {
    const loroChildren = loro.children ?? [];
    const shadowChildren = shadow.children ?? [];

    const maxLen = Math.max(loroChildren.length, shadowChildren.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= loroChildren.length) {
        lines.push(`${indent}  [${i}] MISSING in loro`);
      } else if (i >= shadowChildren.length) {
        lines.push(`${indent}  [${i}] MISSING in shadow`);
      } else {
        diffNode(loroChildren[i], shadowChildren[i], `${indent}  `, lines);
      }
    }
  }
}
