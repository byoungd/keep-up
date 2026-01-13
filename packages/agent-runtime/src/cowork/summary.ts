/**
 * Cowork Task Summary Builder
 *
 * Builds Cowork task summaries from audit logs.
 */

import type { AuditEntry } from "../types";
import { isPathWithinRoots } from "./policy";
import type { CoworkFileChange, CoworkOutputArtifact, CoworkTaskSummary } from "./types";

export interface CoworkTaskSummaryConfig {
  taskId: string;
  auditEntries: AuditEntry[];
  outputRoots?: string[];
  caseInsensitivePaths?: boolean;
}

export function buildCoworkTaskSummary(config: CoworkTaskSummaryConfig): CoworkTaskSummary {
  const outputRoots = config.outputRoots ?? [];
  const caseInsensitivePaths = config.caseInsensitivePaths ?? false;
  const fileChanges: CoworkFileChange[] = [];
  const outputs: CoworkOutputArtifact[] = [];

  for (const entry of config.auditEntries) {
    if (entry.action !== "result") {
      continue;
    }

    const fileChange = mapFileChange(entry);
    if (fileChange) {
      fileChanges.push(fileChange);

      if (
        outputRoots.length > 0 &&
        isPathWithinRoots(fileChange.path, outputRoots, caseInsensitivePaths)
      ) {
        outputs.push({ path: fileChange.path, kind: "document" });
      }
    }
  }

  return {
    taskId: config.taskId,
    outputs: dedupeOutputs(outputs),
    fileChanges,
    actionLog: config.auditEntries.map((entry) => ({
      timestamp: entry.timestamp,
      action: entry.action,
      details: `${entry.toolName}`,
    })),
    followups: [],
  };
}

function mapFileChange(entry: AuditEntry): CoworkFileChange | null {
  if (!entry.toolName.startsWith("file:")) {
    return null;
  }

  const pathValue = entry.input?.path;
  if (typeof pathValue !== "string") {
    return null;
  }

  const operation = entry.toolName.split(":")[1];

  switch (operation) {
    case "write":
      return { path: pathValue, change: "update" };
    case "delete":
      return { path: pathValue, change: "delete" };
    case "move":
      return { path: pathValue, change: "move" };
    case "rename":
      return { path: pathValue, change: "rename" };
    case "create":
      return { path: pathValue, change: "create" };
    default:
      return null;
  }
}

function dedupeOutputs(outputs: CoworkOutputArtifact[]): CoworkOutputArtifact[] {
  const seen = new Set<string>();
  const result: CoworkOutputArtifact[] = [];

  for (const output of outputs) {
    if (seen.has(output.path)) {
      continue;
    }
    seen.add(output.path);
    result.push(output);
  }

  return result;
}
