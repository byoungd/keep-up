import { expect, test } from "@playwright/test";

test.describe("AI Gateway Enforcement (D2)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/editor");
    const editor = page.locator(".lfcc-editor .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 20000 });
    await page.waitForFunction(
      () => typeof (window as unknown as { __lfccView?: unknown }).__lfccView !== "undefined",
      { timeout: 20000 }
    );
  });

  test("valid gateway write succeeds via helper", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror").first();
    await editor.click();

    const result = await page.evaluate(() => {
      const apply = (
        window as unknown as {
          __applyAIGatewayWrite?: (payload: {
            text: string;
            action: string;
            source: string;
          }) => { success?: boolean; error?: string };
        }
      ).__applyAIGatewayWrite;
      if (!apply) {
        return { success: false, error: "missing helper" };
      }
      return apply({ text: "AI gateway OK", action: "insert_below", source: "e2e-valid" });
    });

    expect(result?.success).toBeTruthy();
    await expect(editor).toContainText("AI gateway OK");
  });

  test("AI-intent bypass without gateway metadata is rejected", async ({ page }) => {
    const editor = page.locator(".lfcc-editor .ProseMirror").first();
    await editor.click();

    const before = await editor.textContent();

    const result = await page.evaluate(() => {
      const win = window as unknown as {
        __lfccView?: {
          state: {
            tr: {
              insertText: (text: string) => {
                setMeta: (meta: unknown, value: boolean) => void;
              };
            };
          };
          dispatch: (tr: unknown) => void;
        };
        __AI_INTENT_META?: unknown;
      };
      const view = win.__lfccView;
      const intentMeta = win.__AI_INTENT_META;
      if (!view || !intentMeta) {
        return { status: "missing" };
      }
      const tr = view.state.tr.insertText("BYPASS_AI_WRITE");
      tr.setMeta(intentMeta, true);
      try {
        view.dispatch(tr);
        return { status: "applied" };
      } catch (err) {
        return { status: "rejected", message: (err as Error).message };
      }
    });

    expect(result.status).toBe("rejected");
    const after = await editor.textContent();
    expect(after).toBe(before);
  });
});
