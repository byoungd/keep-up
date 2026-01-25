import { expect, test } from "@playwright/test";

test.describe("AI Feature Surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
  });

  test("shows AI assistant input", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "AI assistant panel" })).toBeVisible();
    await expect(page.getByLabel("Ask anything...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  });
});
