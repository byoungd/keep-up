import { expect, test } from "@playwright/test";

test.skip("verify remote cursor visibility", async ({ browser }) => {
  // TODO: Remote cursor rendering requires full cursor broadcast integration
  // The presence sync works (peers appear in sidebar) but cursor positions
  // are not being rendered. Likely issue with block IDs or cursor position mapping.
  const DOC_ID = `cursor-verify-${Date.now()}`;

  // Create two isolated contexts
  const contextA = await browser.newContext();
  contextA.on("console", (msg) => console.info(`[ContextA] ${msg.type()}: ${msg.text()}`));
  const contextB = await browser.newContext();
  contextB.on("console", (msg) => console.info(`[ContextB] ${msg.type()}: ${msg.text()}`));

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  pageA.on("pageerror", (err) => console.info(`[PageA Error] ${err}`));
  pageB.on("pageerror", (err) => console.info(`[PageB Error] ${err}`));

  // Helper to build URL
  const getUrl = (peerId: string) => `/editor?doc=${DOC_ID}&peer=${peerId}&syncMode=websocket`;

  // 1. Both users join
  await Promise.all([pageA.goto(getUrl("3001")), pageB.goto(getUrl("3002"))]);

  // Wait for editors to load
  await expect(pageA.locator("[data-lfcc-editor]")).toBeVisible();
  await expect(pageB.locator("[data-lfcc-editor]")).toBeVisible();

  // Wait for connection
  await expect(pageA.locator("[data-testid='connection-status']")).toContainText(
    /Online|Connected/,
    { timeout: 10000 }
  );
  await expect(pageB.locator("[data-testid='connection-status']")).toContainText(
    /Online|Connected/,
    { timeout: 10000 }
  );

  // 2. Alice clicks in the editor to establish a cursor position
  const editorA = pageA.locator("[data-lfcc-editor]");
  await editorA.click();
  await pageA.keyboard.type("Cursor check."); // Type something to ensure cursor is definitely placed

  // 3. Verify Bob sees a remote cursor
  // The cursor plugin creates elements with class .remote-cursor

  // Wait for cursor to be attached to DOM first
  const remoteCursorBar = pageB.locator(".remote-cursor-bar");

  // Verify the cursor bar is visible
  // (The wrapper .remote-cursor has 0 width due to negative margins, so we check the bar)
  await expect(remoteCursorBar).toBeVisible({ timeout: 10000 });

  const cursorLabel = pageB.locator(".remote-cursor-label");
  await expect(cursorLabel).toContainText("Anonymous");
});
