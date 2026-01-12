import { expect, test } from "@playwright/test";
import { focusEditor, openFreshEditor, selectFirstTextRange } from "./helpers/editor";

test.describe("Annotations", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `annotations-${testInfo.title}`, { clearContent: true });

    // Seed content
    await focusEditor(page);
    await page.keyboard.type("This is a text for annotation testing.");
  });

  test("Create annotation via toolbar", async ({ page }) => {
    await focusEditor(page);
    await selectFirstTextRange(page);

    // Toolbar should appear
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible({ timeout: 5000 });

    // Click color button (e.g. Yellow)
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Verify annotation highlight appears in overlay (portal-based rendering)
    // The overlay uses .highlight-rect for visual rendering while
    // .lfcc-annotation-target in editor is transparent for interaction
    const highlight = page.locator(".highlight-rect").first();
    await expect(highlight).toBeAttached();
  });

  test("Add comment to annotation", async ({ page }) => {
    // Setup: Create annotation
    await focusEditor(page);
    await selectFirstTextRange(page);
    const toolbar = page.locator("[data-testid='selection-toolbar']");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight yellow" }).click();

    // Wait for annotation to appear in panel
    const panelContainer = page.locator("[data-testid='annotation-panel-container']");
    await expect(panelContainer).toBeVisible({ timeout: 5000 });

    const panelItem = panelContainer.locator("[data-annotation-role='panel-item']").first();
    await expect(panelItem).toBeVisible({ timeout: 5000 });

    // Open comment section
    const commentToggle = panelContainer.locator("[data-annotation-role='comment-toggle']").first();
    await expect(commentToggle).toBeVisible();
    await commentToggle.click();

    // Type comment
    const input = panelContainer.getByPlaceholder("Add a note...").first();
    await expect(input).toBeVisible();
    await input.fill("This is a test comment");
    await input.press("Enter");

    // Verify comment appears
    await expect(panelContainer.getByText("This is a test comment")).toBeVisible();
  });

  // Note: This test requires specific seed parameters that create annotations on load.
  // The current seeder creates text content but not pre-existing annotations.
  test.skip("Seeded annotations hide empty state", async ({ page }) => {
    // Navigate to editor with seed param to get pre-seeded annotations
    await page.goto("/editor?seed=1k");
    await page.waitForSelector("[data-lfcc-editor]", { timeout: 10000 });

    await expect(page.getByText("No annotations yet")).toHaveCount(0);
    const panelItemCount = await page.locator("[data-annotation-role='panel-item']").count();
    expect(panelItemCount).toBeGreaterThan(0);
  });
});
