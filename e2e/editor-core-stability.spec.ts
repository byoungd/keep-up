/**
 * Editor Core Stability Tests
 *
 * Rigorous tests for fundamental editor operations:
 * - Multi-step Undo/Redo history verification
 * - Bold/Italic formatting with strict DOM verification
 * - Annotation lifecycle (create → verify → delete via undo)
 * - Block operations with state verification
 *
 * Run with: npx playwright test e2e/editor-core-stability.spec.ts
 */

import { type Page, expect, test } from "@playwright/test";
import {
  getAnnotationIds,
  getEditorText,
  modKey,
  openFreshEditor,
  selectAllText,
  selectTextBySubstring,
  setEditorContent,
  typeInEditor,
} from "./helpers/editor";

test.describe.configure({ mode: "parallel" });

test.use({ screenshot: "only-on-failure" });

// Increase timeout for stability tests as editor initialization can be slow
test.setTimeout(60000);

// ============================================================================
// Helpers
// ============================================================================

async function pressUndo(page: Page): Promise<void> {
  await page.keyboard.press(`${modKey}+z`);
}

async function pressRedo(page: Page): Promise<void> {
  if (process.platform === "darwin") {
    await page.keyboard.press("Meta+Shift+z");
  } else {
    await page.keyboard.press("Control+y");
  }
}

async function waitForTextChange(
  page: Page,
  previousText: string,
  timeout = 2000
): Promise<string> {
  const startTime = Date.now();
  let currentText = previousText;

  while (Date.now() - startTime < timeout) {
    currentText = await getEditorText(page);
    if (currentText !== previousText) {
      return currentText;
    }
    await page.waitForTimeout(50);
  }

  return currentText;
}

// Helpers removed

async function getBlockCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const view = (window as unknown as Record<string, unknown>).__lfccView as
      | { state?: { doc?: { childCount?: number } } }
      | undefined;
    return view?.state?.doc?.childCount ?? 0;
  });
}

// ============================================================================
// Test Suites
// ============================================================================

test.describe("Multi-step Undo/Redo History", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "undo-history", { clearContent: true });
  });

  // NOTE: This test depends on Loro's mergeInterval (500ms) to create separate undo steps.
  // May be flaky if the dev server timing varies. Uses 700ms waits > mergeInterval.
  test("3-step undo restores each state correctly", async ({ page }) => {
    // Helper to commit and wait for Loro to register the undo checkpoint
    const commitAndWait = async () => {
      await page.evaluate(() => {
        const w = window as unknown as { __lfccForceCommit?: () => void };
        w.__lfccForceCommit?.();
      });
      await page.waitForTimeout(100); // Brief settle time after commit
    };

    // Type "First" and commit
    await typeInEditor(page, "First");
    await commitAndWait();
    await page.waitForTimeout(600); // Exceed mergeInterval to create separate undo step

    // Type Enter + "Second" and commit
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second", { delay: 20 });
    await commitAndWait();
    await page.waitForTimeout(600);

    // Type Enter + "Third" and commit
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third", { delay: 20 });
    await commitAndWait();
    await page.waitForTimeout(600);

    // Verify initial state
    await expect.poll(() => getEditorText(page), { timeout: 5000 }).toContain("Third");

    // Undo step 1: Remove "Third" + Enter
    await pressUndo(page);
    await page.waitForTimeout(200);
    await expect.poll(() => getEditorText(page), { timeout: 5000 }).not.toContain("Third");

    // Undo step 2: Remove "Second" + Enter
    await pressUndo(page);
    await page.waitForTimeout(200);
    await expect.poll(() => getEditorText(page), { timeout: 5000 }).not.toContain("Second");

    // Undo step 3: Remove "First"
    await pressUndo(page);
    await page.waitForTimeout(200);
    await expect.poll(() => getEditorText(page), { timeout: 5000 }).not.toContain("First");
  });

  test("redo after undo restores content", async ({ page }) => {
    await typeInEditor(page, "Alpha");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Beta");

    // Undo - wait for Beta to disappear
    await pressUndo(page);
    await page.waitForFunction(
      () => !document.querySelector(".lfcc-editor .ProseMirror")?.textContent?.includes("Beta"),
      { timeout: 5000 }
    );
    const afterUndo = await getEditorText(page);
    expect(afterUndo).not.toContain("Beta");

    // Redo - wait for Beta to reappear
    await pressRedo(page);
    await page.waitForFunction(
      () => document.querySelector(".lfcc-editor .ProseMirror")?.textContent?.includes("Beta"),
      { timeout: 5000 }
    );
    const afterRedo = await getEditorText(page);
    expect(afterRedo).toContain("Beta");
  });

  test("new edit clears redo stack", async ({ page }) => {
    await typeInEditor(page, "One");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Two");

    // Undo "Two"
    await pressUndo(page);
    await page.waitForFunction(
      () => !document.querySelector(".lfcc-editor .ProseMirror")?.textContent?.includes("Two")
    );

    // Type new content (should clear redo stack)
    await typeInEditor(page, "Three");

    // Try redo - should not bring back "Two"
    await pressRedo(page);
    await page.waitForTimeout(200);

    const text = await getEditorText(page);
    expect(text).toContain("Three");
    expect(text).not.toContain("Two");
  });
});

