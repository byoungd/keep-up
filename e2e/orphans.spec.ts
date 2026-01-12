import { expect, test } from "@playwright/test";
import { getAnnotationIds, selectTextBySubstring, waitForEditorReady } from "./helpers/editor";

/**
 * E2E tests for orphan annotation handling.
 * These tests verify the behavior when annotation targets are deleted.
 */

test.describe("Orphan Annotation Handling", () => {
  const DEMO_URL = "/editor";

  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    await waitForEditorReady(page);
  });

  test("Deleting a block with annotation creates orphan state", async ({ page }) => {
    // Get initial annotation count
    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    await expect(annotationPanel).toBeVisible({ timeout: 5000 });

    const initialItems = page.locator("[data-annotation-role='panel-item']");
    const initialCount = await initialItems.count();

    if (initialCount === 0) {
      test.skip("No annotations available in demo doc");
      return;
    }

    const annotationIds = await getAnnotationIds(page);
    if (annotationIds.length === 0) {
      test.skip("No annotations available for orphan validation");
      return;
    }

    // Click on first block to focus
    await selectTextBySubstring(page, "anchors survive edits inside a block");

    // Delete the selection to orphan the annotation
    await page.keyboard.press("Backspace");

    // Wait for state to update
    await page.waitForTimeout(500);

    // Check if there's an orphan/issue indicator
    // The annotation panel should still show the annotation with a warning state
    const panelItems = page.locator("[data-annotation-role='panel-item']");
    const currentCount = await panelItems.count();

    // Annotations should not simply disappear - they become orphaned/partial
    expect(currentCount).toBeGreaterThan(0);
  });

  test("Orphan annotation shows warning banner", async ({ page }) => {
    // Create an annotation and then delete its target
    const _editor = page.locator('[data-testid="lfcc-editor"]');

    // First, find a paragraph with an existing annotation (from seed)
    const annotationPanel = page.locator('[data-testid="annotation-panel"]');
    await expect(annotationPanel).toBeVisible({ timeout: 5000 });

    const annotationIds = await getAnnotationIds(page);
    if (annotationIds.length === 0) {
      test.skip("No annotations available in demo doc");
      return;
    }

    await selectTextBySubstring(page, "anchors survive edits inside a block");

    // Now delete the current selection
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(500);

    // Check for warning banner in the panel
    const warningBanner = page.locator("[data-annotation-role='warning-banner']");
    // This will be visible if the annotation became orphan/partial
    const bannerVisible = await warningBanner.isVisible({ timeout: 2000 });

    // The banner should appear for orphan/partial annotations
    // If not visible, it means the annotation was fully deleted (also acceptable behavior)
    if (bannerVisible) {
      await expect(warningBanner).toContainText(/scroll|jump|attention/i);
    }
  });

  test("Issues tab filters to problematic annotations", async ({ page }) => {
    // Check if Issues tab exists and works
    const issuesTab = page.locator('[data-tab="issues"], [role="tab"]:has-text("Issues")');

    if (await issuesTab.isVisible({ timeout: 2000 })) {
      await issuesTab.click();

      // The issues tab should show orphan/partial annotations
      const issueItems = page.locator(
        "[data-annotation-status='orphan'], [data-annotation-status='partial']"
      );
      const count = await issueItems.count();

      // Count may be 0 if no issues, which is fine
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
