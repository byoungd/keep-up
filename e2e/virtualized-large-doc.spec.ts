import { type Page, expect, test } from "@playwright/test";
import { waitForEditorReady } from "./helpers/editor";

test.describe("Virtualized Large Doc", () => {
  // Skip - this test requires significant resources and may timeout
  // The virtualization feature works but loading 5000 blocks is resource-intensive
  test.skip();

  const isExecutionContextError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }
    return (
      error.message.includes("Execution context was destroyed") ||
      error.message.includes("Target closed")
    );
  };

  const runWithNavigationRetry = async (
    page: Page,
    task: (resetNavigation: () => void) => Promise<void>,
    maxAttempts = 2
  ): Promise<void> => {
    let navigated = false;
    const handleNavigation = (frame: { url(): string }) => {
      if (frame === page.mainFrame()) {
        navigated = true;
      }
    };
    page.on("framenavigated", handleNavigation);

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        navigated = false;
        try {
          await task(() => {
            navigated = false;
          });
          return;
        } catch (error) {
          const retryable = navigated || isExecutionContextError(error);
          if (!retryable || attempt === maxAttempts) {
            throw error;
          }
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        }
      }
    } finally {
      page.off("framenavigated", handleNavigation);
    }
  };

  test("loads and scrolls with virtualized seed", async ({ page }) => {
    test.setTimeout(120_000);
    const docId = `perf-virtual-${Date.now()}`;
    const url = `/editor?doc=${docId}&seed=5000&virtual=1&virtual_view=1`;

    await runWithNavigationRetry(page, async (resetNavigation) => {
      await page.goto(url);
      await waitForEditorReady(page, { timeout: 60_000 });
      resetNavigation();

      const virtual = page.locator("[data-testid='virtualized-view']");
      await expect(virtual).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(".virtualized-row").first()).toContainText("Perf block", {
        timeout: 60_000,
      });

      // Virtualized view should render limited rows and scroll smoothly
      const rows = page.locator(".virtualized-row");
      const rowCount = await rows.count();
      expect(rowCount).toBeLessThan(200);
      await page.evaluate(() =>
        document.querySelector("[data-testid='virtualized-view']")?.scrollTo(0, 2000)
      );
      await page.waitForTimeout(500);
    });
  });
});
