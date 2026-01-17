/**
 * Artifact processing service
 * Handles artifact generation, persistence, and metadata management
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { CoworkSession, CoworkTaskSummary } from "@ku0/agent-runtime";
import { isPathWithinRoots } from "@ku0/agent-runtime";
import { MAX_ARTIFACT_BYTES, PREVIEWABLE_EXTENSIONS } from "@ku0/shared";
import type { ArtifactStoreLike, SessionStoreLike } from "../../storage/contracts";
import type { CoworkArtifactPayload, CoworkArtifactRecord } from "../../storage/types";
import { extractResultContent, extractTaskSummary } from "../utils";

export class ArtifactProcessor {
  constructor(
    private readonly artifactStore: ArtifactStoreLike,
    private readonly sessionStore: SessionStoreLike
  ) {}

  /**
   * Process task completion and generate artifacts
   */
  async processTaskCompletion(
    sessionId: string,
    taskId: string,
    data?: Record<string, unknown>
  ): Promise<{
    summaryArtifact?: CoworkArtifactRecord;
    outputArtifacts: CoworkArtifactRecord[];
  }> {
    const session = await this.sessionStore.getById(sessionId);
    const summary = extractTaskSummary(data);
    const fallbackContent = extractResultContent(data);
    const artifactRoots = session ? collectArtifactRoots(session) : [];

    const outputArtifacts = summary
      ? await this.buildOutputArtifacts(summary, artifactRoots, taskId)
      : [];

    const reportContent = summary && !isSummaryEmpty(summary) ? formatSummary(summary) : null;
    const content = normalizeArtifactContent(
      outputArtifacts.length > 0 ? null : (fallbackContent ?? reportContent)
    );

    let summaryArtifact: CoworkArtifactRecord | undefined;
    if (content) {
      summaryArtifact = await this.persistArtifact(sessionId, {
        artifactId: `summary-${taskId}`,
        artifact: { type: "markdown", content },
        taskId,
        title: "Summary",
      });
    }

    const persistedOutputs: CoworkArtifactRecord[] = [];
    for (const artifact of outputArtifacts) {
      const persisted = await this.persistArtifact(sessionId, {
        artifactId: artifact.artifactId,
        artifact: artifact.artifact,
        taskId,
        title: artifact.title,
        sourcePath: artifact.sourcePath,
      });
      persistedOutputs.push(persisted);
    }

    return {
      summaryArtifact,
      outputArtifacts: persistedOutputs,
    };
  }

  /**
   * Persist artifact to storage
   */
  async persistArtifact(
    sessionId: string,
    data: {
      artifactId: string;
      artifact: CoworkArtifactPayload;
      taskId?: string;
      title?: string;
      sourcePath?: string;
    }
  ): Promise<CoworkArtifactRecord> {
    const existing = await this.artifactStore.getById(data.artifactId);
    const now = Date.now();
    const isContentChanged = existing
      ? JSON.stringify(existing.artifact) !== JSON.stringify(data.artifact)
      : true;
    const nextVersion = existing ? (isContentChanged ? existing.version + 1 : existing.version) : 1;
    const nextStatus = isContentChanged ? "pending" : (existing?.status ?? "pending");
    const nextAppliedAt = isContentChanged ? undefined : existing?.appliedAt;

    const record: CoworkArtifactRecord = {
      artifactId: data.artifactId,
      sessionId,
      taskId: data.taskId,
      title: data.title ?? deriveArtifactTitle(data.artifactId, data.artifact),
      type: data.artifact.type,
      artifact: data.artifact,
      sourcePath: data.sourcePath,
      version: nextVersion,
      status: nextStatus,
      appliedAt: nextAppliedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.artifactStore.upsert(record);
    await this.sessionStore.update(sessionId, (s: CoworkSession) => s); // Touch session
    return record;
  }

  /**
   * Get artifact by ID
   */
  async getArtifact(_sessionId: string, artifactId: string): Promise<CoworkArtifactRecord | null> {
    return this.artifactStore.getById(artifactId);
  }

  /**
   * Build artifacts from task outputs and file changes
   */
  private async buildOutputArtifacts(
    summary: CoworkTaskSummary,
    roots: string[],
    taskId: string
  ): Promise<CoworkArtifactRecord[]> {
    const artifacts: CoworkArtifactRecord[] = [];
    const candidates = this.collectCandidateArtifactPaths(summary);

    for (const filePath of candidates) {
      if (!this.isPreviewablePath(filePath)) {
        continue;
      }
      if (roots.length > 0 && !isPathWithinRoots(filePath, roots, false)) {
        continue;
      }
      const content = await this.readArtifactContent(filePath);
      if (!content) {
        continue;
      }
      artifacts.push({
        artifactId: this.buildArtifactId(taskId, filePath),
        sessionId: "", // Will be set by caller
        artifact: { type: "markdown", content },
        sourcePath: filePath,
        title: basename(filePath),
        type: "markdown",
        version: 1,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return artifacts;
  }

  private collectCandidateArtifactPaths(summary: CoworkTaskSummary): string[] {
    const paths = new Set<string>();
    for (const output of summary.outputs) {
      paths.add(output.path);
    }
    for (const change of summary.fileChanges) {
      if (change.change === "delete") {
        continue;
      }
      paths.add(change.path);
    }
    return Array.from(paths);
  }

  private isPreviewablePath(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return PREVIEWABLE_EXTENSIONS.has(ext);
  }

  private buildArtifactId(taskId: string, filePath: string): string {
    const raw = basename(filePath);
    const safe = raw.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return `output-${taskId}-${safe || "file"}`;
  }

  private async readArtifactContent(filePath: string): Promise<string | null> {
    try {
      const stats = await stat(filePath);
      if (!stats.isFile() || stats.size > MAX_ARTIFACT_BYTES) {
        return null;
      }
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }
}

// Helper functions

function collectArtifactRoots(session: CoworkSession): string[] {
  const roots = new Set<string>();
  for (const grant of session.grants) {
    if (typeof grant.rootPath === "string") {
      roots.add(grant.rootPath);
    }
    if (Array.isArray(grant.outputRoots)) {
      for (const root of grant.outputRoots) {
        roots.add(root);
      }
    }
  }
  return Array.from(roots);
}

function normalizeArtifactContent(content: string | null): string | null {
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed.length > 0 ? content : null;
}

function deriveArtifactTitle(artifactId: string, artifact: CoworkArtifactPayload): string {
  if (artifact.type === "diff") {
    return artifact.file || "Diff";
  }
  if (artifact.type === "plan") {
    return "Plan";
  }
  if (artifactId.startsWith("summary-")) {
    return "Summary";
  }
  return "Report";
}

function formatSummary(summary: CoworkTaskSummary): string {
  const lines: string[] = ["## Summary"];

  if (summary.outputs.length > 0) {
    lines.push("", "### Outputs");
    for (const output of summary.outputs) {
      lines.push(`- ${output.path} (${output.kind})`);
    }
  }

  if (summary.fileChanges.length > 0) {
    lines.push("", "### File Changes");
    for (const change of summary.fileChanges) {
      lines.push(`- ${change.change}: ${change.path}`);
    }
  }

  if (summary.actionLog.length > 0) {
    lines.push("", "### Actions");
    for (const entry of summary.actionLog) {
      lines.push(`- ${new Date(entry.timestamp).toLocaleString()}: ${entry.action}`);
    }
  }

  if (summary.followups.length > 0) {
    lines.push("", "### Follow-ups");
    for (const followup of summary.followups) {
      lines.push(`- ${followup}`);
    }
  }

  return lines.join("\n");
}

function isSummaryEmpty(summary: CoworkTaskSummary): boolean {
  return (
    summary.outputs.length === 0 &&
    summary.fileChanges.length === 0 &&
    summary.actionLog.length === 0 &&
    summary.followups.length === 0
  );
}
