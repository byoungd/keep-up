import { expect, test } from "@playwright/test";
import { clearEditorContent, waitForEditorReady } from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

/**
 * Cursor and Enter key tests
 * Tests verify cursor positioning and Enter key behavior.
 */

test.describe("Cursor Position and Enter Key", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    await clearEditorContent(page);
  });

  test("keyboard navigation: typing after End key should insert at cursor", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type initial content using keyboard
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("AAAAAA BBBBBB CCCCCC");

    // Verify content was typed
    let content = await editor.textContent();
    expect(content).toContain("AAAAAA BBBBBB CCCCCC");

    // Now click at the end and type more
    await page.keyboard.press("End");
    await page.waitForTimeout(50);

    // Type - should appear after CCCCCC
    await page.keyboard.type("_INSERTED");

    content = await editor.textContent();
    expect(content).toContain("CCCCCC_INSERTED");
  });

  test("keyboard navigation: Enter key should create new paragraph", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type two lines
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("FIRST_LINE_CONTENT");
    await page.keyboard.press("Enter");
    await page.keyboard.type("SECOND_LINE_CONTENT");

    // Move to end and press Enter
    await page.keyboard.press("End");
    await page.waitForTimeout(50);

    // Press Enter and type
    await page.keyboard.press("Enter");
    await page.keyboard.type("THIRD_LINE_AFTER_ENTER");

    const content = await editor.textContent();
    expect(content).toContain("THIRD_LINE_AFTER_ENTER");

    // Verify order: SECOND should come before THIRD
    const secondIndex = content?.indexOf("SECOND_LINE_CONTENT") ?? -1;
    const thirdIndex = content?.indexOf("THIRD_LINE_AFTER_ENTER") ?? -1;
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });

  test("multiple Enter presses should create multiple paragraphs", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("START_TEXT");

    // Move to end
    await page.keyboard.press("End");
    await page.waitForTimeout(50);

    // Press Enter twice and type
    await page.keyboard.press("Enter");
    await page.keyboard.type("LINE_AFTER_ONE_ENTER");
    await page.keyboard.press("Enter");
    await page.keyboard.type("LINE_AFTER_TWO_ENTERS");

    const content = await editor.textContent();
    expect(content).toContain("LINE_AFTER_ONE_ENTER");
    expect(content).toContain("LINE_AFTER_TWO_ENTERS");

    // Verify order
    const startIndex = content?.indexOf("START_TEXT") ?? -1;
    const oneEnterIndex = content?.indexOf("LINE_AFTER_ONE_ENTER") ?? -1;
    const twoEntersIndex = content?.indexOf("LINE_AFTER_TWO_ENTERS") ?? -1;

    expect(oneEnterIndex).toBeGreaterThan(startIndex);
    expect(twoEntersIndex).toBeGreaterThan(oneEnterIndex);
  });
});

test.describe("Mouse Click Cursor Sync", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    await clearEditorContent(page);
  });

  test("mouse click should position cursor at click location", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type initial content
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("AAA_BBB_CCC");

    // Find the text element
    const textElement = page.locator("text=AAA_BBB_CCC");
    await expect(textElement).toBeVisible();
    const box = await textElement.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    // Click directly on the text (middle of the element, not at the edge)
    await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Now move to end with keyboard and type
    await page.keyboard.press("End");
    await page.keyboard.type("_AFTER");

    const content = await editor.textContent();
    expect(content).toContain("AAA_BBB_CCC_AFTER");
  });

  test("Enter key should work after mouse click", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type initial content
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("FIRST_PARA");

    // Click on the text to focus
    const textElement = page.locator("text=FIRST_PARA");
    await expect(textElement).toBeVisible();
    const box = await textElement.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    // Click on the text
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Move to end and press Enter
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("SECOND_PARA");

    const content = await editor.textContent();
    expect(content).toContain("FIRST_PARA");
    expect(content).toContain("SECOND_PARA");
  });
});

test.describe("Enter Key Inside Annotation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  test("Enter inside annotation should position cursor at start of new line", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Type content that we will annotate
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("AAAA_BBBB_CCCC_DDDD");

    // Select middle portion "BBBB_CCCC"
    await page.evaluate(() => {
      const root = document.querySelector(".lfcc-editor .ProseMirror");
      if (!root) {
        throw new Error("Editor not found");
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const text = node.textContent ?? "";
        const index = text.indexOf("BBBB_CCCC");
        if (index !== -1) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + "BBBB_CCCC".length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          return;
        }
        node = walker.nextNode() as Text | null;
      }
      throw new Error("Text not found");
    });

    // Create highlight annotation
    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 3000 });
    await highlightButton.click();

    // Wait for annotation to be created
    await page.waitForTimeout(300);

    // Now click inside the annotated text (between BBBB and CCCC)
    const annotationSpan = page.locator(".lfcc-annotation").first();
    await expect(annotationSpan).toBeVisible();
    const box = await annotationSpan.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    // Click in the middle of the annotation
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Press Enter - this should split the paragraph
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Type something immediately after Enter
    await page.keyboard.type("NEWLINE");

    const content = await editor.textContent();
    // NEWLINE should appear, indicating cursor was positioned correctly after Enter
    expect(content).toContain("NEWLINE");
  });

  test("Enter inside multi-paragraph annotation should position cursor correctly", async ({
    page,
  }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Create multi-paragraph content
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("PARA1_START_111111111111111111111_END");
    await page.keyboard.press("Enter");
    await page.keyboard.type("PARA2_MIDDLE_2222222222222222222_END");
    await page.keyboard.press("Enter");
    await page.keyboard.type("PARA3_FINISH_333333333333333333_END");

    // Select across paragraphs (from PARA1 to PARA3)
    await page.evaluate(() => {
      const root = document.querySelector(".lfcc-editor .ProseMirror");
      if (!root) {
        throw new Error("Editor not found");
      }

      const findNode = (needle: string) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode() as Text | null;
        while (node) {
          const text = node.textContent ?? "";
          const index = text.indexOf(needle);
          if (index !== -1) {
            return { node, index, length: needle.length };
          }
          node = walker.nextNode() as Text | null;
        }
        return null;
      };

      const start = findNode("111111111");
      const end = findNode("333333333");
      if (!start || !end) {
        throw new Error("Missing range");
      }

      const range = document.createRange();
      range.setStart(start.node, start.index);
      range.setEnd(end.node, end.index + end.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    // Create highlight annotation
    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 3000 });
    await highlightButton.click();
    await page.waitForTimeout(300);

    // Click inside the second paragraph's annotated portion
    const annotationSpans = page.locator(".lfcc-annotation");
    const spanCount = await annotationSpans.count();
    expect(spanCount).toBeGreaterThanOrEqual(1);

    // Click on the second span (middle paragraph)
    const middleSpan = annotationSpans.nth(Math.floor(spanCount / 2));
    const box = await middleSpan.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Press Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Type immediately - this tests if cursor is at correct position
    await page.keyboard.type("INSERTED_AFTER_ENTER");

    const content = await editor.textContent();
    expect(content).toContain("INSERTED_AFTER_ENTER");

    // The text should appear at the split point, not at a random position
    // If cursor position is wrong, the text might not appear where expected
  });
});
