import { type Page, expect, test } from "@playwright/test";
import { waitForEditorReady } from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

const modKey = process.platform === "darwin" ? "Meta" : "Control";
const modShortcut = (key: string) => `${modKey}+${key}`;

async function getEditorTextWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const editor = document.querySelector(".lfcc-editor .ProseMirror");
    if (!editor) {
      throw new Error("Editor not found");
    }
    const paragraphs = editor.querySelectorAll("p");
    const lastParagraph = paragraphs[paragraphs.length - 1];
    const target = lastParagraph ?? editor;

    try {
      // Create a range to measure the text width more accurately if needed,
      // but bounding client rect of the paragraph might be susceptible to wrapping.
      // Let's measure the right position of the last text node range.
      const range = document.createRange();
      range.selectNodeContents(target);
      const rect = range.getBoundingClientRect();
      return rect.width || target.getBoundingClientRect().width;
    } catch {
      return target.getBoundingClientRect().width;
    }
  });
}

type ProseMirrorNode = { isText?: boolean; text?: string };
type ProseMirrorDoc = {
  descendants: (fn: (node: ProseMirrorNode, pos: number) => boolean | undefined) => void;
};
type ProseMirrorView = {
  state: {
    doc: ProseMirrorDoc;
    schema: { marks: { bold?: { create: () => unknown } } };
    tr: { addMark: (from: number, to: number, mark: unknown) => unknown };
  };
  dispatch: (tr: unknown) => void;
  focus: () => void;
};

async function applyBoldToSubstring(page: Page, substring: string): Promise<boolean> {
  return page.evaluate((target) => {
    const globalAny = window as Record<string, unknown>;
    const view = globalAny.__lfccView as ProseMirrorView | undefined;

    if (!view) {
      return false;
    }

    const { doc, schema } = view.state;
    const bold = schema.marks.bold;
    if (!bold) {
      return false;
    }

    let from = -1;
    let to = -1;

    doc.descendants((node: { isText?: boolean; text?: string }, pos: number) => {
      if (!node.isText || !node.text || from !== -1) {
        return;
      }
      const index = node.text.indexOf(target);
      if (index !== -1) {
        from = pos + index;
        to = from + target.length;
      }
    });

    if (from === -1 || to === -1) {
      return false;
    }

    const tr = view.state.tr.addMark(from, to, bold.create());
    view.dispatch(tr);
    view.focus();
    return true;
  }, substring);
}

test("editor bold toggle does not cause layout jank", async ({ page }) => {
  await page.goto("/editor?seed=0"); // Use /editor where LFCC editor is properly mounted

  // 1. Wait for editor
  await waitForEditorReady(page);
  const editor = page.locator(".lfcc-editor .ProseMirror");

  // 2. Ensure the feature is ON (default) by checking the class on the layout
  const layout = page.locator(".lfcc-bold-stable-grad");
  await expect(layout).toBeVisible({ timeout: 5000 });

  // 3. Clear and type a controlled sentence
  await editor.click();
  await page.keyboard.press(modShortcut("a"));
  await page.keyboard.press("Backspace");

  const text =
    "The quick brown fox jumps over the lazy dog repeatedly to ensure we have enough text.";
  await page.keyboard.type(text);

  // 4. Measure initial width
  const initialWidth = await getEditorTextWidth(page);

  // 5. Apply bold to "quick"
  const boldApplied = await applyBoldToSubstring(page, "quick");
  expect(boldApplied).toBe(true);

  // 7. Measure width again
  const boldWidth = await getEditorTextWidth(page);

  // Allow for small diff (sub-pixel and text-shadow allowance)
  expect(Math.abs(boldWidth - initialWidth)).toBeLessThan(4);

  // 8. Verify the style is "fake bold"
  const strongTag = editor.locator("strong");
  await expect(strongTag).toBeVisible();

  const fontWeight = await strongTag.evaluate((el) => {
    return window.getComputedStyle(el).fontWeight;
  });
  expect(Number.parseInt(fontWeight || "0")).toBe(400); // Should be normal weight in edit mode

  // 9. Blur editor -> Should REMAIN fake bold (Anti-Jank Permanent Strategy)
  await page.locator("body").click({ position: { x: 0, y: 0 } }); // Click outside

  // Wait a tick for focus change if needed
  await page.waitForTimeout(100);

  const blurredFontWeight = await strongTag.evaluate((el) => {
    return window.getComputedStyle(el).fontWeight;
  });

  // Should STILL be 400 because we want no jump
  expect(Number.parseInt(blurredFontWeight || "0")).toBe(400);

  // 10. Verify layout DID NOT shift (width matches initial)
  const blurredWidth = await getEditorTextWidth(page);
  // Allow for sub-pixel differences
  expect(Math.abs(blurredWidth - initialWidth)).toBeLessThan(4);
});
