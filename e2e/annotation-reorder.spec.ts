import { expect, test } from "@playwright/test";
import {
  assertDocumentContains,
  openFreshEditor,
  selectRangeBetweenSubstrings,
  setEditorContent,
} from "./helpers/editor";

type PMView = import("prosemirror-view").EditorView;
type PMNode = import("prosemirror-model").Node;

test.describe("Annotation Reorder & Splitting", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "annotation-reorder");
    await setEditorContent(page, "Paragraph One\nParagraph Two");
    await assertDocumentContains(page, "Paragraph Two", { timeout: 10_000 });
  });

  /**
   * Helper to perform drag operation on a block
   * Uses raw mouse events with proper timing for dnd-kit
   */
  async function dragBlockByIndex(
    page: import("@playwright/test").Page,
    fromIndex: number,
    toIndex: number
  ) {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();

    // Hover source block to show handle
    const sourceBlock = blocks.nth(fromIndex);
    const sourceContent = sourceBlock.locator("[data-content-container]").first();
    await sourceContent.hover({ force: true });

    // Wait for handle to appear
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 2000 });

    const targetBlock = blocks.nth(toIndex);
    const handleBounds = await handle.boundingBox();
    const targetBounds = await targetBlock.boundingBox();

    if (!handleBounds || !targetBounds) {
      throw new Error("Could not get element bounds");
    }

    // Start position: center of handle
    const startX = handleBounds.x + handleBounds.width / 2;
    const startY = handleBounds.y + handleBounds.height / 2;

    // End position: above or below target block center depending on direction.
    // When moving to the last block, drop slightly below it to ensure end placement.
    const isMovingDown = fromIndex < toIndex;
    const isLastTarget = isMovingDown && toIndex === blockCount - 1;
    const endY = isLastTarget
      ? targetBounds.y + targetBounds.height + 12
      : isMovingDown
        ? targetBounds.y + targetBounds.height - 5
        : targetBounds.y + 5;
    const endX = targetBounds.x + targetBounds.width / 2;

    // Use mouse.move to position cursor at start
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(50);

    // Mouse down to start drag
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Move in steps - dnd-kit needs a smooth path for long drags
    const distance = Math.hypot(endX - startX, endY - startY);
    const steps = Math.max(25, Math.ceil(distance / 8));
    const stepDelay = distance > 300 ? 10 : 6;
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const x = startX + (endX - startX) * progress;
      const y = startY + (endY - startY) * progress;
      await page.mouse.move(x, y);
      await page.waitForTimeout(stepDelay);
    }

    // Extra pause at final position
    await page.waitForTimeout(100);

    // Release
    await page.mouse.up();
  }

  async function getUniqueAnnotationIds(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
      const overlaySelector = ".highlight-overlay .highlight-rect[data-annotation-id]";
      const targetSelector = ".lfcc-editor .lfcc-annotation-target[data-annotation-id]";
      const legacySelector = ".lfcc-editor .lfcc-annotation[data-annotation-id]";

      let nodes = document.querySelectorAll<HTMLElement>(overlaySelector);
      if (nodes.length === 0) {
        nodes = document.querySelectorAll<HTMLElement>(targetSelector);
      }
      if (nodes.length === 0) {
        nodes = document.querySelectorAll<HTMLElement>(legacySelector);
      }

      const ids = new Set<string>();
      for (const node of nodes) {
        const id = node.getAttribute("data-annotation-id");
        if (id) {
          ids.add(id);
        }
      }
      return Array.from(ids);
    });
  }

  async function getBlockTexts(page: import("@playwright/test").Page): Promise<string[]> {
    return await page.evaluate(() => {
      const blocks = document.querySelectorAll(".lfcc-editor .ProseMirror [data-block-id]");
      return Array.from(blocks, (block) => (block.textContent ?? "").trim());
    });
  }

  async function waitForBlockOrder(
    page: import("@playwright/test").Page,
    first: string,
    second: string
  ): Promise<void> {
    await expect
      .poll(
        async () => {
          const blocks = await getBlockTexts(page);
          return (
            blocks.length >= 2 &&
            blocks[0]?.includes(first) === true &&
            blocks[1]?.includes(second) === true
          );
        },
        { timeout: 8000 }
      )
      .toBe(true);
  }

  async function waitForAnnotationCount(
    page: import("@playwright/test").Page,
    expected: number,
    timeoutMs = 5000
  ): Promise<void> {
    await expect
      .poll(async () => (await getUniqueAnnotationIds(page)).length, { timeout: timeoutMs })
      .toBe(expected);
  }

  async function applyHighlight(
    page: import("@playwright/test").Page,
    start: string,
    end: string,
    expectedCount = 1
  ): Promise<void> {
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await selectRangeBetweenSubstrings(page, start, end);
      await expect(toolbar).toBeVisible({ timeout: 4000 });
      const button = toolbar.getByRole("button", { name: "Highlight yellow" });
      try {
        await button.click({ force: true, timeout: 2000 });
        await waitForAnnotationCount(page, expectedCount, 2000);
        return;
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
        await page.waitForTimeout(100);
      }
    }
  }

  test("Splits multi-block annotation when blocks are reordered via Drag Handle (UI)", async ({
    page,
  }) => {
    // 1. Create highlight across P1 and P2
    await applyHighlight(page, "Paragraph One", "Paragraph Two");

    await waitForAnnotationCount(page, 1);
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Drag P2 above P1 using the UI handle
    // P1 is index 0, P2 is index 1. We move P1 below P2, or P2 above P1.
    // Let's drag P1 (index 0) to be after P2 (index 1).
    await dragBlockByIndex(page, 0, 1);
    await waitForBlockOrder(page, "Paragraph Two", "Paragraph One");

    // 3. Verify: Should be 2 annotations now
    await waitForAnnotationCount(page, 2);
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(2);
  });

  test("Splits multi-block annotation when blocks are reordered (Programmatic)", async ({
    page,
  }) => {
    // 1. Create annotation across both paragraphs
    await applyHighlight(page, "Paragraph One", "Paragraph Two");

    // Verify sigle annotation ID initially
    // Note: Multiple DOM elements may exist (one per block), so we check unique IDs
    await waitForAnnotationCount(page, 1);
    const idSet = await getUniqueAnnotationIds(page);
    expect(idSet.length).toBe(1);

    // 2. Reorder blocks: Move "Paragraph Two" above "Paragraph One" directly via ProseMirror
    await page.evaluate(() => {
      const view = (window as unknown as { __lfccView?: PMView }).__lfccView;
      if (!view) {
        throw new Error("View not found");
      }

      const state = view.state;
      const doc = state.doc;

      // Find Paragraph Two
      let p2Pos = -1;
      let p2Node: PMNode | null = null;
      doc.descendants((node: PMNode, pos: number) => {
        if (node.textContent === "Paragraph Two") {
          p2Pos = pos;
          p2Node = node;
          return false;
        }
        return true;
      });

      if (p2Pos === -1 || !p2Node) {
        throw new Error("Paragraph Two not found");
      }

      const tr = state.tr;
      const node = p2Node; // TypeScript narrowing
      // Delete P2 from original pos
      tr.delete(p2Pos, p2Pos + node.nodeSize);
      // Insert P2 at start (pos 0)
      tr.insert(0, p2Node);

      view.dispatch(tr);
    });

    await waitForBlockOrder(page, "Paragraph Two", "Paragraph One");
    await waitForAnnotationCount(page, 2);

    // 3. Verify annotation split
    // Should now have 2 unique annotations (IDs)
    const finalIdSet = await getUniqueAnnotationIds(page);
    expect(finalIdSet.length).toBe(2);

    // Check text content - we can't easily rely on DOM order for IDs,
    // but we can check that we have coverage for both paragraphs.
    const allText = await page.locator(".lfcc-annotation").allTextContents();
    const combinedText = allText.join(" ");
    expect(combinedText).toContain("Paragraph One");
    expect(combinedText).toContain("Paragraph Two");

    // Verify neither is "Partial Match" (warning badge check)
    await expect(page.locator(".lfcc-annotation-warning")).toHaveCount(0);
  });
});
