import { expect, test } from "@playwright/test";
import { waitForEditorReady } from "./helpers/editor";

test.describe("Block Drag-to-Reorder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  /**
   * Helper to get all block texts in order
   */
  async function getAllBlockTexts(page: import("@playwright/test").Page): Promise<string[]> {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const count = await blocks.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const content = blocks.nth(i).locator("[data-content-container]").first();
      const text = (await content.textContent()) ?? "";
      texts.push(text.trim());
    }
    return texts;
  }

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

    // Wait for transaction
    await page.waitForTimeout(500);
  }

  test("Block hover gutter handle appears", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    // Hover first block
    const firstContent = blocks.first().locator("[data-content-container]").first();
    await firstContent.hover({ force: true });

    // Handle should be visible
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 2000 });
  });

  test("Drag block DOWN - moves block after target", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    // Get initial order
    const initialTexts = await getAllBlockTexts(page);

    // Drag first block to after second block
    await dragBlockByIndex(page, 0, 1);
    await page.waitForTimeout(500);

    // Verify reorder happened
    const newTexts = await getAllBlockTexts(page);

    expect(newTexts[0]).toBe(initialTexts[1]); // Second is now first
    expect(newTexts[1]).toBe(initialTexts[0]); // First is now second
    expect(newTexts[2]).toBe(initialTexts[2]); // Third unchanged
  });

  test("Drag block UP - moves block before target", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    // Get initial order
    const initialTexts = await getAllBlockTexts(page);

    // Drag third block to before first block
    await dragBlockByIndex(page, 2, 0);
    await page.waitForTimeout(500);

    // Verify reorder happened
    const newTexts = await getAllBlockTexts(page);

    expect(newTexts[0]).toBe(initialTexts[2]); // Third is now first
    expect(newTexts[1]).toBe(initialTexts[0]); // First is now second
    expect(newTexts[2]).toBe(initialTexts[1]); // Second is now third
  });

  test("Drag to same position - no change", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    const initialTexts = await getAllBlockTexts(page);

    // Hover and start drag on first block
    const firstContent = blocks.first().locator("[data-content-container]").first();
    await firstContent.hover({ force: true });

    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible();

    const handleBounds = await handle.boundingBox();
    const firstBounds = await blocks.first().boundingBox();
    if (!handleBounds || !firstBounds) {
      throw new Error("Bounds not found");
    }

    // Drag within same block
    await page.mouse.move(handleBounds.x + 5, handleBounds.y + 5);
    await page.mouse.down();
    await page.mouse.move(firstBounds.x + 10, firstBounds.y + 10, { steps: 3 });
    await page.mouse.up();

    await page.waitForTimeout(300);
    const newTexts = await getAllBlockTexts(page);
    expect(newTexts).toEqual(initialTexts);
  });

  test("Block count remains same after drag", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const initialCount = await blocks.count();
    expect(initialCount).toBeGreaterThanOrEqual(3);

    await dragBlockByIndex(page, 0, 1);
    await page.waitForTimeout(500);

    const finalCount = await blocks.count();
    expect(finalCount).toBe(initialCount);
  });

  test("No duplicate block IDs after drag", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    const getBlockIds = async () => {
      const ids: string[] = [];
      const count = await blocks.count();
      for (let i = 0; i < count; i++) {
        const id = await blocks.nth(i).getAttribute("data-block-id");
        if (id) {
          ids.push(id);
        }
      }
      return ids;
    };

    const initialIds = await getBlockIds();

    await dragBlockByIndex(page, 0, 1);
    await page.waitForTimeout(500);

    const newIds = await getBlockIds();

    expect(newIds.length).toBe(initialIds.length);
    expect(new Set(newIds).size).toBe(newIds.length); // All unique
    expect(new Set(newIds)).toEqual(new Set(initialIds)); // Same IDs
  });

  test("No console errors during drag operation", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    await dragBlockByIndex(page, 0, 1);
    await page.waitForTimeout(1000);

    // Filter for critical errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        err.includes("Duplicate block") ||
        err.includes("LORO_APPLY_FAIL") ||
        err.includes("Invalid block tree")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("Drag last block to first position", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    const initialTexts = await getAllBlockTexts(page);

    await dragBlockByIndex(page, blockCount - 1, 0);
    await page.waitForTimeout(500);

    const newTexts = await getAllBlockTexts(page);
    expect(newTexts[0]).toBe(initialTexts[blockCount - 1]);
  });

  test("Drag first block to last position", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    const initialTexts = await getAllBlockTexts(page);

    await dragBlockByIndex(page, 0, blockCount - 1);
    await page.waitForTimeout(500);

    const newTexts = await getAllBlockTexts(page);
    expect(newTexts[newTexts.length - 1]).toBe(initialTexts[0]);
  });

  test("Multiple consecutive drags work correctly", async ({ page }) => {
    const blocks = page.locator(".lfcc-editor .ProseMirror > div > [data-block-id]");
    const blockCount = await blocks.count();
    expect(blockCount).toBeGreaterThanOrEqual(3);

    const initialTexts = await getAllBlockTexts(page);

    // First drag
    await dragBlockByIndex(page, 0, 1);
    await page.waitForTimeout(500);

    // Second drag
    await dragBlockByIndex(page, 2, 0);
    await page.waitForTimeout(500);

    const finalTexts = await getAllBlockTexts(page);
    expect(finalTexts.length).toBe(initialTexts.length);

    // All original content should still exist
    for (const text of initialTexts) {
      expect(finalTexts).toContain(text);
    }
  });
});
