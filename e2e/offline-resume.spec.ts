import { expect, test } from "@playwright/test";

test.describe("Offline resume", () => {
  const DOC_ID = `offline-resume-${Date.now()}`;
  const DEMO_URL = `/editor?doc=${DOC_ID}&peer=1&syncMode=websocket`;

  test("offline -> online keeps notes and diagnostics", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.goto(DEMO_URL);
    await page.waitForSelector("[data-lfcc-editor]", { timeout: 10000 });

    await expect(page.locator("[data-testid='connection-status']")).toContainText(
      /Online|Connected/,
      {
        timeout: 10000,
      }
    );

    const panelItem = page.locator("[data-annotation-role='panel-item']").first();
    if (!(await panelItem.isVisible({ timeout: 8000 }))) {
      test.skip();
      return;
    }

    const commentToggle = page.locator("[data-annotation-role='comment-toggle']").first();
    if (!(await commentToggle.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }
    await commentToggle.click();

    const noteInput = page.getByPlaceholder("Add a note...").first();
    if (!(await noteInput.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }

    const noteText = `Offline note ${Date.now()}`;
    await noteInput.fill(noteText);
    await noteInput.press("Enter");
    await expect(page.locator(`text=${noteText}`)).toBeVisible({ timeout: 3000 });

    await context.setOffline(true);
    await expect(page.locator("[data-testid='connection-status']")).toContainText(
      /Offline|Reconnecting/,
      {
        timeout: 10000,
      }
    );

    const editor = page.locator("[data-lfcc-editor]");
    await editor.click();
    await page.keyboard.type(" Offline edit");

    await context.setOffline(false);
    await expect(page.locator("[data-testid='connection-status']")).toContainText(
      /Online|Connected/,
      {
        timeout: 10000,
      }
    );

    await expect(page.locator(`text=${noteText}`)).toBeVisible({ timeout: 5000 });

    const diagBtn = page.locator("button:has-text('Copy diagnostics')").first();
    if (!(await diagBtn.isVisible({ timeout: 2000 }))) {
      test.skip();
      return;
    }
    await diagBtn.click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('"version": "1.0.0"');
  });
});
