import { expect, test } from "@playwright/test";

test.describe("Sidebar Navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root
    await page.goto("/");
    // Wait for sidebar to be visible (it might load async)
    await expect(page.getByLabel("Primary sidebar")).toBeVisible({ timeout: 10000 });
  });

  test("toggles sidebar collapse state", async ({ page }) => {
    const sidebar = page.getByLabel("Primary sidebar");
    const toggle = page.getByRole("button", { name: /collapse/i });

    // Initial State: Expanded
    await expect(sidebar).toHaveCSS("width", "240px"); // Default width

    // Click to Collapse
    await toggle.click();
    await expect(page.getByRole("button", { name: /expand/i })).toBeVisible();

    await expect(sidebar).toHaveCSS("width", "72px"); // Collapsed width
  });

  test("rail behavior", async ({ page }) => {
    const sidebar = page.getByLabel("Primary sidebar");
    // 1. Start by collapsing to Rail
    const collapseToggle = page.getByRole("button", { name: /collapse/i });
    await collapseToggle.click();

    // 2. Hover Rail
    await sidebar.hover();

    // 3. Verify it STAYS Rail (72px) and doesn't auto-expand
    await expect(sidebar).toHaveCSS("width", "72px");

    // 4. Verify Rail Elements are visible (e.g. settings or search)
    // We use settings button as proxy for rail content
    await expect(page.getByLabel("Customize")).toBeVisible();
  });
});