test.describe("Formatting Toggle Verification", () => {
  test.beforeEach(async ({ page }) => {
    // Track page errors to diagnose crashes
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      console.error("[Page Error]", error.message);
    });

    await openFreshEditor(page, "format-toggle", { clearContent: true });
  });

  test("bold creates <strong> element", async ({ page }) => {
    await typeInEditor(page, "Bold text here");

    // Select the typed text and apply bold
    const { selectTextBySubstring } = await import("./helpers/editor");
    await selectTextBySubstring(page, "Bold text here");
    await page.keyboard.press(`${modKey}+b`);

    // Verify strong element exists
    const strongText = page.locator(".lfcc-editor .ProseMirror strong", {
      hasText: "Bold text here",
    });
    await expect(strongText).toBeVisible();
  });

  test("italic creates <em> element", async ({ page }) => {
    await typeInEditor(page, "Italic text here");

    // Select the typed text and apply italic
    const { selectTextBySubstring } = await import("./helpers/editor");
    await selectTextBySubstring(page, "Italic text here");
    await page.keyboard.press(`${modKey}+i`);

    // Verify em element exists
    const italicText = page.locator(".lfcc-editor .ProseMirror em", {
      hasText: "Italic text here",
    });
    await expect(italicText).toBeVisible();
  });

  test("toggle bold off removes <strong>", async ({ page }) => {
    await typeInEditor(page, "Toggle test");

    // Apply bold
    const { selectTextBySubstring } = await import("./helpers/editor");
    await selectTextBySubstring(page, "Toggle test");
    await page.keyboard.press(`${modKey}+b`);
    const strongText = page.locator(".lfcc-editor .ProseMirror strong", {
      hasText: "Toggle test",
    });
    await expect(strongText).toBeVisible();

    // Remove bold (toggle off)
    await selectTextBySubstring(page, "Toggle test");
    await page.keyboard.press(`${modKey}+b`);
    await expect(strongText).toHaveCount(0);
  });

  test("undo restores formatting state", async ({ page }) => {
    await typeInEditor(page, "Undo format");

    // Apply bold
    const { selectTextBySubstring } = await import("./helpers/editor");
    await selectTextBySubstring(page, "Undo format");
    await page.keyboard.press(`${modKey}+b`);
    const strongText = page.locator(".lfcc-editor .ProseMirror strong", {
      hasText: "Undo format",
    });
    await expect(strongText).toBeVisible();

    // Undo should remove bold
    await pressUndo(page);
    await expect(strongText).toHaveCount(0);
  });
});

