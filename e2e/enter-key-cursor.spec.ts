/**
 * Enter Key Cursor Position E2E Tests
 *
 * Tests to verify that the cursor position is correct after pressing Enter.
 * This is a P0 bug fix verification suite.
 *
 * Run with: npx playwright test e2e/enter-key-cursor.spec.ts
 */

import { type Page, expect, test } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

// Retry flaky tests up to 2 times in CI
test.describe.configure({ retries: process.env.CI ? 2 : 0 });

// ============================================================================
// Helpers
// ============================================================================

async function waitForEditorReady(page: Page): Promise<void> {
  await page.waitForSelector("[data-lfcc-editor]", { timeout: 10000 });
  await page.waitForFunction(
    () => typeof (window as unknown as Record<string, unknown>).__lfccView !== "undefined",
    undefined,
    { timeout: 5000 }
  );
  await page.waitForFunction(() => {
    const editor = document.querySelector(".lfcc-editor .ProseMirror");
    return Boolean(editor && editor.textContent !== null);
  });
}

async function clearEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globalAny = window as unknown as Record<string, unknown>;
    const view = globalAny.__lfccView as
      | {
          state: {
            doc: { content: { size: number } };
            tr: { replaceWith: (from: number, to: number, node: unknown) => unknown };
            schema: {
              nodes: {
                doc?: { create: (attrs: null, content?: unknown) => unknown };
                paragraph?: { create: (attrs: null, content?: unknown) => unknown };
              };
            };
          };
          dispatch: (tr: unknown) => void;
          focus: () => void;
        }
      | undefined;

    if (!view || !view.state?.schema?.nodes?.paragraph) {
      return false;
    }

    const { state } = view;
    const { paragraph, doc: docNode } = state.schema.nodes;
    if (!paragraph || !docNode) return false;
    const paragraphNode = paragraph.create(null, []);
    const nextDoc = docNode?.create(null, [paragraphNode]) ?? paragraphNode;
    const tr = state.tr.replaceWith(0, state.doc.content.size, nextDoc);
    view.dispatch(tr);
    view.focus();
    return true;
  });

  await page.waitForFunction(() => {
    const editorNode = document.querySelector(".lfcc-editor .ProseMirror");
    return (editorNode?.textContent?.trim() ?? "").length === 0;
  });
}

async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".lfcc-editor .ProseMirror");
  await editor.click();
  await page.keyboard.type(text, { delay: 30 });
}

async function getEditorBlockCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const globalAny = window as unknown as Record<string, unknown>;
    const view = globalAny.__lfccView as { state: { doc: { childCount: number } } } | undefined;
    return view?.state?.doc?.childCount ?? 0;
  });
}

/** Wait for block count to reach expected value with polling */
async function waitForBlockCount(page: Page, expected: number, timeout = 5000): Promise<void> {
  await expect
    .poll(async () => getEditorBlockCount(page), {
      timeout,
      message: `Expected ${expected} blocks`,
    })
    .toBe(expected);
}

/** Wait for cursor to be in the expected block index */
async function waitForCursorInBlock(
  page: Page,
  expectedBlock: number,
  timeout = 5000
): Promise<void> {
  await expect
    .poll(async () => getCursorBlockIndex(page), {
      timeout,
      message: `Expected cursor in block ${expectedBlock}`,
    })
    .toBe(expectedBlock);
}

/** Wait for cursor offset within block */
async function waitForCursorOffset(
  page: Page,
  expectedOffset: number,
  timeout = 5000
): Promise<void> {
  await expect
    .poll(async () => getCursorOffsetInBlock(page), {
      timeout,
      message: `Expected cursor offset ${expectedOffset}`,
    })
    .toBe(expectedOffset);
}

async function getCursorBlockIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const globalAny = window as unknown as Record<string, unknown>;
    const view = globalAny.__lfccView as
      | {
          state: {
            selection: { $from: { before: (depth: number) => number } };
            doc: { content: { childCount: number }; nodeAt: (pos: number) => unknown };
          };
        }
      | undefined;

    if (!view) {
      return -1;
    }

    const { state } = view;
    const $from = state.selection.$from;
    const blockPos = $from.before(1);

    // Find which child index this position corresponds to
    let pos = 0;
    for (let i = 0; i < state.doc.content.childCount; i++) {
      if (pos === blockPos) {
        return i;
      }
      const child = state.doc.nodeAt(pos) as { nodeSize: number } | null;
      if (child) {
        pos += child.nodeSize;
      }
    }
    return -1;
  });
}

async function getCursorOffsetInBlock(page: Page): Promise<number> {
  return page.evaluate(() => {
    const globalAny = window as unknown as Record<string, unknown>;
    const view = globalAny.__lfccView as
      | {
          state: {
            selection: { $from: { parentOffset: number } };
          };
        }
      | undefined;

    if (!view) {
      return -1;
    }
    return view.state.selection.$from.parentOffset;
  });
}

