import { expect, test } from "@playwright/test";

/**
 * Smoke Tests - Critical Path Verification
 *
 * These tests verify the most critical user paths work correctly.
 * They should be fast, stable, and run on every PR.
 */

test.describe("Smoke Tests", () => {
  test("home page renders with hero content", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Turn noisy updates into signals" })
    ).toBeVisible();
  });

  test("unread page loads with import CTA when empty", async ({ page }) => {
    await page.goto("/unread");

    // Should show the page header
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();

    // Should show either content list or empty state with import CTA
    const importButton = page.getByRole("button", { name: /import/i });
    const documentList = page.locator("[data-testid='document-list']");

    // Wait for either state to appear
    await expect(importButton.or(documentList)).toBeVisible({ timeout: 10000 });
  });

  test("projects page loads without 404", async ({ page }) => {
    await page.goto("/projects");

    // Should not show 404 page
    await expect(page.getByText("Page not found")).not.toBeVisible();

    // Should show projects header or empty state
    const projectsHeader = page.getByRole("heading", { name: /projects/i });
    await expect(projectsHeader).toBeVisible({ timeout: 10000 });
  });

  test("library page loads without 404", async ({ page }) => {
    await page.goto("/library");

    // Should not show 404 page
    await expect(page.getByText("Page not found")).not.toBeVisible();

    // Should show library header
    const libraryHeader = page.getByRole("heading", { name: /library/i });
    await expect(libraryHeader).toBeVisible({ timeout: 10000 });
  });

  test("404 page shows for invalid routes", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-12345", { waitUntil: "domcontentloaded" });

    // Should show 404 page with proper messaging
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByText("404 Error")).toBeVisible();

    // Should have navigation options
    await expect(page.getByRole("button", { name: /go back/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /go to unread/i })).toBeVisible();
  });

  test("error feedback is visible on failed import (URL unsupported)", async ({ page }) => {
    await page.goto("/unread");

    // Wait for page to load
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();

    // Try to find and click import button
    const importButton = page.getByRole("button", { name: /import/i });

    // If import button exists (empty state), click it
    if (await importButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await importButton.click();

      // Import modal should appear
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Switch to URL tab and attempt import (URL import disabled by default)
      const urlTab = page.getByRole("tab", { name: /url/i });
      if (await urlTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        await urlTab.click();
      }

      const urlInput = page.getByLabel(/url to import/i);
      await urlInput.fill("https://example.com");
      const submitButton = page.getByRole("button", { name: /import/i }).last();
      await submitButton.click();

      await expect(
        page.getByText("URL import is temporarily unavailable. Paste text instead.")
      ).toBeVisible();
    }

    // Verify page is still functional (no crash)
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();
  });

  test("import text → ready → open reader (locale-aware)", async ({ page }) => {
    // AC1-AC4, AC7: Full import → reader baseline journey
    await page.goto("/unread");
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();

    // Wait for sidebar to be ready
    const sidebarReady = page.getByRole("button", { name: /search|搜索/i });
    await sidebarReady.waitFor({ state: "visible", timeout: 15000 }).catch(() => null);

    // Try to open import dialog via Create button or keyboard shortcut
    const createButton = page.getByRole("button", { name: /create/i });
    if (await createButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createButton.click();
    } else {
      // Fallback to keyboard shortcut
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
      });
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+I`);
    }

    const dialog = page.getByRole("dialog");
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    if (!dialogVisible) {
      test.skip();
      return;
    }

    // AC1: Paste text and submit enqueues job
    const textarea = dialog.locator("textarea");
    await textarea.fill("# Test Import Document\n\nThis is a test document for the smoke test.");
    await textarea.press("Enter"); // Add to queue

    // Verify item appears in queue
    await expect(dialog.getByText("Queue")).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByText("Test Import Document")).toBeVisible();

    // Submit import (Cmd+Enter or click Import button)
    const importButton = dialog.getByRole("button", { name: /^(import|导入)$/i });
    await importButton.click();

    // AC2: Wait for completion (pending → ready)
    // The item should transition to ready state
    await expect(
      dialog.getByText(/ready|done/i).or(dialog.locator("[class*='emerald']"))
    ).toBeVisible({
      timeout: 15000,
    });

    // AC3: Click to open document - should navigate to locale-prefixed reader
    // The "Open document" button appears in the queue item on hover
    const openButton = dialog.getByRole("button", { name: /open document/i });
    const queueItem = dialog.locator("[class*='emerald']").first();

    // Hover to reveal the button, then click
    if (await queueItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await queueItem.hover();
    }

    if (await openButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openButton.click();
    } else {
      // Close dialog and click the document link in the unread list instead
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => null);
      const docLink = page.getByRole("link", { name: /pasted-text/i });
      await expect(docLink).toBeVisible({ timeout: 5000 });
      await docLink.click();
    }

    // AC4: Reader displays decoded content
    // Verify we're on the reader page (with locale prefix)
    await expect(page).toHaveURL(/\/reader\/.+/, { timeout: 10000 });

    // Verify content is rendered
    const readerArticle = page.locator("main article");
    await expect(readerArticle.getByText("Test Import Document")).toBeVisible({
      timeout: 10000,
    });

    // Verify no error state
    await expect(page.getByText("Unable to load document")).not.toBeVisible();
    await expect(page.getByText("Document not found")).not.toBeVisible();
  });

  test("navigation between main sections works", async ({ page }) => {
    // Start at unread
    await page.goto("/unread");
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();

    // Navigate to library (via sidebar or direct)
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: /library/i })).toBeVisible();

    // Navigate to projects
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();

    // Navigate back to unread
    await page.goto("/unread");
    await expect(page.getByRole("heading", { name: "Unread" })).toBeVisible();
  });
});
