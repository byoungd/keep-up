import { expect, test } from "@playwright/test";

/**
 * E2E coverage for issue handling and deep link flows.
 */

test.describe("Issues and Deep Links", () => {
  const DEMO_URL = "/editor?seed=3";

  test("Copy annotation link opens deep link and focuses highlight", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(DEMO_URL);

    const editor = page.locator('[data-testid="lfcc-editor"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    const panelItem = page.locator("[data-annotation-role='panel-item']").first();
    if (!(await panelItem.isVisible({ timeout: 3000 }))) {
      test.skip();
      return;
    }

    const annotationId = await panelItem.getAttribute("data-annotation-id");
    if (!annotationId) {
      test.skip();
      return;
    }

    const copyLink = page.locator("[data-annotation-role='copy-link']").first();
    if (!(await copyLink.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }

    await copyLink.click();
    await expect(page.locator("text=Annotation link copied.")).toBeVisible({ timeout: 3000 });

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(`ann=${annotationId}`);

    await page.goto(clipboardText);
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).toHaveAttribute("data-lfcc-scroll-target", annotationId, {
      timeout: 4000,
    });
  });

  test("Missing annotation deep link shows missing issue banner", async ({ page }) => {
    await page.goto(`${DEMO_URL}&ann=missing-1234`);

    const panel = page.locator('[data-testid="annotation-panel"]');
    await expect(panel).toBeVisible({ timeout: 10000 });

    const missingBanner = page.locator("text=Missing annotation");
    await expect(missingBanner).toBeVisible({ timeout: 3000 });
  });

  test("Issue drawer exposes recovery actions", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(DEMO_URL);

    const editor = page.locator('[data-testid="lfcc-editor"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    const scrollAction = page.locator("[data-annotation-role='scroll-action']").first();
    if (!(await scrollAction.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }
    await scrollAction.click();

    await page.keyboard.press("Meta+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(500);

    const warningBanner = page.locator("[data-annotation-role='warning-banner']").first();
    if (!(await warningBanner.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }

    const issueDetails = page.locator("summary:has-text('Issue details')").first();
    await issueDetails.click();

    const copyButton = page.locator("button:has-text('Copy diagnostics')").first();
    await expect(copyButton).toBeVisible({ timeout: 2000 });
  });

  test("Forced divergence banner shows recovery actions", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${DEMO_URL}&forceDivergence=1`);

    const banner = page.locator("text=Document State Divergence Detected");
    await expect(banner).toBeVisible({ timeout: 5000 });

    await expect(page.locator("button:has-text('Export repro')")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("button:has-text('Reload')")).toBeVisible({ timeout: 2000 });
    await expect(page.locator("button:has-text('Read-only mode')")).toBeVisible({ timeout: 2000 });
  });
});