// ============================================================================
// Test Suite
// ============================================================================

test.describe("Enter Key Cursor Position", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    await clearEditor(page);
  });

  test("Enter at end of line creates new block with cursor at start", async ({ page }) => {
    await typeInEditor(page, "First line");

    // Initial state: 1 block
    await waitForBlockCount(page, 1);

    // Press Enter
    await page.keyboard.press("Enter");

    // Should now have 2 blocks (with polling, no hardcoded timeout)
    await waitForBlockCount(page, 2);

    // Cursor should be in the second block (index 1)
    await waitForCursorInBlock(page, 1);

    // Cursor should be at offset 0 (start of block)
    await waitForCursorOffset(page, 0);
  });

  test("Enter in middle of line splits block correctly", async ({ page }) => {
    await typeInEditor(page, "HelloWorld");

    // Move cursor to middle (after "Hello")
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ArrowLeft");
    }

    // Press Enter to split
    await page.keyboard.press("Enter");

    // Should have 2 blocks (polling instead of hardcoded timeout)
    await waitForBlockCount(page, 2);

    // Cursor should be in the second block (index 1)
    await waitForCursorInBlock(page, 1);

    // Cursor should be at offset 0 (start of new block containing "World")
    await waitForCursorOffset(page, 0);

    // Type to verify cursor position
    await page.keyboard.type("X");

    // The second block should now start with "X"
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const blocks = document.querySelectorAll(
            ".lfcc-editor .ProseMirror > div > [data-block-id]"
          );
          return blocks[1]?.textContent ?? "";
        });
      })
      .toMatch(/^X/);
  });

  test("Multiple Enter presses maintain correct cursor position", async ({ page }) => {
    await typeInEditor(page, "Line1");
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 2);

    await page.keyboard.type("Line2");
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 3);

    await page.keyboard.type("Line3");
    await waitForCursorInBlock(page, 2);

    // Move to middle of "Line2"
    await page.keyboard.press("ArrowUp");
    await waitForCursorInBlock(page, 1);

    // Position cursor at start of Line2
    await page.keyboard.press("Home");
    await waitForCursorOffset(page, 0);

    // Press Enter to split at start of Line2
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 4);
    await waitForCursorInBlock(page, 1);
    await waitForCursorOffset(page, 0);

    // Verify we can type and it goes to the right place
    await page.keyboard.type("NewLine");

    // Check the content structure
    const texts = await page.evaluate(() => {
      const blocks = document.querySelectorAll(".lfcc-editor .ProseMirror > div > [data-block-id]");
      return Array.from(blocks).map((b) => b.textContent);
    });

    // Should have: "Line1", "", "NewLineLine2", "Line3" or similar structure
    expect(texts.some((t) => t?.includes("NewLine"))).toBe(true);
  });

  test("cursor does not jump to wrong block after Enter", async ({ page }) => {
    // This is the specific P0 bug reproduction test
    await typeInEditor(page, "Frontend Development");
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 2);

    await page.keyboard.type("Performance Optimization");
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 3);

    await page.keyboard.type("Security Best Practices");
    await waitForCursorInBlock(page, 2);

    // Now move to the middle of "Performance Optimization"
    await page.keyboard.press("ArrowUp");
    await waitForCursorInBlock(page, 1);

    // Go to beginning and move to after "Performance "
    await page.keyboard.press("Home");
    await waitForCursorOffset(page, 0);
    for (let i = 0; i < 12; i++) {
      // Move past "Performance "
      await page.keyboard.press("ArrowRight");
    }
    await waitForCursorOffset(page, 12);

    // Record which block we're in before Enter
    const blockBefore = await getCursorBlockIndex(page);
    expect(blockBefore).toBe(1); // Should be in second block

    // Press Enter
    await page.keyboard.press("Enter");
    await waitForBlockCount(page, 4);
    await waitForCursorInBlock(page, 2);

    // Cursor should be in a NEW block (index 2), NOT jumping back to block 0
    const cursorBlock = await getCursorBlockIndex(page);

    // Critical assertion: cursor should NOT be in block 0 (Frontend Development)
    expect(cursorBlock).not.toBe(0);

    // Cursor should be at offset 0 in the new block
    const cursorOffset = await getCursorOffsetInBlock(page);
    expect(cursorOffset).toBe(0);

    // Type to verify position
    await page.keyboard.type("TEST");

    // Verify TEST appears in the right place (new block with "Optimization")
    const texts = await page.evaluate(() => {
      const blocks = document.querySelectorAll(".lfcc-editor .ProseMirror > div > [data-block-id]");
      return Array.from(blocks).map((b) => b.textContent);
    });

    // The block containing "TEST" should also contain "Optimization"
    const testBlock = texts.find((t) => t?.includes("TEST"));
    expect(testBlock).toContain("Optimization");
  });
});
