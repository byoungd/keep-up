import { expect, test } from "@playwright/test";
import { clearEditorContent, waitForEditorReady } from "./helpers/editor";

test.use({ screenshot: "on", trace: "on" });

// Precise selector for editor content (avoids Sidebar pollution)
const EDITOR_UL = ".lfcc-editor .ProseMirror ul";
const EDITOR_OL = ".lfcc-editor .ProseMirror ol";

test("Bullet List", async ({ page }) => {
  await page.goto("/editor");
  await waitForEditorReady(page);
  await clearEditorContent(page);

  // 1. Clean Paragraph
  await page.keyboard.type("List Header");
  await page.keyboard.press("Enter");

  // 2. Open Menu
  await page.keyboard.type("/");
  const menu = page.getByTestId("slash-command-menu");
  await expect(menu).toBeVisible();

  // 3. Filter and Click (more robust than Enter)
  await page.keyboard.type("Bullet", { delay: 100 });
  const item = menu.locator("[cmdk-item][data-value='Bullet List']");
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).not.toBeVisible();

  // 4. Wait for list creation and Assert
  const ul = page.locator(EDITOR_UL);
  await expect(ul).toBeVisible({ timeout: 10000 });
});

test("Numbered List", async ({ page }) => {
  await page.goto("/editor");
  await waitForEditorReady(page);
  await clearEditorContent(page);

  await page.keyboard.type("Numbered Header");
  await page.keyboard.press("Enter");

  await page.keyboard.type("/");
  const menu = page.getByTestId("slash-command-menu");
  await expect(menu).toBeVisible();

  await page.keyboard.type("Numbered", { delay: 100 });
  const item = menu.locator("[cmdk-item][data-value='Numbered List']");
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).not.toBeVisible();

  const ol = page.locator(EDITOR_OL);
  await expect(ol).toBeVisible({ timeout: 10000 });
});

test("Quote", async ({ page }) => {
  await page.goto("/editor");
  await waitForEditorReady(page);
  await clearEditorContent(page);

  await page.keyboard.type("Quote Header");
  await page.keyboard.press("Enter");

  await page.keyboard.type("/");
  const menu = page.getByTestId("slash-command-menu");
  await expect(menu).toBeVisible();

  await page.keyboard.type("Quote", { delay: 100 });
  const item = menu.locator("[cmdk-item][data-value='Quote']");
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).not.toBeVisible();

  const quote = page.locator(".lfcc-editor .ProseMirror blockquote");
  await expect(quote).toBeVisible({ timeout: 10000 });
});
