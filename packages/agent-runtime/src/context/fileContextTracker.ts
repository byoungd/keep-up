/**
 * File Context Tracker
 *
 * Tracks file reads/edits in agent context and marks files stale on external edits.
 */

import path from "node:path";

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import chokidar, { type FSWatcher } from "chokidar";
import type {
  FileContextEntry,
  FileContextHandle,
  FileContextSource,
  FileContextStatus,
} from "../types";

export interface FileContextTrackerOptions {
  /** Workspace root path used to resolve relative file paths. */
  workspacePath: string;
  /** Optional runtime event bus for stale warnings. */
  eventBus?: RuntimeEventBus;
  /** Logger for diagnostics. */
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
  /** Time window (ms) to ignore watcher events after agent writes. */
  recentWriteWindowMs?: number;
  /** awaitWriteFinish stability threshold (ms). */
  awaitWriteFinishMs?: number;
}

const DEFAULT_RECENT_WRITE_WINDOW_MS = 1500;
const DEFAULT_AWAIT_WRITE_FINISH_MS = 100;
const DEFAULT_CONTEXT_ID = "default";

export class FileContextTracker {
  private readonly options: Required<Omit<FileContextTrackerOptions, "eventBus">> & {
    eventBus?: RuntimeEventBus;
  };
  private readonly watcher: FSWatcher;
  private readonly entriesByContext = new Map<string, Map<string, FileContextEntry>>();
  private readonly watchedPaths = new Set<string>();
  private readonly recentWrites = new Map<string, number>();

  constructor(options: FileContextTrackerOptions) {
    this.options = {
      logger: console,
      recentWriteWindowMs: DEFAULT_RECENT_WRITE_WINDOW_MS,
      awaitWriteFinishMs: DEFAULT_AWAIT_WRITE_FINISH_MS,
      ...options,
    };

    this.watcher = chokidar.watch([], {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.options.awaitWriteFinishMs,
        pollInterval: 10,
      },
      followSymlinks: false,
    });

