/**
 * Browser Manager
 *
 * Manages Playwright browser lifecycle and per-session contexts.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page, type Video } from "playwright";
import {
  type AccessibilitySnapshot,
  buildAccessibilitySnapshot,
  parseAccessibilitySnapshotText,
  type RawAccessibilityNode,
} from "./accessibilityMapper";

export interface BrowserManagerOptions {
  headless?: boolean;
  recordingDir?: string;
  viewport?: { width: number; height: number };
}

export interface BrowserSessionConfig {
  recordVideo?: boolean;
  recordVideoDir?: string;
  viewport?: { width: number; height: number };
  newContext?: boolean;
}

export interface BrowserSession {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  lastSnapshot?: AccessibilitySnapshot;
  lastUsedAt: number;
  recordingDir?: string;
}

export interface BrowserCloseResult {
  recordingPath?: string;
}

export class BrowserManager {
  private browser?: Browser;
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly options: BrowserManagerOptions;

  constructor(options: BrowserManagerOptions = {}) {
    this.options = options;
  }

  async getSession(sessionId: string, config: BrowserSessionConfig = {}): Promise<BrowserSession> {
    const existing = this.sessions.get(sessionId);
    if (existing && !config.newContext) {
      existing.lastUsedAt = Date.now();
      return existing;
    }

    if (existing) {
      await this.closeSession(sessionId);
    }

    const browser = await this.ensureBrowser();
    const shouldRecord = config.recordVideo ?? Boolean(this.options.recordingDir);
    const recordingDir = shouldRecord
      ? (config.recordVideoDir ?? this.options.recordingDir)
      : undefined;
    if (recordingDir) {
      await mkdir(recordingDir, { recursive: true });
    }

    const context = await browser.newContext({
      viewport: config.viewport ?? this.options.viewport,
      recordVideo: recordingDir ? { dir: recordingDir } : undefined,
    });

    const page = await context.newPage();
    const session: BrowserSession = {
      sessionId,
      context,
      page,
      lastUsedAt: Date.now(),
      recordingDir,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async getPage(sessionId: string, config?: BrowserSessionConfig): Promise<Page> {
    const session = await this.getSession(sessionId, config);
    return session.page;
  }

  async snapshot(
    sessionId: string,
    options: { interestingOnly?: boolean } = {}
  ): Promise<AccessibilitySnapshot> {
    const session = await this.getSession(sessionId);
    const page = session.page as Page & {
      accessibility?: { snapshot?: (input: { interestingOnly: boolean }) => Promise<unknown> };
      _snapshotForAI?: () => Promise<{ full?: string }>;
    };
    let raw: RawAccessibilityNode | null = null;

    if (page.accessibility?.snapshot) {
      raw = (await page.accessibility.snapshot({
        interestingOnly: options.interestingOnly ?? true,
      })) as RawAccessibilityNode | null;
    } else if (page._snapshotForAI) {
      const aiSnapshot = await page._snapshotForAI();
      if (aiSnapshot?.full) {
        raw = parseAccessibilitySnapshotText(aiSnapshot.full);
      }
    }
    const snapshot = buildAccessibilitySnapshot(raw);
    session.lastSnapshot = snapshot;
    session.lastUsedAt = Date.now();
    return snapshot;
  }

  getSnapshot(sessionId: string): AccessibilitySnapshot | undefined {
    return this.sessions.get(sessionId)?.lastSnapshot;
  }

  async closeSession(sessionId: string): Promise<BrowserCloseResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {};
    }

    const video = session.page.video();
    await session.page.close();
    await session.context.close();
    this.sessions.delete(sessionId);

    const recordingPath = video ? await safeVideoPath(video) : undefined;
    return { recordingPath };
  }

  async dispose(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.options.headless ?? true,
      });
    }
    return this.browser;
  }
}

async function safeVideoPath(video: Video | null | undefined) {
  if (!video) {
    return undefined;
  }
  try {
    const path = await video.path();
    await mkdir(dirname(path), { recursive: true });
    return path;
  } catch {
    return undefined;
  }
}
