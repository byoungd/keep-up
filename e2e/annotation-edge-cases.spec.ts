import { expect, test } from "@playwright/test";
import { selectRangeBetweenSubstrings, waitForEditorReady } from "./helpers/editor";

test.describe("Annotation Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    // Setup: Three paragraphs
    const editor = page.locator(".lfcc-editor .ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Paragraph One");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Paragraph Two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Paragraph Three");
    await page.waitForTimeout(100);
  });

  test("Splits annotation when a new block is inserted between parts", async ({ page }) => {
    // 1. Create annotation across P1 and P2
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Two");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Verify 1 annotation ID
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Insert new block between P1 and P2 using keyboard to ensure natural ID generation
    // Click at end of P1
    await page.getByText("Paragraph One", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Middle Paragraph");

    await page.waitForTimeout(2000);

    // 3. Verify split: Should be 2 annotations now because gap > 0
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(2);
  });

  test("Heals annotation when a middle block is deleted", async ({ page }) => {
    // 1. Create annotation across P1, P2, P3
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Three");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Verify 1 annotation
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Delete P2 (the middle block)
    await page.evaluate(() => {
      // @ts-ignore
      const view = window.__lfccView;
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: Node, p: number) => {
        if (node.textContent === "Paragraph Two") {
          pos = p;
          size = node.nodeSize;
          return false;
        }
      });
      if (pos !== -1) {
        view.dispatch(view.state.tr.delete(pos, pos + size));
      }
    });

    await page.waitForTimeout(2000);

    // 3. Verify: Should still be 1 annotation (healed by removing the missing block part)
    // because P1 and P3 are now adjacent, so gap is 0.
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(1);

    // Verify no warning badges (implies successful healing of ghost span)
    await expect(page.locator(".lfcc-annotation-warning")).toHaveCount(0);
  });
  test("Heals annotation when the start block is deleted", async ({ page }) => {
    // 1. Create annotation across P1, P2, P3
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Three");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Verify 1 annotation
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Delete P1 (the start block)
    await page.evaluate(() => {
      // @ts-ignore
      const view = window.__lfccView;
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: Node, p: number) => {
        if (node.textContent === "Paragraph One") {
          pos = p;
          size = node.nodeSize;
          return false;
        }
      });
      if (pos !== -1) {
        view.dispatch(view.state.tr.delete(pos, pos + size));
      }
    });

    await page.waitForTimeout(2000);

    // 3. Verify: Should still be 1 annotation (healed)
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(1);

    const allText = await page.locator(".lfcc-annotation").allTextContents();
    const joined = allText.join(" ");
    expect(joined).not.toContain("Paragraph One");
    expect(joined).toContain("Paragraph Two");
    expect(joined).toContain("Paragraph Three");
  });

  test("Heals annotation when the end block is deleted", async ({ page }) => {
    // 1. Create annotation across P1, P2, P3
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Three");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // 2. Delete P3 (the end block)
    await page.evaluate(() => {
      // @ts-ignore
      const view = window.__lfccView;
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: Node, p: number) => {
        if (node.textContent === "Paragraph Three") {
          pos = p;
          size = node.nodeSize;
          return false;
        }
      });
      if (pos !== -1) {
        view.dispatch(view.state.tr.delete(pos, pos + size));
      }
    });

    await page.waitForTimeout(2000);

    // 3. Verify: Should still be 1 annotation (healed)
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(1);

    const allText = await page.locator(".lfcc-annotation").allTextContents();
    const joined = allText.join(" ");
    expect(joined).toContain("Paragraph One");
    expect(joined).toContain("Paragraph Two");
    expect(joined).not.toContain("Paragraph Three");
  });

  test("Handles merging of highlighted blocks (graceful degradation)", async ({ page }) => {
    // 1. Create annotation across P1, P2
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Two");
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // 2. Merge P2 into P1 (Backspace at start of P2)
    // Click at start of P2
    // Click at start of P2
    const p2 = page.getByText("Paragraph Two", { exact: true });
    await p2.click();
    await page.keyboard.press("Home", { delay: 100 });
    // Double check we are at start by pressing Left and seeing if we move to P1?
    // Just force backspace multiple times if needed, or rely on Home -> Backspace
    await page.keyboard.press("Backspace", { delay: 100 });

    await page.waitForTimeout(2000);

    // 3. Verify: The annotation on the merged-away block (P2) is likely lost (pruned).
    // The annotation on P1 should remain.
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(1);

    // Content should show P1's part.
    const allText = await page.locator(".lfcc-annotation").allTextContents();
    const joined = allText.join(" ");
    expect(joined).toContain("Paragraph One");

    // Check that we actually merged the paragraphs (should be 2 blocks total now, not 3)
    // LFCC uses [data-block-id] divs, not <p> elements
    await expect(page.locator(".ProseMirror [data-block-id]")).toHaveCount(2);
  });
});

async function getUniqueAnnotationIds(page: unknown) {
  const typedPage = page as { evaluate: <T>(fn: () => T) => Promise<T> };
  return await typedPage.evaluate(() => {
    const nodes = document.querySelectorAll(".lfcc-annotation");
    const ids = new Set();
    for (const n of nodes) {
      ids.add(n.getAttribute("data-annotation-id"));
    }
    return Array.from(ids);
  });
}
