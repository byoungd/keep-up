/**
 * Robust Slash Menu Execution Tests
 *
 * Verifies that slash commands execute correctly in realistic editing scenarios.
 * Strategy: Sequential execution in a single test context to ensure stability.
 */

import { expect, test } from "@playwright/test";
import { clearEditorContent, waitForEditorReady } from "./helpers/editor";

test.use({ screenshot: "on", trace: "on" });
test.setTimeout(120000);

test("Slash Menu Robust Sequence", async ({ page }) => {
  await page.goto("/editor");
  await waitForEditorReady(page);
  await clearEditorContent(page);
  const menu = page.getByTestId("slash-command-menu");

  // --- Test 1: Heading 1 ---
  await test.step("Heading 1", async () => {
    await page.keyboard.type("Title");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/");
    await expect(menu).toBeVisible();
    await page.keyboard.type("Heading 1", { delay: 100 });
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();

    await expect(page.locator(".lfcc-editor .ProseMirror h1")).toBeVisible();
  });

  await page.reload();
  await waitForEditorReady(page);
  await clearEditorContent(page);

  // --- Test 2: Bullet List ---
  await test.step("Bullet List", async () => {
    await page.keyboard.type("List Header");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/");
    await expect(menu).toBeVisible();
    await page.keyboard.type("Bullet", { delay: 100 });
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();

    // Stabilization
    await page.waitForTimeout(1000);

    const ul = page.locator(".lfcc-editor .ProseMirror ul");
    await expect(ul).toBeVisible();
  });

  await clearEditorContent(page);

  // --- Test 3: Numbered List ---
  await test.step("Numbered List", async () => {
    await page.keyboard.type("Numbered Header");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/");
    await expect(menu).toBeVisible();
    await page.keyboard.type("Numbered", { delay: 100 });
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();

    await page.waitForTimeout(1000);
    const ol = page.locator(".lfcc-editor .ProseMirror ol");
    await expect(ol).toBeVisible();
  });

  await clearEditorContent(page);

  // --- Test 4: Quote ---
  await test.step("Quote", async () => {
    await page.keyboard.type("Quote Header");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/");
    await expect(menu).toBeVisible();
    await page.keyboard.type("Quote", { delay: 100 });
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();

    await page.waitForTimeout(1000);
    const quote = page.locator(".lfcc-editor .ProseMirror blockquote");
    await expect(quote).toBeVisible();
  });

  await clearEditorContent(page);

  // --- Test 5: Divider ---
  await test.step("Divider", async () => {
    await page.keyboard.type("Top");
    await page.keyboard.press("Enter");

    await page.keyboard.type("/");
    await expect(menu).toBeVisible();
    await page.keyboard.type("Divider", { delay: 100 });
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();

    await page.waitForTimeout(500);
    await expect(page.locator(".lfcc-editor .ProseMirror hr")).toBeVisible();
  });
});