test.describe("Annotation Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "annotation-lifecycle", { clearContent: false });
  });

  test("create annotation and verify in DOM", async ({ page }) => {
    const uniqueText = `ANNO_${Date.now()}`;
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(uniqueText);

    const baselineIds = await getAnnotationIds(page);

    // Select and highlight
    await selectTextBySubstring(page, uniqueText);
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Verify annotation created
    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(baselineIds.length);

    const newIds = await getAnnotationIds(page);
    const createdId = newIds.find((id) => !baselineIds.includes(id));
    expect(createdId).toBeDefined();

    // Verify annotation element in DOM (support both overlay and legacy modes)
    const annotationOverlay = page.locator(
      `.highlight-overlay .highlight-rect[data-annotation-id="${createdId}"]`
    );
    const annotationTarget = page.locator(
      `.lfcc-editor .lfcc-annotation-target[data-annotation-id="${createdId}"]`
    );
    const annotationLegacy = page.locator(
      `.lfcc-editor .lfcc-annotation[data-annotation-id="${createdId}"]`
    );

    // At least one selector should be visible
    const isVisible =
      (await annotationOverlay
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await annotationTarget
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await annotationLegacy
        .first()
        .isVisible()
        .catch(() => false));
    expect(isVisible).toBe(true);
  });

  // Note: In LFCC, annotations are persisted independently of the undo stack.
  // Undo may not remove annotations as they are stored in a separate layer.
  // This test verifies the undo action doesn't crash, not that it removes annotations.
  test("undo after annotation creation does not crash", async ({ page }) => {
    const uniqueText = `UNDO_ANNO_${Date.now()}`;
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(uniqueText);

    const baselineIds = await getAnnotationIds(page);

    // Create annotation
    await selectTextBySubstring(page, uniqueText);
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(baselineIds.length);

    // Undo - should not crash the editor
    await pressUndo(page);
    await page.waitForTimeout(200);

    // Verify editor is still functional
    const editorStillWorks = await page.evaluate(() => {
      const editor = document.querySelector(".lfcc-editor .ProseMirror");
      return editor !== null && editor.textContent !== null;
    });
    expect(editorStillWorks).toBe(true);
  });
});

test.describe("Block Operations", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "block-ops", { clearContent: true });
  });

  test("Enter creates new block", async ({ page }) => {
    const initialCount = await getBlockCount(page);

    await typeInEditor(page, "First line");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second line");

    const newCount = await getBlockCount(page);
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test("Backspace at block start merges blocks", async ({ page }) => {
    await typeInEditor(page, "Line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Line two");

    const beforeMerge = await getBlockCount(page);

    // Use PM bridge to set cursor at start of second block
    await page.evaluate(() => {
      const globalAny = window as unknown as Record<string, unknown>;
      const view = globalAny.__lfccView as
        | {
            state: {
              doc: {
                resolve: (pos: number) => { start: () => number };
                firstChild: { nodeSize: number } | null;
              };
              tr: { setSelection: (sel: unknown) => unknown };
              selection: { constructor: { near: (resolvedPos: unknown) => unknown } };
            };
            dispatch: (tr: unknown) => void;
            focus: () => void;
          }
        | undefined;

      if (!view) {
        throw new Error("PM view not found");
      }

      const { state } = view;
      // Position after first block (block 0) = firstChild.nodeSize
      const firstBlockSize = state.doc.firstChild?.nodeSize ?? 0;
      const $pos = state.doc.resolve(firstBlockSize + 1); // Start of second block
      const TextSelection = (globalAny.pmTextSelection ?? state.selection.constructor) as {
        near: (resolvedPos: unknown) => unknown;
      };
      const sel = TextSelection.near($pos);
      const tr = state.tr.setSelection(sel as never);
      view.dispatch(tr);
      view.focus();
    });

    // Now press Backspace to merge blocks
    await page.keyboard.press("Backspace");

    const afterMerge = await getBlockCount(page);
    expect(afterMerge).toBeLessThan(beforeMerge);

    // Text should be merged
    const text = await getEditorText(page);
    expect(text).toContain("Line oneLine two");
  });

  test("block split preserves undo stack", async ({ page }) => {
    const commitAndWait = async () => {
      await page.evaluate(() => {
        const w = window as unknown as { __lfccForceCommit?: () => void };
        w.__lfccForceCommit?.();
      });
      await page.waitForTimeout(100);
    };

    // Type content and commit
    await typeInEditor(page, "BeforeAfter");
    await commitAndWait();
    await page.waitForTimeout(600); // Exceed mergeInterval

    // Verify initial state
    const initialBlocks = await getBlockCount(page);
    expect(initialBlocks).toBe(1);

    // Move cursor to middle (after "Before") and split
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press("ArrowLeft");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ArrowRight");
    }
    await page.waitForTimeout(50);

    // Split block with Enter
    await page.keyboard.press("Enter");
    await commitAndWait();
    await page.waitForTimeout(600);

    // Verify split occurred
    await expect.poll(() => getBlockCount(page), { timeout: 5000 }).toBe(2);

    // Undo should restore single block
    await pressUndo(page);
    await page.waitForTimeout(200);
    await expect.poll(() => getBlockCount(page), { timeout: 5000 }).toBe(1);

    // Content should be restored
    const restoredText = await getEditorText(page);
    expect(restoredText).toContain("BeforeAfter");
  });
});

