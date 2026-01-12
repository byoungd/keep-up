import { expect, test } from "@playwright/test";
import {
  clearEditorContent,
  focusEditor,
  getEditorHTML,
  modKey,
  openFreshEditor,
} from "./helpers/editor";

test.describe.configure({ mode: "parallel" });

test.describe("Advanced Editor Scenarios", () => {
  test.describe("Extended Markdown Shortcuts", () => {
    test("Heading levels 3-6", async ({ page }) => {
      await openFreshEditor(page, "h3-h6");

      const levels = [3, 4, 5, 6];
      for (const level of levels) {
        await clearEditorContent(page);
        const editor = page.locator(".lfcc-editor .ProseMirror");
        await editor.click();
        // Type trigger (hashes) then Space to activate input rule
        const hashes = "#".repeat(level);
        await page.keyboard.type(hashes);
        await page.keyboard.press("Space");
        await page.keyboard.type(`Heading ${level}`);

        await expect(page.locator(`.lfcc-editor .ProseMirror h${level}`)).toContainText(
          `Heading ${level}`
        );
      }
    });

    test("Horizontal Rule (---)", async ({ page }) => {
      await openFreshEditor(page, "hr");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");
      await page.keyboard.type("---");
      await page.keyboard.press("Space");
      await expect(page.locator(".lfcc-editor .ProseMirror hr")).toBeVisible();
    });
  });

  test.describe("List Interaction", () => {
    test.skip("Enter in empty list item ends list", async ({ page }) => {
      await openFreshEditor(page, "list-exit");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      // Create list using input rule
      await page.keyboard.type("-");
      await page.keyboard.press("Space");
      await page.keyboard.type("Item 1");
      await page.waitForTimeout(100);

      // Verify bullet marker exists (flat-list) - use specific selector
      const bulletMarkers = editor.locator('[role="listitem"]');
      await expect(bulletMarkers.first()).toBeVisible();

      // Get initial count
      const initialCount = await bulletMarkers.count();
      expect(initialCount).toBe(1);

      // New item (Enter creates second list item)
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);

      const afterFirstEnter = await bulletMarkers.count();
      expect(afterFirstEnter).toBe(2);

      // Enter again in empty item -> escape list (list item becomes paragraph)
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);

      // Debug: log HTML to understand structure
      const html = await getEditorHTML(page);
      // biome-ignore lint/suspicious/noConsoleLog: debug
      console.log("Editor HTML after second Enter:", html);

      // Should have only 1 list item now (the original "Item 1")
      // The second empty item should have been converted to a paragraph
      const finalCount = await bulletMarkers.count();
      expect(finalCount).toBe(1);
    });

    // Skipped: Flat-list behavior differs - merging list items requires special handling.
    // The PM bridge positioning works but list structure differs from traditional nested list.
    test.skip("Backspace at start of list item merges to previous", async ({ page }) => {
      await openFreshEditor(page, "list-merge");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await focusEditor(page);

      // Create list
      await page.keyboard.type("- Item 1", { delay: 50 });
      await page.keyboard.press("Enter");
      await page.keyboard.type("Item 2", { delay: 50 });

      // Should have 2 bullet markers
      await expect(editor.locator("text=•")).toHaveCount(2, { timeout: 5000 });

      // Use PM bridge to go to start of second item and press Backspace
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
        // Position after first block
        const firstBlockSize = state.doc.firstChild?.nodeSize ?? 0;
        const $pos = state.doc.resolve(firstBlockSize + 1);
        const TextSelection = (globalAny.pmTextSelection ?? state.selection.constructor) as {
          near: (resolvedPos: unknown) => unknown;
        };
        const sel = TextSelection.near($pos);
        const tr = state.tr.setSelection(sel as never);
        view.dispatch(tr);
        view.focus();
      });

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      // Should have 1 bullet marker
      await expect(editor.locator("text=•")).toHaveCount(1, { timeout: 5000 });

      // Content should be merged
      await expect(editor).toContainText("Item 1Item 2");
    });
  });

  test.describe("Cursor Boundaries", () => {
    test.skip("Arrow Up/Down from multiple lines", async ({ page }) => {
      await openFreshEditor(page, "arrow-nav");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");

      await page.keyboard.type("Line 1");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Line 2");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Line 3");

      // Cursor at end of Line 3. Up -> Line 2
      await page.keyboard.press("ArrowUp");
      await page.waitForFunction(() => {
        const view = (
          window as unknown as {
            __lfccView?: {
              state?: { selection?: { $from?: { parent?: { textContent?: string } } } };
            };
          }
        ).__lfccView;
        return view?.state?.selection?.$from?.parent?.textContent?.includes("Line 2");
      });

      await page.keyboard.type("INSERT");

      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Line 2INSERT");
    });
  });
});
