import { expect, test } from "@playwright/test";
import {
  focusEditor, // Ensure this is exported in helpers/editor.ts or imported correctly
  openFreshEditor,
} from "./helpers/editor";

test.describe("Editor Agent Task Execution", () => {
  test("Can create task, execute via agent, and verify completion", async ({ page }) => {
    // 1. Open editor
    await openFreshEditor(page, "agent-task-execution");

    // 2. Create a task item using markdown shortcut
    // Focus editor
    await focusEditor(page);

    // Type trigger sequence explicitly
    await page.keyboard.type("- [ ]");
    await page.keyboard.press("Space"); // Trigger input rule
    await page.waitForTimeout(500); // Wait for conversion

    // Type task content
    await page.keyboard.type("Buy milk for the agent");
    await page.keyboard.press("Enter");

    // Verify task list structure created
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Check if the task mark button is visible (rendered by BlockNodeView)
    const btn = editor.locator('button[aria-label="Mark as complete"]');
    await expect(btn).toBeVisible({ timeout: 5000 });

    // 3. Setup console listener to verify log
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "info") {
        consoleLogs.push(msg.text());
      }
    });

    // 4. Hover over the task item to reveal the Agent Execute button
    // We target the group container
    const taskItem = editor.locator(".group").first();
    await taskItem.hover();

    // Verify Agent Execute button appears
    // The button has aria-label="Execute with Agent"
    const executeBtn = taskItem.locator('button[aria-label="Execute with Agent"]');
    await expect(executeBtn).toBeVisible();

    // 5. Click the Execute button
    await executeBtn.click();

    // 6. Verify Loading State
    // The button should have opacity-100 and text-primary (or checking for animate-pulse icon)
    const sparklesIcon = executeBtn.locator(".animate-pulse");
    await expect(sparklesIcon).toBeVisible();

    // Verify console log was triggered immediately
    expect(consoleLogs).toContain("🤖 Agent executing task: Buy milk for the agent");

    // 7. Wait for execution to complete (simulated 1.5s delay)
    // We wait for the checkbox to change state to "Mark as incomplete" (which means it IS checked/completed)
    // The "Execute" button should disappear (since it's only for unchecked tasks)

    // Increased timeout to be safe
    await expect(editor.locator('button[aria-label="Mark as incomplete"]')).toBeVisible({
      timeout: 5000,
    });

    // Verify task text is struck through (line-through class)
    // The content wrapper has the class
    const content = editor.locator('[data-content-container="true"]').first();
    await expect(content).toHaveClass(/line-through/);

    // Verify Execute button is GONE (because task is checked)
    await expect(executeBtn).not.toBeVisible();
  });

  test("Agent button does not appear on completed tasks", async ({ page }) => {
    await openFreshEditor(page, "agent-task-completed");

    // Create a checked task: "- [x] "
    await focusEditor(page);
    await page.keyboard.type("- [x]");
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);
    await page.keyboard.type("Already done task");
    await page.keyboard.press("Enter");

    const taskItem = page.locator(".lfcc-editor .ProseMirror .group").first();
    await taskItem.hover();

    // Execute button should NOT be there
    const executeBtn = taskItem.locator('button[aria-label="Execute with Agent"]');
    await expect(executeBtn).not.toBeVisible();
  });
});