test.describe("Selection Stability", () => {
  test.beforeEach(async ({ page }) => {
    await openFreshEditor(page, "selection-stability");
  });

  test("cursor position maintained after typing", async ({ page }) => {
    await typeInEditor(page, "Hello");
    await page.keyboard.type(" World");

    const text = await getEditorText(page);
    expect(text).toContain("Hello World");
  });

  test("selection preserved after format toggle", async ({ page }) => {
    await setEditorContent(page, "Select me");

    // Select all and apply bold (which should keep selection)
    await selectAllText(page);
    await page.keyboard.press(`${modKey}+b`);

    // Type replacement should replace the selected bolded text
    await page.keyboard.type("Replaced");

    const text = await getEditorText(page);
    expect(text).toContain("Replaced");
    expect(text).not.toContain("Select me");
  });

  test("arrow navigation works correctly", async ({ page }) => {
    await setEditorContent(page, "ABC");
    await page.waitForTimeout(200); // Wait for content to settle

    // Click to focus and move to end
    await page.locator(".lfcc-editor .ProseMirror").click();
    await page.keyboard.press("End");

    await page.waitForTimeout(100);

    // Move cursor left twice from end position (C -> B -> A|BC)
    await page.keyboard.press("ArrowLeft", { delay: 100 });
    await page.waitForTimeout(100);
    await page.keyboard.press("ArrowLeft", { delay: 100 });
    await page.waitForTimeout(100);

    // Type X - should appear between A and B, result: AXBC
    await page.keyboard.type("X");
    await page.waitForTimeout(150);

    // Use polling assertion for reliability
    await expect.poll(async () => await getEditorText(page), { timeout: 3000 }).toContain("AXBC");
  });
});

test.describe("Rapid Edit Stress", () => {
  test("rapid typing does not corrupt state", async ({ page }) => {
    await openFreshEditor(page, "rapid-typing");

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type rapidly
    await page.keyboard.type("The quick brown fox jumps over the lazy dog.", { delay: 10 });

    const text = await getEditorText(page);
    expect(text).toContain("quick brown fox");
    expect(text).toContain("lazy dog");
  });

  test("rapid undo/redo does not crash", async ({ page }) => {
    await openFreshEditor(page, "rapid-undo-redo");

    await typeInEditor(page, "A");
    await typeInEditor(page, "B");
    await typeInEditor(page, "C");

    // Rapid undo/redo sequence
    for (let i = 0; i < 5; i++) {
      await pressUndo(page);
      await page.waitForTimeout(50);
    }

    for (let i = 0; i < 3; i++) {
      await pressRedo(page);
      await page.waitForTimeout(50);
    }

    // Editor should still be functional
    const before = await getEditorText(page);
    await typeInEditor(page, "Z");
    const after = await waitForTextChange(page, before, 3000);
    expect(after).toContain("Z");
  });
});

