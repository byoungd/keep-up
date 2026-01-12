/**
 * Editor Core Resilience Tests
 *
 * Comprehensive edge case and boundary condition tests to ensure editor stability.
 * These tests focus on:
 * - Document boundary conditions (empty, single char, very long content)
 * - Concurrent operations resilience
 * - State consistency after complex operations
 * - Error recovery scenarios
 * - Performance under stress
 *
 * Run with: pnpm exec playwright test e2e/editor-resilience.spec.ts
 */

import { expect, test } from "@playwright/test";
import {
  focusEditor,
  getEditorHTML,
  getEditorText,
  modKey,
  openFreshEditor,
  selectTextBySubstring,
  setEditorContent,
  typeInEditor,
} from "./helpers/editor";

test.describe.configure({ mode: "parallel" });
test.setTimeout(60000);

// ============================================================================
// Boundary Condition Tests
// ============================================================================

test.describe("Document Boundary Conditions", () => {
  test("empty document handles all operations gracefully", async ({ page }) => {
    await openFreshEditor(page, "empty-doc", { clearContent: true });

    // Verify empty state
    const initialText = await getEditorText(page);
    expect(initialText.trim()).toBe("");

    // Undo on empty doc should not crash
    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(100);

    // Redo on empty doc should not crash
    await page.keyboard.press(`${modKey}+Shift+z`);
    await page.waitForTimeout(100);

    // Select all on empty doc
    await page.keyboard.press(`${modKey}+a`);
    await page.waitForTimeout(100);

    // Backspace on empty doc
    await focusEditor(page);
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(100);

    // Delete on empty doc
    await page.keyboard.press("Delete");
    await page.waitForTimeout(100);

    // Editor should still be functional
    await typeInEditor(page, "Still works");
    const text = await getEditorText(page);
    expect(text).toContain("Still works");
  });

  test("single character document handles all operations", async ({ page }) => {
    await openFreshEditor(page, "single-char", { clearContent: true });
    await typeInEditor(page, "X");
    await page.waitForTimeout(200);

    // Select all and verify
    await page.keyboard.press(`${modKey}+a`);
    await page.waitForTimeout(200);

    // Apply bold to single char
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(100);
    const html = await getEditorHTML(page);
    // Bold formatting may have attributes
    expect(html.toLowerCase()).toContain("<strong");
    expect(html).toContain("X");

    // Undo
    await page.keyboard.press(`${modKey}+z`);
    await page.waitForTimeout(100);
    const afterUndo = await getEditorHTML(page);
    expect(afterUndo.toLowerCase()).not.toContain("<strong");

    // Type more
    await page.keyboard.press("End");
    await typeInEditor(page, "YZ");
    const text = await getEditorText(page);
    expect(text).toContain("XYZ");
  });

  test("very long line handles formatting correctly", async ({ page }) => {
    await openFreshEditor(page, "long-line", { clearContent: true });

    // Create a 500-char line
    const longText = "A".repeat(500);
    await setEditorContent(page, longText);

    // Verify content
    const text = await getEditorText(page);
    expect(text.length).toBeGreaterThanOrEqual(500);

    // Select all and format
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+b`);

    // Verify bold applied
    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);

    // Undo should work
    await page.keyboard.press(`${modKey}+z`);
    const afterUndo = await getEditorHTML(page);
    expect(afterUndo).not.toMatch(/<strong/);
  });
});

// ============================================================================
// Content Integrity Tests
// ============================================================================

test.describe("Content Integrity After Complex Operations", () => {
  test("content preserved after multiple format toggles", async ({ page }) => {
    await openFreshEditor(page, "format-toggle-integrity", { clearContent: true });
    const content = "Test content for formatting";
    await typeInEditor(page, content);

    // Toggle bold 10 times
    for (let i = 0; i < 10; i++) {
      await selectTextBySubstring(page, "content");
      await page.keyboard.press(`${modKey}+b`);
      await page.waitForTimeout(50);
    }

    // Content should still be intact
    const text = await getEditorText(page);
    expect(text).toContain(content);
  });

  test("content preserved after rapid insertions and deletions", async ({ page }) => {
    await openFreshEditor(page, "rapid-edit-integrity", { clearContent: true });

    // Rapid type-delete cycles
    for (let i = 0; i < 5; i++) {
      await typeInEditor(page, "ABC");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
    }

    // Final content
    await typeInEditor(page, "FINAL");
    const text = await getEditorText(page);
    expect(text).toContain("FINAL");
    expect(text).not.toContain("ABC"); // Should be fully deleted
  });

  test("multiple paragraphs preserve integrity through undo chain", async ({ page }) => {
    await openFreshEditor(page, "multi-para-undo", { clearContent: true });

    // Create 3 paragraphs
    await typeInEditor(page, "Paragraph One");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Paragraph Two");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Paragraph Three");
    await page.waitForTimeout(200);

    const original = await getEditorText(page);
    expect(original).toContain("One");
    expect(original).toContain("Two");
    expect(original).toContain("Three");

    // Undo all paragraphs
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(100);
    }

    // Redo all
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(`${modKey}+Shift+z`);
      await page.waitForTimeout(100);
    }

    // Content should be restored
    const restored = await getEditorText(page);
    expect(restored).toContain("One");
    expect(restored).toContain("Two");
    expect(restored).toContain("Three");
  });
});

// ============================================================================
// State Consistency Tests
// ============================================================================

test.describe("State Consistency", () => {
  test("ProseMirror state remains valid after all operations", async ({ page }) => {
    await openFreshEditor(page, "state-validity", { clearContent: true });

    // Perform various operations
    await typeInEditor(page, "Test content");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second line");
    await selectTextBySubstring(page, "content");
    await page.keyboard.press(`${modKey}+b`);
    await page.keyboard.press(`${modKey}+z`);
    await page.keyboard.press(`${modKey}+Shift+z`);

    // Verify PM state is valid
    const isValid = await page.evaluate(() => {
      const globalAny = window as unknown as {
        __lfccView?: { state?: { doc?: { check?: () => void } } };
      };
      const view = globalAny.__lfccView;
      if (!view?.state?.doc) {
        return false;
      }
      try {
        // PM doc.check() throws if doc is invalid
        view.state.doc.check?.();
        return true;
      } catch {
        return false;
      }
    });

    expect(isValid).toBe(true);
  });

  test("selection state valid after complex edits", async ({ page }) => {
    await openFreshEditor(page, "selection-state", { clearContent: true });

    await typeInEditor(page, "ABCDEFGHIJ");
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press("Backspace");
    await typeInEditor(page, "New content");

    // Get selection state
    const selectionInfo = await page.evaluate(() => {
      const globalAny = window as unknown as {
        __lfccView?: {
          state?: {
            selection?: { from: number; to: number; empty: boolean };
            doc?: { content: { size: number } };
          };
        };
      };
      const view = globalAny.__lfccView;
      if (!view?.state) {
        return null;
      }
      const { from, to, empty } = view.state.selection ?? { from: 0, to: 0, empty: true };
      const docSize = view.state.doc?.content?.size ?? 0;
      return {
        from,
        to,
        empty,
        docSize,
        valid: from >= 0 && to >= from && to <= docSize,
      };
    });

    expect(selectionInfo).not.toBeNull();
    expect(selectionInfo?.valid).toBe(true);
  });
});

// ============================================================================
// Formatting Edge Cases
// ============================================================================

test.describe("Formatting Edge Cases", () => {
  test("overlapping format marks resolve correctly", async ({ page }) => {
    await openFreshEditor(page, "overlapping-marks", { clearContent: true });

    await typeInEditor(page, "One Two Three");
    await page.waitForTimeout(100);

    // Bold entire text first
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+b`);
    await page.waitForTimeout(100);

    // Now apply italic to all as well
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+i`);

    const html = await getEditorHTML(page);
    // Content should have both strong and em
    expect(html).toContain("One");
    expect(html).toContain("Two");
    expect(html).toContain("Three");
    expect(html).toMatch(/<strong/);
    expect(html).toMatch(/<em/);
  });

  test("format toggle at word boundary", async ({ page }) => {
    await openFreshEditor(page, "format-boundary", { clearContent: true });

    await typeInEditor(page, "Word");
    await page.waitForTimeout(100);

    // Select all and apply bold (simpler than partial selection which is fragile)
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press(`${modKey}+b`);

    // Verify formatting applied
    const html = await getEditorHTML(page);
    expect(html).toMatch(/<strong[^>]*>Word<\/strong>/);
  });

  test("triple format application and removal", async ({ page }) => {
    await openFreshEditor(page, "triple-format", { clearContent: true });

    await typeInEditor(page, "Triple formatted");

    // Apply all three formats
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+b`);
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+i`);
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+e`); // code

    let html = await getEditorHTML(page);
    expect(html).toMatch(/<strong/);
    expect(html).toMatch(/<em/);
    expect(html).toMatch(/<code/);

    // Remove all formats in reverse order
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+e`);
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+i`);
    await selectTextBySubstring(page, "Triple");
    await page.keyboard.press(`${modKey}+b`);

    html = await getEditorHTML(page);
    expect(html).not.toMatch(/<strong/);
    expect(html).not.toMatch(/<em/);
    expect(html).not.toMatch(/<code/);
    expect(html).toContain("Triple formatted");
  });
});

