import { expect, test } from "@playwright/test";
import {
  focusEditor,
  modKey,
  openFreshEditor,
  setEditorContent,
  typeInEditor,
} from "./helpers/editor";

test.describe.configure({ mode: "parallel" });

// ----------------------------------------------------------------------------
// Test Helpers (Local to this suite for now to ensure stability)
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Test Suites
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Test Suites
// ----------------------------------------------------------------------------

test.describe("Comprehensive Editor Verification", () => {
  test.describe.configure({ mode: "parallel" }); // Run in parallel for speed if possible

  // A. Core Formatting (Rich Text)
  test.describe("Rich Text Formatting", () => {
    const marks = [
      { name: "Bold", shortcut: "b", tag: "strong" },
      { name: "Italic", shortcut: "i", tag: "em" },
      { name: "Underline", shortcut: "u", tag: "u" },
      { name: "Inline Code", shortcut: "e", tag: "code" },
    ];

    for (const mark of marks) {
      test(`${mark.name} shortcut works`, async ({ page }) => {
        await openFreshEditor(page, `fmt-${mark.name}`);

        const testText = `Testing ${mark.name}`;
        await setEditorContent(page, testText);

        // Wait for content to be visible before selecting
        await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText(testText, {
          timeout: 5000,
        });
        await page.waitForTimeout(100); // Small stabilization delay

        // Select the text we just typed
        const { selectTextBySubstring } = await import("./helpers/editor");
        await selectTextBySubstring(page, testText);
        await page.waitForTimeout(100);

        // Apply formatting
        await page.evaluate(() =>
          (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
        );
        await page.keyboard.press(`${modKey}+${mark.shortcut}`);
        await page.waitForTimeout(200);

        // Assert: Check existence of the tag with longer timeout
        await expect(page.locator(`.lfcc-editor .ProseMirror ${mark.tag}`)).toBeVisible({
          timeout: 10000,
        });
        await expect(page.locator(`.lfcc-editor .ProseMirror ${mark.tag}`)).toHaveText(testText);
      });
    }
  });

  // B. Structural Elements (Input Rules)
  test.describe("Markdown Input Rules", () => {
    test("Heading 1 (# Space)", async ({ page }) => {
      await openFreshEditor(page, "input-h1");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Ensure editor is empty before starting
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");

      // Type trigger "#" then Space to activate input rule
      await page.keyboard.type("#");
      await page.keyboard.press("Space");
      // Now type the heading content
      await page.keyboard.type("Heading 1");

      await expect(page.locator(".lfcc-editor .ProseMirror h1")).toContainText("Heading 1", {
        timeout: 5000,
      });
    });

    test("Heading 2 (## Space)", async ({ page }) => {
      await openFreshEditor(page, "input-h2");
      const editor = page.locator(".lfcc-editor .ProseMirror");
      await editor.click();

      // Ensure editor is empty
      await page.keyboard.press(`${modKey}+a`);
      await page.keyboard.press("Backspace");

      // Type trigger "##" then Space to activate input rule
      await page.keyboard.type("##");
      await page.keyboard.press("Space");
      await page.keyboard.type("Heading 2");

      await expect(page.locator(".lfcc-editor .ProseMirror h2")).toContainText("Heading 2", {
        timeout: 5000,
      });
    });

    test("Bullet List (- Space)", async ({ page }) => {
      await openFreshEditor(page, "input-bullet");
      await typeInEditor(page, "- List Item");
      // Flat-list uses div role=listitem with bullet marker
      const bulletMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=•");
      await expect(bulletMarker).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("List Item");
    });

    test("Ordered List (1. Space)", async ({ page }) => {
      await openFreshEditor(page, "input-ordered");
      await typeInEditor(page, "1. Ordered Item");
      // Flat-list uses div role=listitem with ordered marker
      const orderedMarker = page.locator(".lfcc-editor .ProseMirror").locator("text=1.");
      await expect(orderedMarker).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Ordered Item");
    });

    test("Blockquote (> Space)", async ({ page }) => {
      await openFreshEditor(page, "input-quote");
      await typeInEditor(page, "> Quoted Text");

      const quote = page.locator(".lfcc-editor .ProseMirror blockquote");
      await expect(quote).toBeVisible({ timeout: 5000 });
      await expect(quote).toContainText("Quoted Text");
    });

    test("Code Block (``` Space)", async ({ page }) => {
      await openFreshEditor(page, "input-codeblock");
      await typeInEditor(page, "``` ");

      // Usually defaults to pre code
      const pre = page.locator(".lfcc-editor .ProseMirror pre");
      await expect(pre).toBeVisible({ timeout: 5000 });
    });
  });

  // C. List Operations (Nested)
  test.describe("List Operations", () => {
    test("Indent and Outdent behavior", async ({ page }) => {
      await openFreshEditor(page, "list-indent");

      // Create first list item via input rule
      await typeInEditor(page, "- Item 1");
      await page.waitForTimeout(500); // Wait for markdown input rule to process

      const editor = page.locator(".lfcc-editor .ProseMirror");
      await expect(editor.locator("text=•")).toHaveCount(1, { timeout: 5000 });

      // Press Enter then type second list item
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      await page.keyboard.type("Item 2", { delay: 50 });
      await page.waitForTimeout(500); // Wait for list item creation

      await expect(editor.locator("text=•")).toHaveCount(2, { timeout: 10000 });

      // Focus on second item and indent it
      await page.keyboard.press("Tab");
      await page.waitForTimeout(500); // Wait for indent operation

      // After indent, verify both items still exist with bullets
      await expect(editor.locator("text=•")).toHaveCount(2, { timeout: 5000 });

      // Outdent
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(500); // Wait for outdent operation

      // Verify still 2 bullets
      await expect(editor.locator("text=•")).toHaveCount(2, { timeout: 10000 });
    });
  });

  // D. Strikethrough
  test("Strikethrough shortcut", async ({ page }) => {
    await openFreshEditor(page, "fmt-strike");
    await typeInEditor(page, "Strike");
    const { selectTextBySubstring } = await import("./helpers/editor");
    await selectTextBySubstring(page, "Strike");
    await page.evaluate(() =>
      (window as unknown as { __lfccView?: { focus?: () => void } }).__lfccView?.focus?.()
    );
    await page.keyboard.press(`${modKey}+Shift+s`);
    const html = await page.locator(".lfcc-editor .ProseMirror").innerHTML();
    expect(html).toMatch(/<(s|del|strike)[^>]*>Strike<\/(s|del|strike)>/);
  });

  // E. Link (Skipped for now - requires dialog interaction)
  // F. Image/Video (Skipped - requires drag/drop or upload mock)

  // G. Undo/Redo Integration
  test.describe("Undo/Redo Integration", () => {
    test("Robust 3-step undo/redo", async ({ page }) => {
      await openFreshEditor(page, "undo-redo-robust");

      await setEditorContent(page, "Base");
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Base");
      await page.waitForTimeout(500);

      await focusEditor(page);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      await page.keyboard.type("Added", { delay: 50 });
      await page.waitForTimeout(800); // Ensure Loro commits the change

      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Base");
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Added");

      // Undo
      await focusEditor(page);
      await page.keyboard.press(`${modKey}+z`);
      await page.waitForTimeout(500); // Wait for undo
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Base");
      await expect(page.locator(".lfcc-editor .ProseMirror")).not.toContainText("Added");

      // Redo
      await focusEditor(page);
      await page.keyboard.press(`${modKey}+Shift+z`);
      await page.waitForTimeout(500); // Wait for redo
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Base");
      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Added");
    });
  });

  // H. Selection & Focus
  test.describe("Selection & Focus", () => {
    test("Focus restoration", async ({ page }) => {
      await openFreshEditor(page, "focus-restore");
      await setEditorContent(page, "Start");

      // Blur
      await page.locator("body").click();
      await page.waitForTimeout(300); // Wait for blur

      // Focus
      await focusEditor(page);
      await page.waitForTimeout(300); // Wait for focus to settle
      await page.keyboard.type("ed", { delay: 50 });

      await expect(page.locator(".lfcc-editor .ProseMirror")).toContainText("Started");
    });
  });
});
