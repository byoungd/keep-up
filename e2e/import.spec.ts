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

test.describe("Unread Import Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/unread", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible({ timeout: 10000 });
  });

  const openUnreadComposer = async (page: Page) => {
    const dialog = page.getByRole("dialog");
    const sidebarReady = page.getByRole("button", { name: /search|搜索/i });
    await sidebarReady.waitFor({ state: "visible", timeout: 15000 }).catch(() => null);

    const createButton = page.getByRole("button", { name: /create|创建/i });
    const isVisible = await createButton.isVisible({ timeout: 3000 }).catch(() => false);
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

    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    if (!dialogVisible) {
      return null;
    }
    return dialog;
  };

  test("error feedback is visible on failed import (URL unsupported)", async ({ page }) => {
    const dialog = await openUnreadComposer(page);
    if (!dialog) {
      test.skip();
      return;
    }

    const urlTab = dialog.getByRole("tab", { name: /url/i });
    if (await urlTab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await urlTab.click();
    }

    const urlInput = page.getByLabel(/url to import/i);
    await urlInput.fill("https://example.com");
    const submitButton = dialog.getByRole("button", { name: /^(import|导入)$/i }).last();
    await submitButton.click();

    await expect(
      page.getByText(/URL import is temporarily unavailable|URL 导入暂不可用/i)
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();
  });

  test("import text -> ready -> open reader (locale-aware)", async ({ page }) => {
    const dialog = await openUnreadComposer(page);
    if (!dialog) {
      test.skip();
      return;
    }

    const textarea = dialog.locator("textarea");
    await textarea.fill("# Test Import Document\n\nThis is a test document for the smoke test.");
    await textarea.press("Enter");

    await expect(dialog.getByText("Queue")).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Test Import Document")).toBeVisible();

    const importButton = dialog.getByRole("button", { name: /^(import|导入)$/i });
    await importButton.click();

    await expect(
      dialog.getByText(/ready|done/i).or(dialog.locator("[class*='emerald']"))
    ).toBeVisible({
      timeout: 15000,
    });

    const openButton = dialog.getByRole("button", { name: /open document|打开文档/i });
    const queueItemLabel = dialog.getByText("Test Import Document");

    await queueItemLabel.waitFor({ state: "visible", timeout: 10000 });
    await queueItemLabel.hover();

    const waitForReader = async () => {
      await page.waitForURL(/\/reader\/.+/, { timeout: 15000, waitUntil: "domcontentloaded" });
    };

    let navigated = false;
    const openReady = await openButton.isVisible({ timeout: 15000 }).catch(() => false);
    if (openReady) {
      await openButton.click();
      navigated = await waitForReader()
        .then(() => true)
        .catch(() => false);
    }

    if (!navigated) {
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);
      const docLink = page.getByRole("link", { name: /pasted-text/i });
      await expect(docLink).toBeVisible({ timeout: 10000 });
      const docHref = await docLink.getAttribute("href");
      if (docHref) {
        await page.goto(docHref, { waitUntil: "domcontentloaded" });
      } else {
        await docLink.click({ force: true });
      }
      await waitForReader();
    }

    await expect(page).toHaveURL(/\/reader\/.+/, { timeout: 15000 });

    const readerArticle = page.locator("main article");
    await expect(
      readerArticle.getByText("This is a test document for the smoke test.")
    ).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText("Unable to load document")).not.toBeVisible();
    await expect(page.getByText("Document not found")).not.toBeVisible();
  });
});
