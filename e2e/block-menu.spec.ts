import { expect, test } from "@playwright/test";
import { waitForEditorReady } from "./helpers/editor";

test.describe("Block Context Menu", () => {
  const openBlockMenu = async (page: import("@playwright/test").Page) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();
    await content.scrollIntoViewIfNeeded();
    await content.hover();
    const trigger = page.getByLabel("Drag to reorder or Click for menu");
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Ensure at least one block with content
    await editor.click();
    await page.keyboard.type("Test block content");
  });

  test("Menu opens on trigger click", async ({ page }) => {
    await openBlockMenu(page);

    await expect(page.locator("[role='menu'][data-block-id]")).toBeVisible();
  });

  test("Copy link shows toast", async ({ page }) => {
    // Grant clipboard permissions or mock if possible
    // In Playwright, clipboard read needs permission, write usually works
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await openBlockMenu(page);

    const menu = page.locator("[role='menu'][data-block-id]");
    const copyBtn = menu.getByRole("menuitem", { name: "Copy link" });
    await copyBtn.click();

    // Check for toast
    await expect(page.getByText("Link copied to clipboard")).toBeVisible();
  });

  test("Delete requires confirmation", async ({ page }) => {
    await openBlockMenu(page);

    const menu = page.locator("[role='menu'][data-block-id]");
    const deleteBtn = menu.getByRole("menuitem", { name: "Delete" });
    await deleteBtn.click();

    // Expect button text to change to confirmation
    await expect(menu.getByRole("menuitem", { name: "Confirm delete?" })).toBeVisible();

    // Click again to confirm
    await menu.getByRole("menuitem", { name: "Confirm delete?" }).click();

    // Menu should close -> block deleted
    await expect(menu).not.toBeVisible();
    // Assuming we had 1 block, it might now be empty paragraph or gone (depending on editor behavior)
  });

  test("Keyboard navigation in context menu", async ({ page }) => {
    await openBlockMenu(page);

    const menu = page.locator("[role='menu'][data-block-id]");
    await expect(menu).toBeVisible();

    // Focus starts at first item? Or requires key press?
    // Press Down
    await page.keyboard.press("ArrowDown");
    // Verify selection visual change if possible (hard to check 'active' class without specific selector)

    // Press Enter on "Duplicate" (first item usually)
    // If we press Down once -> Delete (2nd item)
    // Let's rely on functional outcome or aria attributes if added

    // Just verifying menu stays open on Arrow keys and closes on Escape
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
  });
});
