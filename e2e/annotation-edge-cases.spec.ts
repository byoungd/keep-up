import { expect, test } from "@playwright/test";
import {
  createAnnotationFromSelection,
  getAnnotationIds,
  selectRangeBetweenSubstrings,
  setEditorContent,
  waitForEditorReady,
} from "./helpers/editor";

type PMView = import("prosemirror-view").EditorView;
type PMNode = import("prosemirror-model").Node;

test.describe("Annotation Edge Cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    // Setup: Three paragraphs
    await setEditorContent(page, "Paragraph One\nParagraph Two\nParagraph Three");
    await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Paragraph Three");
  });

  test("Splits annotation when a new block is inserted between parts", async ({ page }) => {
    // 1. Create annotation across P1 and P2
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Two");
    await createAnnotationFromSelection(page);

    // Verify 1 annotation ID
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Insert new block between P1 and P2 using keyboard to ensure natural ID generation
    // Click at end of P1
    await page.getByText("Paragraph One", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Middle Paragraph");

    // 3. Verify split: Should be 2 annotations now because gap > 0
    await waitForAnnotationCount(page, 2);
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(2);
  });

  test("Heals annotation when a middle block is deleted", async ({ page }) => {
    // 1. Create annotation across P1, P2, P3
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Three");
    await createAnnotationFromSelection(page);

    // Verify 1 annotation
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Delete P2 (the middle block)
    await page.evaluate(() => {
      const view = (window as unknown as { __lfccView?: PMView }).__lfccView;
      if (!view) {
        throw new Error("View not found");
      }
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: PMNode, p: number) => {
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

    // 3. Verify: Should still be 1 annotation (healed by removing the missing block part)
    // because P1 and P3 are now adjacent, so gap is 0.
    await waitForAnnotationCount(page, 1);
    const finalIds = await getUniqueAnnotationIds(page);
    expect(finalIds.length).toBe(1);

    // Verify no warning badges (implies successful healing of ghost span)
    await expect(page.locator(".lfcc-annotation-warning")).toHaveCount(0);
  });

  test("Heals annotation when the start block is deleted", async ({ page }) => {
    // 1. Create annotation across P1, P2, P3
    await selectRangeBetweenSubstrings(page, "Paragraph One", "Paragraph Three");
    await createAnnotationFromSelection(page);

    // Verify 1 annotation
    const initialIds = await getUniqueAnnotationIds(page);
    expect(initialIds.length).toBe(1);

    // 2. Delete P1 (the start block)
    await page.evaluate(() => {
      const view = (window as unknown as { __lfccView?: PMView }).__lfccView;
      if (!view) {
        throw new Error("View not found");
      }
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: PMNode, p: number) => {
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

    // 3. Verify: Should still be 1 annotation (healed)
    await waitForAnnotationCount(page, 1);
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
    await createAnnotationFromSelection(page);

    // 2. Delete P3 (the end block)
    await page.evaluate(() => {
      const view = (window as unknown as { __lfccView?: PMView }).__lfccView;
      if (!view) {
        throw new Error("View not found");
      }
      let pos = -1;
      let size = 0;
      view.state.doc.descendants((node: PMNode, p: number) => {
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

    // 3. Verify: Should still be 1 annotation (healed)
    await waitForAnnotationCount(page, 1);
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
    await createAnnotationFromSelection(page);

    // 2. Merge P2 into P1 (Backspace at start of P2)
    await page.evaluate(() => {
      const globalAny = window as unknown as Record<string, unknown>;
      const view = globalAny.__lfccView as
        | {
            state: {
              doc: { resolve: (pos: number) => unknown; firstChild: { nodeSize: number } | null };
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

    // 3. Verify: The annotation on the merged-away block (P2) is likely lost (pruned).
    // The annotation on P1 should remain.
    await waitForAnnotationCount(page, 1);
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

async function getUniqueAnnotationIds(page: import("@playwright/test").Page) {
  const ids = await getAnnotationIds(page);
  return Array.from(new Set(ids));
}

async function waitForAnnotationCount(
  page: import("@playwright/test").Page,
  expected: number
): Promise<void> {
  await expect
    .poll(async () => (await getUniqueAnnotationIds(page)).length, { timeout: 5000 })
    .toBe(expected);
}
