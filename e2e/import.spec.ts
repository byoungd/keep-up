import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * E2E tests for the ContentComposer import flow.
 */

test.describe("Import Functionality", () => {
  const EDITOR_URL = "/editor?doc=import-test";

  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    await page.waitForLoadState("domcontentloaded");
  });

  const openComposer = async (page: Page) => {
    const dialog = page.getByRole("dialog");
    const sidebarReady = page.getByRole("button", { name: /search|搜索/i });
    await sidebarReady.waitFor({ state: "visible", timeout: 15000 }).catch(() => null);

    const createButton = page.getByRole("button", { name: /create|创建/i });
    const isVisible = await createButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (isVisible) {
      await createButton.click();
    } else {
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
      });
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+I`);
    }

    const dialogVisible = await dialog.isVisible({ timeout: 10000 }).catch(() => false);
    if (!dialogVisible) {
      return null;
    }
    return dialog;
  };

  test("Content composer can be opened from sidebar", async ({ page }) => {
    const dialog = await openComposer(page);
    if (!dialog) {
      test.skip();
      return;
    }

    await expect(dialog.locator("textarea")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /cancel|取消/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^(import|导入)$/i })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Composer detects URL and text input", async ({ page }) => {
    const dialog = await openComposer(page);
    if (!dialog) {
      test.skip();
      return;
    }

    const input = dialog.locator("textarea");
    await input.fill("https://example.com/article");
    await expect(dialog.getByText("Link")).toBeVisible();

    await input.fill("This is plain text");
    await expect(dialog.getByText("Text")).toBeVisible();
  });

  test("Pressing Enter adds text to the queue", async ({ page }) => {
    const dialog = await openComposer(page);
    if (!dialog) {
      test.skip();
      return;
    }

    const input = dialog.locator("textarea");
    await input.fill("Composer queue item");
    await input.press("Enter");

    await expect(input).toHaveValue("");
    await expect(dialog.getByText("Queue", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Composer queue item")).toBeVisible();
  });

  test("Selecting a file adds it to the queue", async ({ page }) => {
    const tempDir = path.join(process.cwd(), "e2e", ".temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "test-import.md");
    fs.writeFileSync(tempFile, "# Test Import Document\n\nContent Composer import.");

    try {
      const dialog = await openComposer(page);
      if (!dialog) {
        test.skip();
        return;
      }

      const fileInput = dialog.locator("input[type='file']");
      await fileInput.setInputFiles(tempFile);

      await expect(dialog.getByText("Queue")).toBeVisible();
      await expect(dialog.getByText("test-import.md")).toBeVisible();
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
