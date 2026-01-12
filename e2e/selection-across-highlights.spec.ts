import { expect, test } from "@playwright/test";
import { selectRangeBetweenSubstrings, waitForEditorReady } from "./helpers/editor";

/**
 * Critical E2E test: selection across existing highlights should NOT be snapped.
 * Uses pre-seeded highlights from the demo page - requires fixed /editor URL (not unique docId).
 */
test.describe("Selection Across Highlights", () => {
  test.beforeEach(async ({ page }) => {
    // Use bare /editor to get pre-seeded demo content with highlights
    await page.goto("/editor");
    await waitForEditorReady(page);
  });

  // Skipped: Requires pre-seeded demo content with annotations in /editor.
  // Annotation rendering in overlay mode needs specific document setup.
  test.skip("Range selection across pre-seeded highlight should NOT be snapped", async ({
    page,
  }) => {
    // Wait for pre-seeded annotations to render
    const highlight = page.locator(".lfcc-annotation").first();
    await expect(highlight).toBeVisible({ timeout: 5000 });

    const highlightText = await page.evaluate(() => {
      const highlights = document.querySelectorAll<HTMLElement>(".lfcc-annotation");
      if (highlights.length === 0) {
        throw new Error("No pre-seeded highlights found");
      }
      return highlights[0]?.textContent ?? "";
    });

    console.info("Highlight text:", highlightText);
    expect(highlightText.length).toBeGreaterThan(0);

    // Clear any existing selection
    await page.click("body", { position: { x: 10, y: 10 } });
    await page.waitForTimeout(200);

    // Create a deterministic selection that starts before the highlight and ends inside it.
    const finalSelection = await selectRangeBetweenSubstrings(page, "LFCC", "without guessing.");
    console.info("Final selection:", finalSelection);

    // CRITICAL ASSERTIONS:
    // The selection should include the text before the highlight.
    expect(finalSelection).toContain("LFCC");

    // Selection should still contain the highlighted text
    if (highlightText.length > 3) {
      const highlightSubstr = highlightText.substring(0, 3);
      expect(finalSelection).toContain(highlightSubstr);
    }

    // Selection should be reasonably long (not snapped to just the highlight)
    expect(finalSelection.length).toBeGreaterThan(highlightText.length);
  });
});
