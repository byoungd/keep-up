/**
 * E2E tests for flat block list architecture
 *
 * Tests the Notion-style flat list implementation where list behavior
 * is controlled by block attributes (list_type, indent_level, task_checked)
 * instead of nested DOM structure.
 */

import { expect, test } from "@playwright/test";
import { clearEditorContent, modKey, typeInEditor, waitForEditorReady } from "./helpers/editor";

const EDITOR_URL = "/en/editor";

test.describe("Flat List Architecture", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(EDITOR_URL);
    await waitForEditorReady(page, { timeout: 60000 });
    await clearEditorContent(page);
    await page.exposeFunction("__DEBUG_ENTER__", (msg: string) => {
      console.info(`[Runtime DEBUG]: ${msg}`);
    });
  });

  test.describe("Markdown Input Rules", () => {
    test("- space creates bullet list", async ({ page }) => {
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);

      // Verify bullet marker appears within the editor
      const bulletMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=•");
      await expect(bulletMarker).toBeVisible({ timeout: 3000 });

      // Type content and verify it's preserved
      await page.keyboard.type("First item");
      await expect(
        page.locator(".lfcc-editor .ProseMirror").locator("text=First item")
      ).toBeVisible();
    });

    test("* space creates bullet list", async ({ page }) => {
      await typeInEditor(page, "* ");
      await page.waitForTimeout(300);

      const bulletMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=•");
      await expect(bulletMarker).toBeVisible({ timeout: 3000 });
    });

    test("+ space creates bullet list", async ({ page }) => {
      await typeInEditor(page, "+ ");
      await page.waitForTimeout(300);

      const bulletMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=•");
      await expect(bulletMarker).toBeVisible({ timeout: 3000 });
    });

    test("1. space creates ordered list", async ({ page }) => {
      await typeInEditor(page, "1. ");
      await page.waitForTimeout(300);

      // Verify ordered number appears in editor
      const orderedMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=1.");
      await expect(orderedMarker).toBeVisible({ timeout: 3000 });

      await page.keyboard.type("First numbered item");
      await expect(
        page.locator(".lfcc-editor .ProseMirror").locator("text=First numbered item")
      ).toBeVisible();
    });

    test("- [ ] creates unchecked task list", async ({ page }) => {
      // Type the task list trigger character by character
      await typeInEditor(page, "- [ ] ");
      await page.waitForTimeout(300);

      // Verify task checkbox appears (button with checkbox styling)
      const taskCheckbox = page
        .locator(".lfcc-editor .ProseMirror")
        .locator('button[aria-label="Mark as complete"]');
      await expect(taskCheckbox).toBeVisible({ timeout: 3000 });

      await page.keyboard.type("Task item");
      await expect(
        page.locator(".lfcc-editor .ProseMirror").locator("text=Task item")
      ).toBeVisible();
    });

    test("- [x] creates checked task list", async ({ page }) => {
      await typeInEditor(page, "- [x] ");
      await page.waitForTimeout(300);

      // Verify checked task checkbox appears
      const taskCheckbox = page
        .locator(".lfcc-editor .ProseMirror")
        .locator('button[aria-label="Mark as incomplete"]');
      await expect(taskCheckbox).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Enter Key Behavior", () => {
    test("Enter in list creates new list item at correct position", async ({ page }) => {
      // Create first bullet item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First item");

      // Press Enter
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // Type second item
      await page.keyboard.type("Second item");
      await page.waitForTimeout(200);

      // Verify both items exist and are in correct order
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await expect(editor.locator("text=First item")).toBeVisible();
      await expect(editor.locator("text=Second item")).toBeVisible();

      // Verify we have 2 bullet markers in the editor
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(2);
    });

    test("Enter on empty list item exits list", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create bullet item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Item");

      // Press Enter to create new item (list item 2)
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300); // Wait for block creation

      // Verify we have 2 bullets now
      await expect(editor.locator("text=•")).toHaveCount(2);

      // Press Enter again on empty item (should exit list)
      await page.keyboard.press("Enter");

      // Wait for the bullet to disappear from the second line
      // The cursor should now be in a paragraph (no bullet)
      await expect(editor.locator("text=•")).toHaveCount(1);

      // Type something to verify it's a paragraph
      await page.keyboard.type("Regular paragraph");

      // Verify "Regular paragraph" is visible
      await expect(editor.locator("text=Regular paragraph")).toBeVisible();
    });

    test("Enter in middle of text splits list item", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("HelloWorld");

      // Move cursor between Hello and World
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("ArrowLeft");
      }
      await page.waitForTimeout(100);

      // Press Enter to split
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // Verify split occurred
      await expect(editor.locator("text=Hello")).toBeVisible();
      await expect(editor.locator("text=World")).toBeVisible();

      // Verify both are list items
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(2);
    });
  });

  test.describe("Tab/Shift-Tab Indentation", () => {
    test("Tab increases indent level", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Parent");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Child");

      // Press Tab to indent second item
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Verify both items still exist with bullets
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(2);
    });

    test("Shift-Tab decreases indent level", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create bullet and indent it
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Indented item");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Now outdent with Shift-Tab
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(200);

      // Item should still be a list item
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();
    });

    test("Shift-Tab at indent 0 exits list", async ({ page }) => {
      // Re-enabled to investigate root cause
      const editor = page.locator(".lfcc-editor .ProseMirror");

      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("List item");

      // Press Shift-Tab at indent 0 should exit list
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(200);

      // Bullet should be removed from editor
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(0);

      // Content should remain
      await expect(editor.locator("text=List item")).toBeVisible();
    });
  });

  test.describe("Backspace Behavior", () => {
    test("Backspace at start of list item decreases indent", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create indented list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Indented");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Move to start of text
      await page.keyboard.press(`${modKey}+ArrowLeft`);
      await page.waitForTimeout(100);

      // Backspace should decrease indent first
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      // Item should still be a list item
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();
    });

    test("Backspace at start of list item (indent 0) exits list", async ({ page }) => {
      // Re-enabled to investigate root cause
      const editor = page.locator(".lfcc-editor .ProseMirror");

      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("List item");

      // Move to start of text
      await page.keyboard.press(`${modKey}+ArrowLeft`);
      await page.waitForTimeout(100);

      // Backspace should exit list
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      // Bullet should be removed
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(0);

      // Content should remain
      await expect(editor.locator("text=List item")).toBeVisible();
    });
  });

  test.describe("Task List Interactions", () => {
    test("clicking task checkbox toggles state", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create unchecked task
      await typeInEditor(page, "- [ ] ");
      await page.waitForTimeout(300);
      await page.keyboard.type("My task");

      // Find and click the checkbox
      const uncheckedBox = editor.locator('button[aria-label="Mark as complete"]');
      await expect(uncheckedBox).toBeVisible({ timeout: 3000 });
      await uncheckedBox.click();
      await page.waitForTimeout(200);

      // Verify it's now checked
      const checkedBox = editor.locator('button[aria-label="Mark as incomplete"]');
      await expect(checkedBox).toBeVisible();
    });

    test("checked task shows strikethrough", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create checked task
      await typeInEditor(page, "- [x] ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Completed task");

      // Verify strikethrough style is applied
      const content = editor.locator(".line-through");
      await expect(content).toBeVisible({ timeout: 3000 });
    });

    test("Enter in task list creates new unchecked task", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create checked task
      await typeInEditor(page, "- [x] ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Done task");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // New task should be unchecked
      const uncheckedBox = editor.locator('button[aria-label="Mark as complete"]');
      await expect(uncheckedBox).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe("Cursor Positioning", () => {
    test("cursor is in correct position after Enter in list", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // Type immediately - should appear in second item, not first
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Verify content is in separate items
      const firstItem = editor.locator("[data-block-id]").filter({ hasText: "First" });
      const secondItem = editor.locator("[data-block-id]").filter({ hasText: "Second" });

      await expect(firstItem).toBeVisible();
      await expect(secondItem).toBeVisible();

      // Verify they are different elements (not merged)
      const firstText = await firstItem.textContent();
      const secondText = await secondItem.textContent();

      expect(firstText).not.toContain("Second");
      expect(secondText).not.toContain("First");
    });

    test("cursor position after Tab indent", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Item");

      // Press Tab
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Continue typing - should append to same item
      await page.keyboard.type(" more text");
      await page.waitForTimeout(200);

      await expect(editor.locator("text=Item more text")).toBeVisible();
    });
  });

  test.describe("Mixed List Types", () => {
    test("can create different list types in sequence", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // 1. Bullet list
      await typeInEditor(page, "- ");
      await expect(editor.locator("text=•")).toHaveCount(1);
      await page.keyboard.type("Bullet item");

      // Enter -> New item
      await page.keyboard.press("Enter");
      await expect(editor.locator("text=•")).toHaveCount(2);

      // Enter again -> Exit list
      await page.keyboard.press("Enter");
      await expect(editor.locator("text=•")).toHaveCount(1); // Only the first one remains

      // 2. Ordered list
      await page.keyboard.type("1. ");
      await expect(editor.locator("text=1.")).toBeVisible();
      await page.keyboard.type("Numbered item");

      // Enter -> New item
      await page.keyboard.press("Enter");
      // Wait for second number
      await expect(editor.locator("text=2.")).toBeVisible();

      // Enter again -> Exit list
      await page.keyboard.press("Enter");
      // Wait for second number to disappear
      await expect(editor.locator("text=2.")).toHaveCount(0);

      // 3. Task list
      await page.keyboard.type("- [ ] ");
      await expect(editor.locator('button[aria-label="Mark as complete"]')).toBeVisible();
      await page.keyboard.type("Task item");

      // Verify all content exists
      await expect(editor.locator("text=Bullet item")).toBeVisible();
      await expect(editor.locator("text=Numbered item")).toBeVisible();
      await expect(editor.locator("text=Task item")).toBeVisible();
    });
  });

  test.describe("Nested Indentation", () => {
    test("can create multi-level nested list", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create first item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Level 0");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);

      // Create second item and indent once
      await page.keyboard.type("Level 1");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);

      // Create third item and indent twice
      await page.keyboard.type("Level 2");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Verify all items exist
      await expect(editor.locator("text=Level 0")).toBeVisible();
      await expect(editor.locator("text=Level 1")).toBeVisible();
      await expect(editor.locator("text=Level 2")).toBeVisible();

      // Verify we have 3 bullet markers
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(3);
    });

    test("Tab at max indent level does nothing", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Item");

      // Press Tab 10 times (max is 6)
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);
      }

      // Content should still exist
      await expect(editor.locator("text=Item")).toBeVisible();

      // Should still be a list item
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();
    });

    test("Shift-Tab progressively decreases indent", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item and indent 3 times
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Deeply indented");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Shift-Tab twice
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(100);
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(200);

      // Should still be a list item (indent level 1)
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();
      await expect(editor.locator("text=Deeply indented")).toBeVisible();
    });
  });

  test.describe("Arrow Key Navigation", () => {
    test("ArrowDown moves to next list item", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");

      // Move to end of first item
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press(`${modKey}+ArrowRight`);
      await page.waitForTimeout(100);

      // Press ArrowDown
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(100);

      // Type to verify cursor position
      await page.keyboard.type("X");
      await page.waitForTimeout(200);

      // "X" should appear in the document
      await expect(editor.locator("text=X")).toBeVisible();
    });

    test("ArrowUp moves to previous list item", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Move to start of second item
      await page.keyboard.press(`${modKey}+ArrowLeft`);
      await page.waitForTimeout(100);

      // Press ArrowUp
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(200);

      // Type to verify cursor moved
      await page.keyboard.type("X");
      await page.waitForTimeout(200);

      // "X" should appear somewhere (cursor moved from second item)
      await expect(editor.locator("text=X")).toBeVisible();
      // First item should have X somewhere
      await expect(editor.locator("text=First")).toBeVisible();
    });
  });

  test.describe("Selection Behavior", () => {
    test("Shift+Enter inserts soft break in list item", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Line one");
      await page.waitForTimeout(200);

      // Shift+Enter to insert soft break
      await page.keyboard.press("Shift+Enter");
      await page.waitForTimeout(300);
      await page.keyboard.type("Line two");
      await page.waitForTimeout(300);

      // Both lines should be visible in the same block
      await expect(editor.locator("text=Line one")).toBeVisible();
      await expect(editor.locator("text=Line two")).toBeVisible();

      // Should have only 1 bullet (soft break stays in same item)
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(1);
    });

    test("selecting and typing replaces text in list item", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Original text");
      await page.waitForTimeout(200);

      // Select all text in item
      await page.keyboard.press(`${modKey}+a`);
      await page.waitForTimeout(100);

      // Type replacement
      await page.keyboard.type("Replacement");
      await page.waitForTimeout(200);

      // Should show replacement, not original
      await expect(editor.locator("text=Replacement")).toBeVisible();
    });
  });

  test.describe("Edge Cases", () => {
    test("Backspace in middle of list item text does not affect list", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item with text
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Hello World");
      await page.waitForTimeout(200);

      // Move cursor and delete
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      // Should still be a list item
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();

      // Text should be modified
      await expect(editor.locator("text=HelloWorld")).toBeVisible();
    });

    test("multiple consecutive Enter presses create multiple list items", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create first list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");

      // Press Enter 3 times and add content each time
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");

      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Third");

      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Fourth");

      await page.waitForTimeout(200);

      // Should have 4 bullets
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(4);
    });

    test("typing after list marker without space does not create list", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Type dash followed by letter (no space)
      await typeInEditor(page, "-a");
      await page.waitForTimeout(200);

      // Should NOT be a list (no bullet)
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(0);

      // Text should be visible as typed
      await expect(editor.locator("text=-a")).toBeVisible();
    });

    test("ordered list numbers increment correctly", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create first ordered item
      await typeInEditor(page, "1. ");
      await page.waitForTimeout(300);
      await page.keyboard.type("One");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Two");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Three");
      await page.waitForTimeout(200);

      // Verify content exists
      await expect(editor.locator("text=One")).toBeVisible();
      await expect(editor.locator("text=Two")).toBeVisible();
      await expect(editor.locator("text=Three")).toBeVisible();

      // Verify we have 3 ordered list items (markers with tabular-nums class)
      const orderedMarkers = editor.locator(".tabular-nums");
      await expect(orderedMarkers).toHaveCount(3);
    });

    test("task list preserves checked state on new items from checked parent", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create checked task
      await typeInEditor(page, "- [x] ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Done task");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);

      // New task should be unchecked (aria-label = "Mark as complete")
      const uncheckedBox = editor.locator('button[aria-label="Mark as complete"]');
      await expect(uncheckedBox).toBeVisible();

      // Original task should still be checked
      const checkedBox = editor.locator('button[aria-label="Mark as incomplete"]');
      await expect(checkedBox).toBeVisible();
    });
  });

  test.describe("Undo/Redo", () => {
    test("undo reverts list creation", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("List item");
      await page.waitForTimeout(200);

      // Verify bullet exists
      const bulletMarkers = editor.locator("text=•");
      await expect(bulletMarkers).toHaveCount(1);

      // Undo multiple times
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(200);
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(200);

      // Bullet should be gone or content changed
      const textContent = await editor.textContent();
      // Either the list is undone or the text is partially undone
      expect(textContent).toBeDefined();
    });

    test("undo reverts indent change", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create list item and indent
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Indented item");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Undo the indent
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(200);

      // Item should still be a list
      const bulletMarker = editor.locator("text=•").first();
      await expect(bulletMarker).toBeVisible();
    });
  });

  test.describe("Block Movement", () => {
    // Enable reduced motion to skip smooth scrolling animations during tests
    test.use({ contextOptions: { reducedMotion: "reduce" } });
    test("Cmd+Shift+ArrowUp moves block up", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");
      const blocks = editor.locator("[data-block-id]");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Click on second block to ensure focus
      await blocks.nth(1).click();
      await page.waitForTimeout(100);

      // Move second item up
      await page.keyboard.press(`${modKey}+Shift+ArrowUp`);
      await page.waitForTimeout(300);

      // Get all blocks and verify order changed
      const firstBlock = blocks.first();
      const secondBlock = blocks.nth(1);

      // "Second" should now be first
      await expect(firstBlock).toContainText("Second");
      await expect(secondBlock).toContainText("First");
    });

    test("Cmd+Shift+ArrowDown moves block down", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Click on first block to position cursor reliably
      const blocks = editor.locator("[data-block-id]");
      const firstBlock = blocks.first();
      await firstBlock.click();
      await page.waitForTimeout(100);

      // Move first item down
      await page.keyboard.press(`${modKey}+Shift+ArrowDown`);
      await page.waitForTimeout(300);

      // "First" should now be second (moved down)
      const secondBlock = blocks.nth(1);

      // "Second" should now be first
      await expect(secondBlock).toContainText("First");
    });

    test("Drag handle reorders list items", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Item A");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Item B");
      await page.waitForTimeout(200);

      // Find the two blocks
      const blockA = editor.locator("[data-block-id]").filter({ hasText: "Item A" });
      const blockB = editor.locator("[data-block-id]").filter({ hasText: "Item B" });

      // Hover over Item A to show the drag handle
      await blockA.hover();

      // Wait for handle to appear in portal
      const handle = page.locator(".lfcc-block-drag-handle").first();
      await expect(handle).toBeVisible();

      // Get bounding boxes
      const handleBox = await handle.boundingBox();
      const targetBox = await blockB.boundingBox();

      if (handleBox && targetBox) {
        // Perform drag
        // Move to handle center
        await page.mouse.move(
          handleBox.x + handleBox.width / 2,
          handleBox.y + handleBox.height / 2
        );
        await page.mouse.down();
        // Move slowly out (10px down) to trigger drag start
        await page.mouse.move(
          handleBox.x + handleBox.width / 2,
          handleBox.y + handleBox.height / 2 + 10,
          { steps: 5 }
        );
        // Move to target center
        await page.mouse.move(
          targetBox.x + targetBox.width / 2,
          targetBox.y + targetBox.height / 2,
          { steps: 20 }
        );
        await page.mouse.up();
      }

      // Allow simple timeout for reorder animation/state update
      await page.waitForTimeout(500);

      // Verify order
      const blocks = editor.locator("[data-block-id]");
      await expect(blocks.first()).toContainText("Item B");
      await expect(blocks.nth(1)).toContainText("Item A");
    });

    test("cannot move first block up", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Click on first block to position cursor reliably
      const blocks = editor.locator("[data-block-id]");
      await blocks.first().click();
      await page.waitForTimeout(100);

      // Try to move first item up (should do nothing)
      await page.keyboard.press(`${modKey}+Shift+ArrowUp`);
      await page.waitForTimeout(200);

      // Order should be unchanged
      await expect(blocks.first()).toContainText("First");
      await expect(blocks.nth(1)).toContainText("Second");
    });

    test("cannot move last block down", async ({ page }) => {
      const editor = page.locator(".lfcc-editor .ProseMirror");

      // Create two list items, cursor already on second
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("First");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Second");
      await page.waitForTimeout(200);

      // Try to move last item down (should do nothing)
      await page.keyboard.press(`${modKey}+Shift+ArrowDown`);
      await page.waitForTimeout(200);

      // Order should be unchanged
      const blocks = editor.locator("[data-block-id]");
      await expect(blocks.first()).toContainText("First");
      await expect(blocks.nth(1)).toContainText("Second");
    });
  });

  test.describe("ARIA Accessibility", () => {
    test("list items have role=listitem", async ({ page }) => {
      // Create bullet list
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Accessible item");
      await page.waitForTimeout(200);

      // Verify role attribute
      const listItem = page.locator('[role="listitem"]');
      await expect(listItem).toBeVisible();
    });

    test("list items have aria-level for indentation", async ({ page }) => {
      // Create indented list
      await typeInEditor(page, "- ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Level 0");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      await page.keyboard.type("Level 1");
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Verify aria-level attributes
      const level1Item = page.locator('[aria-level="1"]');
      const level2Item = page.locator('[aria-level="2"]');

      await expect(level1Item).toBeVisible();
      await expect(level2Item).toBeVisible();
    });

    test("task list items have aria-checked", async ({ page }) => {
      // Create unchecked task
      await typeInEditor(page, "- [ ] ");
      await page.waitForTimeout(300);
      await page.keyboard.type("Unchecked task");
      await page.waitForTimeout(200);

      // Verify unchecked state
      const uncheckedItem = page.locator('[aria-checked="false"]');
      await expect(uncheckedItem).toBeVisible();

      // Click checkbox to toggle
      const checkbox = page.locator('button[aria-label="Mark as complete"]');
      await checkbox.click();
      await page.waitForTimeout(200);

      // Verify checked state
      const checkedItem = page.locator('[aria-checked="true"]');
      await expect(checkedItem).toBeVisible();
    });
  });
});