    this.watcher
      .on("change", (changedPath: string) => {
        this.handleExternalChange(changedPath);
      })
      .on("unlink", (removedPath: string) => {
        this.handleExternalChange(removedPath);
      })
      .on("error", (error: unknown) => {
        this.options.logger.warn("FileContextTracker watcher error", error);
      });
  }

  /** Get a context-scoped handle for tracking file activity. */
  getHandle(contextId?: string): FileContextHandle {
    const resolvedId = contextId ?? DEFAULT_CONTEXT_ID;
    return new FileContextHandleImpl(this, resolvedId);
  }

  /** Dispose file watchers. */
  async dispose(): Promise<void> {
    await this.watcher.close();
  }

  private mark(contextId: string, filePath: string, source: FileContextSource): FileContextEntry {
    const resolved = this.resolvePath(filePath);
    const entries = this.entriesByContext.get(contextId) ?? new Map<string, FileContextEntry>();
    const existing = entries.get(resolved.absolutePath);
    const now = Date.now();

    const next: FileContextEntry = {
      path: existing?.path ?? resolved.relativePath,
      absolutePath: resolved.absolutePath,
      status: this.resolveStatus(source),
      recordSource: source,
      lastReadAt: existing?.lastReadAt,
      lastWriteAt: existing?.lastWriteAt,
      lastExternalEditAt: existing?.lastExternalEditAt,
    };

    if (source === "read_tool" || source === "file_mentioned") {
      next.lastReadAt = now;
      next.status = "active";
    }

    if (source === "write_tool") {
      next.lastWriteAt = now;
      next.lastReadAt = now;
      next.status = "active";
      this.recentWrites.set(resolved.absolutePath, now);
    }

    if (source === "external_edit") {
      next.lastExternalEditAt = now;
      next.status = "stale";
    }

    entries.set(resolved.absolutePath, next);
    this.entriesByContext.set(contextId, entries);
    this.watchPath(resolved.absolutePath);

    return next;
  }

  private getEntry(contextId: string, filePath: string): FileContextEntry | undefined {
    const resolved = this.resolvePath(filePath);
    const entries = this.entriesByContext.get(contextId);
    return entries?.get(resolved.absolutePath);
  }

  private listStale(contextId: string): FileContextEntry[] {
    const entries = this.entriesByContext.get(contextId);
    if (!entries) {
      return [];
    }
    return Array.from(entries.values()).filter((entry) => entry.status === "stale");
  }

  private isStale(contextId: string, filePath: string): boolean {
    const entry = this.getEntry(contextId, filePath);
    return entry?.status === "stale";
  }

  private handleExternalChange(changedPath: string): void {
    const resolvedPath = this.normalizePath(changedPath);
    if (this.shouldIgnoreExternalChange(resolvedPath)) {
      return;
    }

    const updated = this.markStaleForAllContexts(resolvedPath);
    if (updated.length > 0) {
      this.emitStaleEvents(updated);
    }
  }

  private markStaleForAllContexts(
    absolutePath: string
  ): Array<{ contextId: string; entry: FileContextEntry }> {
    const updated: Array<{ contextId: string; entry: FileContextEntry }> = [];
    const now = Date.now();

    for (const [contextId, entries] of this.entriesByContext.entries()) {
      const entry = entries.get(absolutePath);
      if (!entry) {
        continue;
      }
      if (entry.status === "stale") {
        continue;
      }

      const next: FileContextEntry = {
        ...entry,
        status: "stale",
        recordSource: "external_edit",
        lastExternalEditAt: now,
      };
      entries.set(absolutePath, next);
      this.entriesByContext.set(contextId, entries);
      updated.push({ contextId, entry: { ...next, path: entry.path } });
    }

    return updated;
  }

  private emitStaleEvents(entries: Array<{ contextId: string; entry: FileContextEntry }>): void {
    if (!this.options.eventBus) {
      return;
    }

    for (const { contextId, entry } of entries) {
      this.options.eventBus.emitRaw("context:file-stale", {
        contextId,
        path: entry.path,
        absolutePath: entry.absolutePath,
        status: entry.status,
        recordSource: entry.recordSource,
        lastReadAt: entry.lastReadAt,
        lastWriteAt: entry.lastWriteAt,
        lastExternalEditAt: entry.lastExternalEditAt,
      });
    }
  }

  private shouldIgnoreExternalChange(absolutePath: string): boolean {
    const lastWrite = this.recentWrites.get(absolutePath);
    if (!lastWrite) {
      return false;
    }

    const delta = Date.now() - lastWrite;
    if (delta <= this.options.recentWriteWindowMs) {
      return true;
    }

    this.recentWrites.delete(absolutePath);
    return false;
  }

  private watchPath(absolutePath: string): void {
    if (this.watchedPaths.has(absolutePath)) {
      return;
    }

    this.watchedPaths.add(absolutePath);
    this.watcher.add(absolutePath);
  }

  private resolvePath(filePath: string): { absolutePath: string; relativePath: string } {
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(this.options.workspacePath, filePath);
    const relativePath = path.relative(this.options.workspacePath, absolutePath);
    return { absolutePath, relativePath };
  }

  private normalizePath(filePath: string): string {
    return path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(this.options.workspacePath, filePath);
  }

  private resolveStatus(source: FileContextSource): FileContextStatus {
    return source === "external_edit" ? "stale" : "active";
  }

  recordRead(contextId: string, filePath: string): void {
    this.mark(contextId, filePath, "read_tool");
  }

  recordWrite(contextId: string, filePath: string): void {
    this.mark(contextId, filePath, "write_tool");
  }

  recordMentioned(contextId: string, filePath: string): void {
    this.mark(contextId, filePath, "file_mentioned");
  }

  getEntryForContext(contextId: string, filePath: string): FileContextEntry | undefined {
    return this.getEntry(contextId, filePath);
  }

  listStaleForContext(contextId: string): FileContextEntry[] {
    return this.listStale(contextId);
  }

  isStaleForContext(contextId: string, filePath: string): boolean {
    return this.isStale(contextId, filePath);
  }
}

class FileContextHandleImpl implements FileContextHandle {
  constructor(
    private readonly tracker: FileContextTracker,
    private readonly contextId: string
  ) {}

  markRead(path: string): void {
    this.tracker.recordRead(this.contextId, path);
  }

  markWrite(path: string): void {
    this.tracker.recordWrite(this.contextId, path);
  }

  markMentioned(path: string): void {
    this.tracker.recordMentioned(this.contextId, path);
  }

  isStale(path: string): boolean {
    return this.tracker.isStaleForContext(this.contextId, path);
  }

  getEntry(path: string): FileContextEntry | undefined {
    return this.tracker.getEntryForContext(this.contextId, path);
  }

  listStale(): FileContextEntry[] {
    return this.tracker.listStaleForContext(this.contextId);
  }
}

export function createFileContextTracker(options: FileContextTrackerOptions): FileContextTracker {
  return new FileContextTracker(options);
}
