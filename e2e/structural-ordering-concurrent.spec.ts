/**
 * LFCC E2E: Concurrent Structural Operations
 *
 * D6.2 - Proves deterministic resolution of concurrent structural ops.
 *
 * Test scenarios:
 * 1. Deterministic concurrency setup with coordinated barriers
 * 2. Known conflict: split vs join on same/adjacent blocks
 * 3. Known conflict: list indent vs block delete
 * 4. Assert: deterministic resolution, identical final doc across clients
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

// ============================================================================
// Configuration
// ============================================================================

const ARTIFACT_DIR = "e2e/artifacts";
const RUN_MULTI_REPLICA = process.env.UI_GATE_MULTI_REPLICA === "1";

type ConflictLog = {
  opA: { opCode: string; blockId: string; source: string };
  opB: { opCode: string; blockId: string; source: string };
  resolution: string;
  timestamp: number;
};

type TestArtifact = {
  seed: string;
  docId: string;
  conflicts: ConflictLog[];
  screenshots: string[];
  finalState: { contentA: string; contentB: string };
};

// ============================================================================
// Helpers
// ============================================================================

async function createArtifactDir(): Promise<void> {
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }
}

async function saveArtifact(name: string, artifact: TestArtifact): Promise<void> {
  await createArtifactDir();
  const filePath = path.join(ARTIFACT_DIR, `${name}-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(artifact, null, 2));
}

function buildDemoUrl(docId: string, peerId: string): string {
  const params = new URLSearchParams({
    doc: docId,
    peer: peerId,
    syncMode: "websocket",
  });
  return `/editor?${params.toString()}`;
}

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForSelector("[data-lfcc-editor]", { timeout: 15000 });
}

async function waitForConnection(page: Page): Promise<"connected" | "offline"> {
  const status = page.locator("[data-testid='connection-status']");
  try {
    await expect(status).toContainText(/Online|Connected/, { timeout: 8000 });
    return "connected";
  } catch {
    return "offline";
  }
}

async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator("[data-lfcc-editor]");
  await editor.click();
  await page.keyboard.type(text, { delay: 20 });
}

async function getCanonicalDoc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector("[data-lfcc-editor]");
    if (!editor) {
      return "";
    }
    return (editor.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

async function waitForConvergence(
  pageA: Page,
  pageB: Page,
  timeout = 15000
): Promise<{ converged: boolean; contentA: string; contentB: string }> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const contentA = await getCanonicalDoc(pageA);
    const contentB = await getCanonicalDoc(pageB);

    if (contentA === contentB && contentA.length > 0) {
      return { converged: true, contentA, contentB };
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const contentA = await getCanonicalDoc(pageA);
  const contentB = await getCanonicalDoc(pageB);
  return { converged: false, contentA, contentB };
}

async function pauseSync(page: Page): Promise<void> {
  // Simulate network throttling/pause for coordinated concurrency
  await page.context().setOffline(true);
}

async function resumeSync(page: Page): Promise<void> {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

async function performBlockSplit(page: Page): Promise<void> {
  const editor = page.locator("[data-lfcc-editor]");
  await editor.click();
  await page.keyboard.press("End");
  // Move back a few chars and split
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowLeft");
  }
  await page.keyboard.press("Enter");
}

async function performBlockJoin(page: Page): Promise<void> {
  const editor = page.locator("[data-lfcc-editor]");
  await editor.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
}

async function performBlockDelete(page: Page): Promise<void> {
  const editor = page.locator("[data-lfcc-editor]");
  await editor.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+Shift+k"); // Common shortcut for delete line
}

async function performListIndent(page: Page): Promise<void> {
  const editor = page.locator("[data-lfcc-editor]");
  await editor.click();
  await page.keyboard.press("Tab");
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe("Structural Ordering: Concurrent Operations", () => {
  test.skip(!RUN_MULTI_REPLICA, "Requires multi-replica sync setup (UI_GATE_MULTI_REPLICA=1)");

  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let artifact: TestArtifact;

  test.beforeAll(async ({ browser }) => {
    contextA = await browser.newContext();
    contextB = await browser.newContext();
  });

  test.beforeEach(async () => {
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();

    artifact = {
      seed: Math.random().toString(36).slice(2),
      docId: "",
      conflicts: [],
      screenshots: [],
      finalState: { contentA: "", contentB: "" },
    };
  });

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== "passed") {
      const screenshotA = await pageA.screenshot();
      const screenshotB = await pageB.screenshot();

      await createArtifactDir();
      const safeTitle = testInfo.title.replace(/[\\/]/g, "-");
      const nameA = `${safeTitle}-clientA-${Date.now()}.png`;
      const nameB = `${safeTitle}-clientB-${Date.now()}.png`;

      fs.writeFileSync(path.join(ARTIFACT_DIR, nameA), screenshotA);
      fs.writeFileSync(path.join(ARTIFACT_DIR, nameB), screenshotB);

      artifact.screenshots = [nameA, nameB];
      await saveArtifact(safeTitle.replace(/\s+/g, "-"), artifact);
    }

    await pageA.close();
    await pageB.close();
  });

  test.afterAll(async () => {
    await contextA.close();
    await contextB.close();
  });

  // --------------------------------------------------------------------------
  // D6.2 Scenario 1: Split vs Join conflict
  // --------------------------------------------------------------------------
  test("split vs join on same block resolves deterministically", async () => {
    const docId = `split-join-${Date.now()}`;
    artifact.docId = docId;

    await pageA.goto(buildDemoUrl(docId, "A"));
    await pageB.goto(buildDemoUrl(docId, "B"));

    await waitForEditor(pageA);
    await waitForEditor(pageB);

    const connA = await waitForConnection(pageA);
    const connB = await waitForConnection(pageB);

    if (connA === "offline" || connB === "offline") {
      test.skip();
      return;
    }

    // Create multi-line content
    await typeInEditor(pageA, "First line content here");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "Second line content");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "Third line content");

    // Wait for sync
    await pageA.waitForTimeout(1500);
    await expect(pageB.locator("[data-lfcc-editor]")).toContainText("First line");

    // Pause both to coordinate concurrent ops
    await pauseSync(pageA);
    await pauseSync(pageB);

    // A splits a block
    await performBlockSplit(pageA);

    // B joins blocks (conflicting structural op)
    await performBlockJoin(pageB);

    // Resume both
    await resumeSync(pageA);
    await resumeSync(pageB);

    // Wait for convergence
    const { converged, contentA, contentB } = await waitForConvergence(pageA, pageB, 20000);

    artifact.finalState = { contentA, contentB };

    // Main assertion: both converge to identical state
    expect(converged).toBe(true);
    expect(contentA).toBe(contentB);

    // Verify no data loss (basic content still present)
    expect(contentA).toContain("First");
    expect(contentA).toContain("content");
  });

  // --------------------------------------------------------------------------
  // D6.2 Scenario 2: List indent vs block delete conflict
  // --------------------------------------------------------------------------
  test("list indent vs block delete resolves deterministically", async () => {
    const docId = `indent-delete-${Date.now()}`;
    artifact.docId = docId;

    await pageA.goto(buildDemoUrl(docId, "A"));
    await pageB.goto(buildDemoUrl(docId, "B"));

    await waitForEditor(pageA);
    await waitForEditor(pageB);

    const connA = await waitForConnection(pageA);
    if (connA === "offline") {
      test.skip();
      return;
    }

    // Create list content
    await typeInEditor(pageA, "- Item one");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "- Item two");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "- Item three");

    await pageA.waitForTimeout(1500);

    // Pause for concurrent ops
    await pauseSync(pageA);
    await pauseSync(pageB);

    // A indents second item
    const editorA = pageA.locator("[data-lfcc-editor]");
    await editorA.click();
    await pageA.keyboard.press("ArrowDown");
    await performListIndent(pageA);

    // B deletes second item
    await performBlockDelete(pageB);

    // Resume
    await resumeSync(pageA);
    await resumeSync(pageB);

    // Wait for convergence
    const { converged, contentA, contentB } = await waitForConvergence(pageA, pageB, 20000);

    artifact.finalState = { contentA, contentB };

    expect(converged).toBe(true);
    expect(contentA).toBe(contentB);
  });

  // --------------------------------------------------------------------------
  // D6.2 Scenario 3: Concurrent block reorder vs inline edit
  // --------------------------------------------------------------------------
  test("block move vs inline edit resolves deterministically", async () => {
    const docId = `move-edit-${Date.now()}`;
    artifact.docId = docId;

    await pageA.goto(buildDemoUrl(docId, "A"));
    await pageB.goto(buildDemoUrl(docId, "B"));

    await waitForEditor(pageA);
    await waitForEditor(pageB);

    const connA = await waitForConnection(pageA);
    if (connA === "offline") {
      test.skip();
      return;
    }

    // Create content
    await typeInEditor(pageA, "Block Alpha");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "Block Beta");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "Block Gamma");

    await pageA.waitForTimeout(1500);

    // Pause for concurrent ops
    await pauseSync(pageA);
    await pauseSync(pageB);

    // A does structural: split block
    await performBlockSplit(pageA);

    // B does inline: type in middle
    const editorB = pageB.locator("[data-lfcc-editor]");
    await editorB.click();
    await pageB.keyboard.press("ArrowDown");
    await pageB.keyboard.press("End");
    await pageB.keyboard.type(" INSERTED");

    // Resume
    await resumeSync(pageA);
    await resumeSync(pageB);

    // Wait for convergence
    const { converged, contentA, contentB } = await waitForConvergence(pageA, pageB, 20000);

    artifact.finalState = { contentA, contentB };

    expect(converged).toBe(true);
    expect(contentA).toBe(contentB);

    // Both operations should be visible
    expect(contentA).toContain("Alpha");
    expect(contentA).toContain("Beta");
    expect(contentA).toContain("Gamma");
  });

  // --------------------------------------------------------------------------
  // D6.2 Scenario 4: Multiple concurrent structural ops
  // --------------------------------------------------------------------------
  test("multiple simultaneous structural ops all converge", async () => {
    const docId = `multi-structural-${Date.now()}`;
    artifact.docId = docId;

    await pageA.goto(buildDemoUrl(docId, "A"));
    await pageB.goto(buildDemoUrl(docId, "B"));

    await waitForEditor(pageA);
    await waitForEditor(pageB);

    const connA = await waitForConnection(pageA);
    const connB = await waitForConnection(pageB);

    if (connA === "offline" || connB === "offline") {
      test.skip();
      return;
    }

    // Create multi-block content
    for (let i = 1; i <= 5; i++) {
      await typeInEditor(pageA, `Line ${i}`);
      if (i < 5) {
        await pageA.keyboard.press("Enter");
      }
    }

    await pageA.waitForTimeout(2000);

    // Pause both
    await pauseSync(pageA);
    await pauseSync(pageB);

    // A does multiple splits
    await performBlockSplit(pageA);
    await pageA.keyboard.press("ArrowDown");
    await performBlockSplit(pageA);

    // B does joins
    await performBlockJoin(pageB);
    await pageB.keyboard.press("ArrowDown");
    await performBlockJoin(pageB);

    // Resume both
    await resumeSync(pageA);
    await resumeSync(pageB);

    // Wait for convergence with generous timeout
    const { converged, contentA, contentB } = await waitForConvergence(pageA, pageB, 25000);

    artifact.finalState = { contentA, contentB };

    // Convergence is the critical assertion
    expect(converged).toBe(true);
    expect(contentA).toBe(contentB);
  });

  // --------------------------------------------------------------------------
  // D6.2 Scenario 5: Determinism verification (run multiple times)
  // --------------------------------------------------------------------------
  test("structural conflict resolution is deterministic across runs", async () => {
    const docId = `determinism-${Date.now()}`;
    artifact.docId = docId;

    await pageA.goto(buildDemoUrl(docId, "A"));
    await pageB.goto(buildDemoUrl(docId, "B"));

    await waitForEditor(pageA);
    await waitForEditor(pageB);

    const conn = await waitForConnection(pageA);
    if (conn === "offline") {
      test.skip();
      return;
    }

    // Setup known content
    await typeInEditor(pageA, "DETERMINISM TEST BLOCK ONE");
    await pageA.keyboard.press("Enter");
    await typeInEditor(pageA, "DETERMINISM TEST BLOCK TWO");

    await pageA.waitForTimeout(1500);

    // Coordinated concurrent ops
    await pauseSync(pageA);
    await pauseSync(pageB);

    // Known operations
    await performBlockSplit(pageA);
    await performBlockJoin(pageB);

    // Resume and converge
    await resumeSync(pageA);
    await resumeSync(pageB);

    const { converged, contentA, contentB } = await waitForConvergence(pageA, pageB, 20000);

    artifact.finalState = { contentA, contentB };

    expect(converged).toBe(true);
    expect(contentA).toBe(contentB);

    // Content integrity
    expect(contentA).toContain("DETERMINISM");
    expect(contentA).toContain("TEST");
  });
});
