import { expect, test } from "@playwright/test";
import { focusEditor, getDocInfo, openFreshEditor, typeInEditor } from "./helpers/editor";

test.describe("Block Interactions", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await openFreshEditor(page, `block-interactions-${testInfo.title}`, { clearContent: true });
    // Seed initial content to ensure blocks exist for testing
    await focusEditor(page);
    await typeInEditor(page, "Test content for block interactions");
    await page.keyboard.press("Enter");
    await typeInEditor(page, "Second paragraph for testing");
    await page.waitForTimeout(200);
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

    // Wait for block to be ready before hovering
    await expect(block).toBeVisible({ timeout: 5000 });

    // Get bounding box and hover at center
    const box = await block.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await block.hover();
    }

    // Wait for gutter portal to mount (it's rendered in a portal)
    await page.waitForTimeout(300);

    // Check for gutter (in Portal)
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 10000 });

    const addBtn = page.getByLabel("Add block");
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test("Clicking handle selects block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    await expect(block).toBeVisible({ timeout: 5000 });

    // Hover at center of block
    const box = await block.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await block.hover();
    }
    await page.waitForTimeout(300);

    const blockId = await block.getAttribute("data-block-id");
    if (!blockId) {
      throw new Error("Block id not found");
    }

    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 10000 });
    await handle.click();

    await expect
      .poll(
        async () => {
          return await page.evaluate((id) => {
            const globalAny = window as unknown as {
              __lfccView?: { state?: { selection?: { node?: { attrs?: { block_id?: string } } } } };
            };
            const view = globalAny.__lfccView;
            const selectedId = view?.state?.selection?.node?.attrs?.block_id;
            return selectedId === id;
          }, blockId);
        },
        { timeout: 10000 }
      )
      .toBe(true);
  });

  test("Clicking Plus adds block", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const initialCount = (await getDocInfo(page)).childCount;

    const block = editor.locator("[data-block-id]").first();
    await expect(block).toBeVisible({ timeout: 5000 });

    // Hover at center of block
    const box = await block.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await block.hover();
    }
    await page.waitForTimeout(300);

    const addBtn = page.getByLabel("Add block");
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    await expect
      .poll(async () => (await getDocInfo(page)).childCount, { timeout: 10000 })
      .toBe(initialCount + 1);
  });

  test("Block context menu appears", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror");
    const block = editor.locator("[data-block-id]").first();
    await expect(block).toBeVisible({ timeout: 5000 });

    // Hover at center of block
    const box = await block.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await block.hover();
    }
    await page.waitForTimeout(300);

    // Click menu button
    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 10000 });
    await handle.click();

    // Expect context menu
    const menu = page.locator("[role='menu'][data-block-id]");
    await expect(menu).toBeVisible({ timeout: 5000 });

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
    await expect(block).toBeVisible({ timeout: 5000 });

    // Hover at center of block
    const box = await block.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await block.hover();
    }
    await page.waitForTimeout(300);

    const handle = page.getByLabel("Drag to reorder or Click for menu");
    await expect(handle).toBeVisible({ timeout: 10000 });
    await handle.click();

    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("menuitem", { name: "Confirm delete?" }).click();

    await expect
      .poll(async () => (await getDocInfo(page)).childCount, { timeout: 10000 })
      .toBe(initialCount - 1);
  });
});
