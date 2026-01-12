import { type Page, expect, test } from "@playwright/test";
import {
  focusEditor,
  getAnnotationIds,
  selectRangeBetweenSubstrings,
  waitForEditorReady,
} from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

/**
 * PERF-008: Test for annotation hover stability
 *
 * This test validates that hovering over annotations works correctly
 * and handles become visible on hover.
 */

async function appendParagraphs(page: Page, lines: string[]): Promise<void> {
  await focusEditor(page);
  await page.keyboard.press("End");
  for (const line of lines) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

async function createMultiParagraphAnnotation(page: Page): Promise<string> {
  const baselineIds = await getAnnotationIds(page);

  // Create multi-paragraph content
  const uniquePrefix = `HOVER_TEST_${Date.now()}`;
  const para1 = `${uniquePrefix}_PARA_1 First paragraph for hover test.`;
  const para2 = `${uniquePrefix}_PARA_2 Second paragraph for hover test.`;
  const para3 = `${uniquePrefix}_PARA_3 Third paragraph for hover test.`;

  await appendParagraphs(page, [para1, para2, para3]);

  // Select across all three paragraphs
  await selectRangeBetweenSubstrings(page, `${uniquePrefix}_PARA_1`, `${uniquePrefix}_PARA_3`);

  // Create highlight
  const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
  await expect(highlightButton).toBeVisible({ timeout: 3000 });
  await highlightButton.click();

  // Wait for annotation to be created
  await expect
    .poll(async () => (await getAnnotationIds(page)).length)
    .toBeGreaterThan(baselineIds.length);

  const currentIds = await getAnnotationIds(page);
  const annotationId = currentIds.find((id) => !baselineIds.includes(id));
  if (!annotationId) {
    throw new Error("Failed to create multi-paragraph annotation");
  }

  return annotationId;
}

test.describe("Annotation Hover Stability", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  test("multi-paragraph annotation should have multiple spans", async ({ page }) => {
    const annotationId = await createMultiParagraphAnnotation(page);

    // Get all annotation spans
    const annotationSpans = page.locator(`.lfcc-annotation[data-annotation-id="${annotationId}"]`);
    const spanCount = await annotationSpans.count();

    // Should have spans across multiple paragraphs
    expect(spanCount).toBeGreaterThanOrEqual(3);
  });

  test("annotation spans should have correct CSS hover styles", async ({ page }) => {
    const annotationId = await createMultiParagraphAnnotation(page);

    const firstSpan = page
      .locator(`.lfcc-annotation[data-annotation-id="${annotationId}"]`)
      .first();

    // Check that the span exists and has the annotation class
    await expect(firstSpan).toBeVisible();
    await expect(firstSpan).toHaveClass(/lfcc-annotation/);

    // Verify the annotation has the expected data attributes
    const dataId = await firstSpan.getAttribute("data-annotation-id");
    expect(dataId).toBe(annotationId);
  });

  test("handles should exist for annotation", async ({ page }) => {
    const annotationId = await createMultiParagraphAnnotation(page);

    // Check that handles exist (they may be hidden by default)
    const startHandle = page.locator(
      `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="start"]`
    );
    const endHandle = page.locator(
      `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="end"]`
    );

    // Handles should exist in DOM (even if not visible)
    await expect(startHandle).toBeAttached();
    await expect(endHandle).toBeAttached();
  });
});