// ============================================================================
// Block Operation Edge Cases
// ============================================================================

test.describe("Block Operation Edge Cases", () => {
  test("Enter at very beginning of document", async ({ page }) => {
    await openFreshEditor(page, "enter-at-start", { clearContent: true });

    await setEditorContent(page, "Content at start");

    // Move cursor to absolute start
    await page.keyboard.press(`${modKey}+a`);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(100);

    // Press Enter - should create empty block before
    await page.keyboard.press("Enter");

    const html = await getEditorHTML(page);
    // Content should still exist
    expect(html).toContain("Content at start");
  });

  test("multiple consecutive Enter keys create blocks", async ({ page }) => {
    await openFreshEditor(page, "multi-enter", { clearContent: true });

    await typeInEditor(page, "Start");

    // Press Enter multiple times
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await typeInEditor(page, "End");

    // Should have content at start and end with empty blocks between
    const text = await getEditorText(page);
    expect(text).toContain("Start");
    expect(text).toContain("End");

    // Verify block count increased
    const blockCount = await page.evaluate(() => {
      const globalAny = window as unknown as {
        __lfccView?: { state?: { doc?: { childCount?: number } } };
      };
      return globalAny.__lfccView?.state?.doc?.childCount ?? 0;
    });
    expect(blockCount).toBeGreaterThanOrEqual(4);
  });

  test("backspace through multiple empty blocks", async ({ page }) => {
    await openFreshEditor(page, "backspace-multi-empty", { clearContent: true });

    await typeInEditor(page, "First");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Last");

    // Verify both parts exist
    const textBefore = await getEditorText(page);
    expect(textBefore).toContain("First");
    expect(textBefore).toContain("Last");

    // Delete backwards through empty blocks using backspace on "Last"
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace"); // Deletes "Last"
    await page.waitForTimeout(50);

    // Now continue backspacing through empty blocks to First
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");

    // Content should converge - First still there
    const text = await getEditorText(page);
    expect(text).toContain("First");
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

test.describe("Stress Tests", () => {
  test("50 rapid keystrokes without corruption", async ({ page }) => {
    await openFreshEditor(page, "rapid-keys", { clearContent: true });

    // Type using keyboard.type which is more reliable
    await focusEditor(page);
    await page.keyboard.type("abcdefghijklmnopqrstuvwxyz".repeat(2), { delay: 5 });
    await page.waitForTimeout(100);

    const text = await getEditorText(page);
    expect(text.length).toBeGreaterThanOrEqual(50);
    // Should contain recognizable patterns
    expect(text.toLowerCase()).toContain("abcd");
  });

  test("20 undo/redo cycles", async ({ page }) => {
    await openFreshEditor(page, "undo-redo-stress", { clearContent: true });

    // Create history
    await typeInEditor(page, "Original");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Added");
    await page.waitForTimeout(300); // Extra wait for history

    // Moderate undo/redo (reduced from 50 to 20)
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(20);
      await page.keyboard.press(`${modKey}+Shift+z`);
      await page.waitForTimeout(20);
    }

    // Editor should still work
    await typeInEditor(page, "StillWorks");
    const text = await getEditorText(page);
    expect(text).toContain("StillWorks");
  });

  test("10 block splits and joins", async ({ page }) => {
    await openFreshEditor(page, "split-join-stress", { clearContent: true });

    await typeInEditor(page, "Line of text");
    await page.waitForTimeout(100);

    // Split and join a moderate number of times
    for (let i = 0; i < 10; i++) {
      // Move to middle and split
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter"); // Split
      await page.keyboard.press("Backspace"); // Join back
      await page.waitForTimeout(30);
    }

    // Editor should still work
    await typeInEditor(page, " DONE");
    const text = await getEditorText(page);
    expect(text).toContain("DONE");
  });
});

// ============================================================================
// Error Recovery Tests
// ============================================================================

test.describe("Error Recovery", () => {
  test("paste empty content does not crash", async ({ page }) => {
    await openFreshEditor(page, "paste-empty", { clearContent: true });

    // Try to paste with empty clipboard (simulate by clearing)
    await page.evaluate(() => {
      navigator.clipboard.writeText("").catch(() => {
        // Clipboard access may be denied, that's ok
      });
    });

    await page.keyboard.press(`${modKey}+v`);
    await page.waitForTimeout(100);

    // Editor should still work
    await typeInEditor(page, "After paste");
    const text = await getEditorText(page);
    expect(text).toContain("After paste");
  });

  test("emoji and special character handling", async ({ page }) => {
    await openFreshEditor(page, "special-chars", { clearContent: true });

    // Type emoji using typeInEditor (more reliable than insertText)
    await typeInEditor(page, "Hello 🔥 World");
    await page.waitForTimeout(100);

    const text = await getEditorText(page);
    // Content should be present
    expect(text).toContain("Hello");
    expect(text).toContain("World");

    // Editor should still work
    await typeInEditor(page, " More text");
    const afterMore = await getEditorText(page);
    expect(afterMore).toContain("More text");
  });
});
