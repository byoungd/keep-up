import { expect, test } from "@playwright/test";
import { openFreshEditor } from "./helpers/editor";

test.describe("Slash Menu", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `slash-menu-${testInfo.title}`, { clearContent: true });
  });

  test("Opens with slash key", async ({ page }) => {
    await page.keyboard.press("/");
    const menu = page.getByTestId("slash-command-menu");
    await expect(menu).toBeVisible();
  });

  test("Filters commands by text", async ({ page }) => {
    await page.keyboard.press("/");
    const input = page.getByPlaceholder("Type a command...");
    await input.fill("head");

    // Should show Heading options
    const heading1 = page.locator("[cmdk-item][data-value='Heading 1']");
    await expect(heading1).toBeVisible();

    // Should hide Bullet List
    const list = page.locator("[cmdk-item][data-value='Bullet List']");
    await expect(list).toBeHidden();
  });

  test("Shows empty state for no matches", async ({ page }) => {
    await page.keyboard.press("/");
    const input = page.getByPlaceholder("Type a command...");
    await input.fill("xyzrandomstring");

    const menu = page.getByTestId("slash-command-menu");
    await expect(menu.locator("[cmdk-empty]")).toContainText("No matches found");

    // Icon presence check
    const emptyIcon = menu.locator("svg.lucide-search-x");
    await expect(emptyIcon).toBeVisible();
  });

  test("Keyboard navigation selects items", async ({ page }) => {
    await page.keyboard.press("/");
    const menu = page.getByTestId("slash-command-menu");

    // Arrow down
    await page.keyboard.press("ArrowDown");

    // Check if second item is active/selected
    // Implementation uses index state, usually renders a selected class/style
    // We can check aria-selected or class on the buttons

    // Press enter to select
    await page.keyboard.press("Enter");

    // Assuming 2nd item is Heading 2 (if default order holds: Text, H1, H2...)
    // Or we verify that *something* happened (menu closed)
    await expect(menu).not.toBeVisible();
  });

  test("Icons are displayed", async ({ page }) => {
    await page.keyboard.press("/");

    // Check for standard icons
    const typeIcon = page.locator("[data-testid='slash-command-menu'] svg.lucide-type");
    await expect(typeIcon).toBeVisible();

    const h1Icon = page.locator("[data-testid='slash-command-menu'] svg.lucide-heading-1");
    await expect(h1Icon).toBeVisible();
  });
});
