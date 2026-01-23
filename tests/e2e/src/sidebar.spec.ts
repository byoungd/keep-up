import { expect, test } from "@playwright/test";

test.describe("Sidebar Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Navigate to root
    await page.goto("/");
    // Wait for sidebar to be visible (it might load async)
    const sidebar = page.getByLabel("Primary sidebar");
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Ensure we start in expanded state for consistent assertions
    const nav = page.getByRole("navigation", { name: "Sidebar navigation" });
    if ((await nav.count()) === 0) {
      const expandToggle = page.getByRole("button", { name: /expand/i });
      await expandToggle.click();
      await expect(nav).toBeVisible();
    }
  });

  test("toggles sidebar collapse state", async ({ page }) => {
    const sidebar = page.getByLabel("Primary sidebar");
    const toggle = sidebar.getByRole("button", { name: /collapse/i });
    const nav = page.getByRole("navigation", { name: "Sidebar navigation" });

    // Initial State: Expanded
    await expect(nav).toBeVisible();

    // Click to Collapse
    await toggle.click();
    await expect(nav).toHaveCount(0);

    // Expand back to confirm toggle reversibility
    await page.getByRole("button", { name: /expand/i }).click();
    await expect(nav).toBeVisible();
  });

  test("rail behavior", async ({ page }) => {
    const sidebar = page.getByLabel("Primary sidebar");
    const nav = page.getByRole("navigation", { name: "Sidebar navigation" });

    // 1. Start by collapsing to Rail
    await sidebar.getByRole("button", { name: /collapse/i }).click();
    await expect(nav).toHaveCount(0);

    // 2. Hover Rail
    await sidebar.hover();

    // 3. Verify it STAYS Rail and doesn't auto-expand
    await expect(nav).toHaveCount(0);
  });
});