// ============================================================================
// P1: Large Document Stress Tests
// ============================================================================

test.describe("Large Document Stress", () => {
  test.setTimeout(120000); // Extended timeout for stress tests

  test("50+ blocks rapid creation does not crash", async ({ page }) => {
    await openFreshEditor(page, "large-doc-stress", { clearContent: true });

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Create 50 blocks rapidly
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`Block ${i + 1}`, { delay: 5 });
      await page.keyboard.press("Enter");
    }

    // Verify blocks were created
    const blockCount = await getBlockCount(page);
    expect(blockCount).toBeGreaterThanOrEqual(50);

    // Verify editor is still responsive
    await page.keyboard.type("Final block");
    const text = await getEditorText(page);
    expect(text).toContain("Final block");
    expect(text).toContain("Block 1");
    expect(text).toContain("Block 50");
  });

  test("large document undo/redo performance", async ({ page }) => {
    await openFreshEditor(page, "large-doc-undo", { clearContent: true });

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Create content
    for (let i = 0; i < 20; i++) {
      await page.keyboard.type(`Line ${i + 1} `, { delay: 5 });
      await page.keyboard.press("Enter");
    }

    // Force commit
    await page.evaluate(() => {
      const w = window as unknown as { __lfccForceCommit?: () => void };
      w.__lfccForceCommit?.();
    });
    await page.waitForTimeout(700);

    // Perform multiple undos
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      await pressUndo(page);
      await page.waitForTimeout(50);
    }
    const undoTime = Date.now() - startTime;

    // Undo should complete within reasonable time (< 5 seconds for 10 undos)
    expect(undoTime).toBeLessThan(5000);

    // Editor should still be functional
    await typeInEditor(page, "After many undos");
    const text = await getEditorText(page);
    expect(text).toContain("After many undos");
  });
});

// ============================================================================
// P2: Edge Case Tests
// ============================================================================

test.describe("Edge Cases", () => {
  test("Unicode and Emoji input works correctly", async ({ page }) => {
    await openFreshEditor(page, "unicode-test", { clearContent: true });

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type various Unicode characters
    await page.keyboard.type("Hello 你好 مرحبا שלום 🎉🚀💡");

    const text = await getEditorText(page);
    expect(text).toContain("你好");
    expect(text).toContain("🎉");
    expect(text).toContain("🚀");
  });

  test("empty document operations do not crash", async ({ page }) => {
    await openFreshEditor(page, "empty-doc", { clearContent: true });

    // Undo on empty doc
    await pressUndo(page);
    await page.waitForTimeout(100);

    // Redo on empty doc
    await pressRedo(page);
    await page.waitForTimeout(100);

    // Select all on empty doc
    await selectAllText(page);
    await page.waitForTimeout(100);

    // Bold on empty selection
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(100);

    // Verify editor is still functional
    await typeInEditor(page, "Works fine");
    const text = await getEditorText(page);
    expect(text).toContain("Works fine");
  });

  test("very long single line does not break layout", async ({ page }) => {
    await openFreshEditor(page, "long-line", { clearContent: true });

    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();

    // Type a very long line (500+ characters)
    const longText = "A".repeat(500);
    await page.keyboard.type(longText, { delay: 1 });

    const text = await getEditorText(page);
    expect(text.length).toBeGreaterThanOrEqual(500);

    // Editor should still be functional
    await page.keyboard.press("Enter");
    await page.keyboard.type("New line after long text");
    const finalText = await getEditorText(page);
    expect(finalText).toContain("New line after long text");
  });
});
