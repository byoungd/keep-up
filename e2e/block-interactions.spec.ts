import { expect, test } from "@playwright/test";
import { getDocInfo, openFreshEditor } from "./helpers/editor";

test.describe("Block Interactions", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `block-interactions-${testInfo.title}`, { clearContent: false });
  });

  test("Slash menu insertion", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();

    // Clear any potential existing text or selection issues
    await editor.press("Enter");

    // Type / slowly to ensure event handling
    await page.keyboard.press("/");

    // Expect menu to appear quickly after /
    const menu = page.getByTestId("slash-command-menu");
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Verify "Text" command exists (cmdk uses [cmdk-item] for items)
    const defaultItem = page.locator("[cmdk-item]").filter({ hasText: "Text" }).first();
    await expect(defaultItem).toBeVisible();

    // Select Heading 1 explicitly (it should be in default list)
    const item = page.locator("[cmdk-item]").filter({ hasText: "Heading 1" }).first();
    await expect(item).toBeVisible();
    await item.click();

    await expect.poll(async () => (await getDocInfo(page)).selectionBlockType).toBe("heading");
  });

  test("Block Hover Gutter appears", async ({ page }) => {
    // Need to seed content or find a block
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();

    // Hover
    await content.hover();

    // Check for gutter
    // Gutter is in Portal (body > div)
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible();

    const addBtn = page.getByLabel("Add block");
    await expect(addBtn).toBeVisible();
  });

  test("Clicking handle selects block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();
    await content.hover();

    const blockId = await block.getAttribute("data-block-id");
    if (!blockId) {
      throw new Error("Block id not found");
    }

    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await handle.click();

    await expect
      .poll(async () => {
        return await page.evaluate((id) => {
          const globalAny = window as unknown as {
            __lfccView?: import("prosemirror-view").EditorView;
          };
          const view = globalAny.__lfccView;
          const selectedId = view?.state?.selection?.node?.attrs?.block_id;
          return selectedId === id;
        }, blockId);
      })
      .toBe(true);
  });

  test("Clicking Plus adds block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const initialCount = (await getDocInfo(page)).childCount;

    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();
    await content.hover();
    const addBtn = page.getByLabel("Add block");
    await addBtn.click();

    await expect.poll(async () => (await getDocInfo(page)).childCount).toBe(initialCount + 1);
  });

  test("Block context menu appears", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();
    await content.hover();

    // Click menu button
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible();
    await handle.click();

    // Expect context menu
    const menu = page.locator("[role='menu'][data-block-id]");
    await expect(menu).toBeVisible();

    // Has expected items
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();

    // Close by pressing Escape
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
  });

  test("Block context menu - Delete removes block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const initialCount = (await getDocInfo(page)).childCount;

    const block = editor.locator("[data-block-id]").first();
    const content = block.locator("[data-content-container]").first();
    await content.hover();

    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await handle.click();

    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("menuitem", { name: "Confirm delete?" }).click();

    await expect.poll(async () => (await getDocInfo(page)).childCount).toBe(initialCount - 1);
  });
});
