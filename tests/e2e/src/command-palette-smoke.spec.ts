import { expect, test } from "@playwright/test";

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
  });

  test("opens with keyboard shortcut and focuses input", async ({ page }) => {
    await page.keyboard.press("Control+K");

    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();

    const input = dialog.getByLabel("Search commands or sessions");
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
