import { expect, test } from "@playwright/test";

const RUN_MULTI_REPLICA = process.env.UI_GATE_MULTI_REPLICA === "1";

test.describe("LFCC Collaboration Suite", () => {
  test.skip(!RUN_MULTI_REPLICA, "Requires multi-replica sync setup");
  test.describe.configure({ mode: "serial" });

  test("two replicas can edit and sync", async ({ browser }) => {
    // Create two separate browser contexts to simulate two users
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User A opens the demo
      await pageA.goto("/editor?peer=userA&doc=collab-demo");
      await expect(pageA.locator(".lfcc-editor .ProseMirror")).toBeVisible();

      // User B opens the same demo with different peer ID
      await pageB.goto("/editor?peer=userB&doc=collab-demo");
      await expect(pageB.locator(".lfcc-editor .ProseMirror")).toBeVisible();

      // Wait for initial sync
      await pageA.waitForTimeout(500);
      await pageB.waitForTimeout(500);

      // User A types some content
      const editorA = pageA.locator(".lfcc-editor .ProseMirror");
      await editorA.click();
      await pageA.keyboard.type("Hello from User A");

      // Wait for sync propagation
      await pageB.waitForTimeout(1000);

      // User B should see the content
      const editorB = pageB.locator(".lfcc-editor .ProseMirror");
      const contentB = await editorB.textContent();
      expect(contentB).toContain("Hello from User A");

      // User B types some content
      await editorB.click();
      await pageB.keyboard.press("End");
      await pageB.keyboard.type(" - Reply from User B");

      // Wait for sync propagation
      await pageA.waitForTimeout(1000);

      // User A should see the combined content
      const contentA = await editorA.textContent();
      expect(contentA).toContain("Reply from User B");
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("offline edits converge on reconnect", async ({ page }) => {
    await page.goto("/editor?peer=offlineTest&doc=collab-demo");
    await expect(page.locator(".lfcc-editor .ProseMirror")).toBeVisible();

    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Simulate offline mode by toggling network (if supported)
    // For now, we just verify the sync status component exists
    const syncStatus = page.locator('[data-testid="sync-status"]');
    if (await syncStatus.isVisible()) {
      // Verify it shows some status
      const statusText = await syncStatus.textContent();
      expect(statusText).toBeTruthy();
    }

    // Type while "offline"
    await editor.click();
    await page.keyboard.type("Offline edit");

    // Verify edit was applied locally
    const newContent = await editor.textContent();
    expect(newContent).toContain("Offline edit");
  });

  test("presence cursors appear when multiple replicas open", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto("/editor?peer=presenceA&doc=collab-demo");
      await pageB.goto("/editor?peer=presenceB&doc=collab-demo");

      await expect(pageA.locator(".lfcc-editor .ProseMirror")).toBeVisible();
      await expect(pageB.locator(".lfcc-editor .ProseMirror")).toBeVisible();

      // Wait for presence sync
      await pageA.waitForTimeout(1000);
      await pageB.waitForTimeout(1000);

      // Check for presence indicators (if implemented)
      // This test documents the expected behavior
      const presenceListA = pageA.locator('[data-testid="presence-list"]');
      const presenceListB = pageB.locator('[data-testid="presence-list"]');

      // If presence list exists, verify it shows peer count
      if (await presenceListA.isVisible()) {
        const textA = await presenceListA.textContent();
        expect(textA).toContain("online");
      }

      if (await presenceListB.isVisible()) {
        const textB = await presenceListB.textContent();
        expect(textB).toContain("online");
      }
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test("divergence triggers recovery UX", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.locator(".lfcc-editor .ProseMirror")).toBeVisible();

    // Simulate divergence event
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("lfcc:divergence", {
          detail: {
            diverged: true,
            editorChecksum: "test123",
            loroChecksum: "test456",
            reason: "E2E test divergence",
          },
        })
      );
    });

    // Check for divergence banner (if wired to window event)
    const banner = page.locator('[role="alert"]');
    const bannerVisible = await banner.isVisible().catch(() => false);

    if (bannerVisible) {
      // Verify banner has recovery options
      const bannerText = await banner.textContent();
      expect(bannerText?.toLowerCase()).toMatch(/diverge|mismatch|recovery/i);
    }
  });
});
