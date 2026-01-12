/**
 * LFCC Conformance Kit - Artifact Serializer (Part F)
 *
 * Saves failure artifacts for reproduction and debugging.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CanonNode } from "@keepup/core";
import { generateCanonDiff } from "../double-blind/comparator";
import type { FrontierLogEntry, MismatchInfo } from "../double-blind/types";
import type { GenConfig } from "../op-fuzzer/generator";
import type { FuzzOp } from "../op-fuzzer/types";
import { type ArtifactBundle, type ArtifactManifest, getArtifactPaths } from "./types";

/**
 * Save artifact bundle to disk
 */
export async function saveArtifacts(baseDir: string, bundle: ArtifactBundle): Promise<string> {
  const paths = getArtifactPaths(baseDir, bundle.runId);

  // Create directory
  await fs.promises.mkdir(paths.dir, { recursive: true });

  // Save seed
  await fs.promises.writeFile(
    paths.seed,
    JSON.stringify({ seed: bundle.seed, timestamp: bundle.timestamp }, null, 2)
  );

  // Save config
  await fs.promises.writeFile(paths.config, JSON.stringify(bundle.config, null, 2));

  // Save initial snapshot if present
  if (bundle.initialSnapshot) {
    await fs.promises.writeFile(paths.initialSnapshot, bundle.initialSnapshot);
  }

  // Save original ops
  await fs.promises.writeFile(paths.opsOriginal, JSON.stringify(bundle.originalOps, null, 2));

  // Save shrunk ops if present
  if (bundle.shrunkOps) {
    await fs.promises.writeFile(paths.opsShrunk, JSON.stringify(bundle.shrunkOps, null, 2));
  }

  // Save fail step
  await fs.promises.writeFile(
    paths.failStep,
    `Failure at step ${bundle.failStep}\n\n${JSON.stringify(bundle.mismatch, null, 2)}`
  );

  // Save canonical trees
  await fs.promises.writeFile(paths.canonLoro, JSON.stringify(bundle.canonLoro, null, 2));
  await fs.promises.writeFile(paths.canonShadow, JSON.stringify(bundle.canonShadow, null, 2));

  // Save canonical diff
  await fs.promises.writeFile(paths.canonDiff, bundle.canonDiff);

  // Save frontier log as JSONL
  const frontierLines = bundle.frontierLog.map((e) => JSON.stringify(e)).join("\n");
  await fs.promises.writeFile(paths.frontierLog, frontierLines);

  // Save notes
  await fs.promises.writeFile(paths.notes, generateNotes(bundle));

  // Save manifest
  const manifest: ArtifactManifest = {
    runId: bundle.runId,
    files: [
      "seed.json",
      "config.json",
      bundle.initialSnapshot ? "initial_snapshot.loro.bin" : null,
      "ops.original.json",
      bundle.shrunkOps ? "ops.shrunk.json" : null,
      "fail_step.txt",
      "canon.loro.json",
      "canon.shadow.json",
      "canon.diff.txt",
      "frontiers.log.jsonl",
      "notes.md",
    ].filter(Boolean) as string[],
    created: new Date().toISOString(),
  };
  await fs.promises.writeFile(paths.manifest, JSON.stringify(manifest, null, 2));

  return paths.dir;
}

/**
 * Generate notes markdown
 */
function generateNotes(bundle: ArtifactBundle): string {
  const lines: string[] = [
    "# LFCC Conformance Failure Report",
    "",
    `**Run ID:** ${bundle.runId}`,
    `**Timestamp:** ${new Date(bundle.timestamp).toISOString()}`,
    `**Seed:** ${bundle.seed}`,
    "",
    "## Failure Summary",
    "",
    `- **Failed at step:** ${bundle.failStep}`,
    `- **Original ops count:** ${bundle.originalOps.length}`,
    bundle.shrunkOps ? `- **Shrunk ops count:** ${bundle.shrunkOps.length}` : "",
    "",
    "## Mismatch Details",
    "",
    "```json",
    JSON.stringify(bundle.mismatch, null, 2),
    "```",
    "",
    "## Reproduction",
    "",
    "```bash",
    `pnpm conformance:replay artifacts/${bundle.runId}/ops.${bundle.shrunkOps ? "shrunk" : "original"}.json`,
    "```",
    "",
    "## Canonical Diff",
    "",
    "```",
    bundle.canonDiff,
    "```",
    "",
    bundle.notes ? `## Additional Notes\n\n${bundle.notes}` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Load artifact bundle from disk
 */
export async function loadArtifacts(artifactDir: string): Promise<ArtifactBundle> {
  const runId = path.basename(artifactDir);
  const paths = getArtifactPaths(path.dirname(artifactDir), runId);

  const seedData = JSON.parse(await fs.promises.readFile(paths.seed, "utf-8"));
  const config = JSON.parse(await fs.promises.readFile(paths.config, "utf-8"));
  const originalOps = JSON.parse(await fs.promises.readFile(paths.opsOriginal, "utf-8"));

  let shrunkOps: FuzzOp[] | null = null;
  try {
    shrunkOps = JSON.parse(await fs.promises.readFile(paths.opsShrunk, "utf-8"));
  } catch {
    // No shrunk ops
  }

  let initialSnapshot: Uint8Array | null = null;
  try {
    initialSnapshot = await fs.promises.readFile(paths.initialSnapshot);
  } catch {
    // No initial snapshot
  }

  const failStepContent = await fs.promises.readFile(paths.failStep, "utf-8");
  const failStepMatch = failStepContent.match(/step (\d+)/);
  const failStep = failStepMatch ? Number.parseInt(failStepMatch[1], 10) : 0;

  const mismatchJson = failStepContent.split("\n\n")[1] || "{}";
  const mismatch = JSON.parse(mismatchJson);

  const canonLoro = JSON.parse(await fs.promises.readFile(paths.canonLoro, "utf-8"));
  const canonShadow = JSON.parse(await fs.promises.readFile(paths.canonShadow, "utf-8"));
  const canonDiff = await fs.promises.readFile(paths.canonDiff, "utf-8");

  const frontierLogContent = await fs.promises.readFile(paths.frontierLog, "utf-8");
  const frontierLog = frontierLogContent
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const notes = await fs.promises.readFile(paths.notes, "utf-8");

  return {
    runId,
    timestamp: seedData.timestamp,
    seed: seedData.seed,
    config,
    initialSnapshot,
    originalOps,
    shrunkOps,
    failStep,
    mismatch,
    canonLoro,
    canonShadow,
    canonDiff,
    frontierLog,
    notes,
  };
}

/**
 * Create artifact bundle from harness result
 */
export function createArtifactBundle(
  seed: number,
  config: GenConfig,
  originalOps: FuzzOp[],
  shrunkOps: FuzzOp[] | null,
  mismatch: MismatchInfo,
  canonLoro: CanonNode,
  canonShadow: CanonNode,
  frontierLog: FrontierLogEntry[],
  initialSnapshot?: Uint8Array
): ArtifactBundle {
  const timestamp = Date.now();
  const runId = `${timestamp}-${seed}`;

  return {
    runId,
    timestamp,
    seed,
    config,
    initialSnapshot: initialSnapshot ?? null,
    originalOps,
    shrunkOps,
    failStep: mismatch.stepIndex,
    mismatch,
    canonLoro,
    canonShadow,
    canonDiff: generateCanonDiff(canonLoro, canonShadow),
    frontierLog,
    notes: "",
  };
}
