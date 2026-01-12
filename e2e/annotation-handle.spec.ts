import { type Page, expect, test } from "@playwright/test";
import {
  focusEditor,
  getAnnotationIds,
  getPointForSubstring,
  selectRangeBetweenSubstrings,
  selectTextBySubstring,
  waitForEditorReady,
} from "./helpers/editor";

test.use({ screenshot: "only-on-failure" });

const isExecutionContextError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("Execution context was destroyed") ||
    error.message.includes("Target closed")
  );
};

const runWithNavigationRetry = async (
  page: Page,
  task: (resetNavigation: () => void) => Promise<void>,
  maxAttempts = 2
): Promise<void> => {
  let navigated = false;
  const handleNavigation = (frame: { url(): string }) => {
    if (frame === page.mainFrame()) {
      navigated = true;
    }
  };
  page.on("framenavigated", handleNavigation);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      navigated = false;
      try {
        await task(() => {
          navigated = false;
        });
        return;
      } catch (error) {
        const retryable = navigated || isExecutionContextError(error);
        if (!retryable || attempt === maxAttempts) {
          throw error;
        }
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      }
    }
  } finally {
    page.off("framenavigated", handleNavigation);
  }
};

async function appendParagraphs(page: Page, lines: string[]): Promise<void> {
  await focusEditor(page);
  await page.keyboard.press("End");
  for (const line of lines) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

async function createSingleBlockAnnotation(page: Page): Promise<string> {
  const baselineIds = await getAnnotationIds(page);
  // Insert unique text to avoid existing seeded highlights.
  const unique = `HANDLE TEST ${Date.now()}`;
  await appendParagraphs(page, [unique]);
  await selectTextBySubstring(page, unique);

  const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
  await expect(highlightButton).toBeVisible({ timeout: 3000 });
  await highlightButton.click();

  await expect
    .poll(async () => (await getAnnotationIds(page)).length)
    .toBeGreaterThan(baselineIds.length);

  const currentIds = await getAnnotationIds(page);
  const annotationId = currentIds.find((id) => !baselineIds.includes(id));
  if (!annotationId) {
    throw new Error("Failed to create a new annotation");
  }
  return annotationId;
}

async function getHandleCenter(
  page: Page,
  annotationId: string,
  handleType: "start" | "end"
): Promise<{ x: number; y: number } | null> {
  return await page.evaluate(
    ({ annotationId, handleType }) => {
      const handle = document.querySelector<HTMLElement>(
        `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="${handleType}"]`
      );
      if (!handle) {
        return null;
      }
      const rect = handle.getBoundingClientRect();
      const before = getComputedStyle(handle, "::before");
      const parse = (value: string) => {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      };
      const left = rect.left + parse(before.left);
      const top = rect.top + parse(before.top);
      const width = parse(before.width);
      const height = parse(before.height);
      return {
        x: left + width / 2,
        y: top + height / 2,
      };
    },
    { annotationId, handleType }
  );
}

async function getAnnotationBounds(page: Page, annotationId: string) {
  return await page.evaluate((id) => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        `.lfcc-editor .lfcc-annotation[data-annotation-id="${id}"]`
      )
    );
    if (nodes.length === 0) {
      return null;
    }
    const ordered = nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left + window.scrollX,
          right: rect.right + window.scrollX,
        };
      })
      .sort((a, b) => a.left - b.left);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    return {
      left: first.left,
      right: last.right,
    };
  }, annotationId);
}

async function getHandleBounds(page: Page, annotationId: string, handleType: "start" | "end") {
  return await page.evaluate(
    ({ id, type }) => {
      const handle = document.querySelector<HTMLElement>(
        `.lfcc-annotation-handle[data-annotation-id="${id}"][data-handle="${type}"]`
      );
      if (!handle) {
        return null;
      }
      const rect = handle.getBoundingClientRect();
      const before = getComputedStyle(handle, "::before");
      const parse = (value: string) => {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      };
      const left = rect.left + window.scrollX + parse(before.left);
      const top = rect.top + window.scrollY + parse(before.top);
      const width = parse(before.width);
      const height = parse(before.height);
      return {
        left,
        right: left + width,
        centerX: left + width / 2,
        top,
        bottom: top + height,
      };
    },
    { id: annotationId, type: handleType }
  );
}

async function verifyHandlePositioning(page: Page, resetNavigation: () => void) {
  await page.goto("/editor");
  await waitForEditorReady(page);
  resetNavigation();

  const annotationId = await createSingleBlockAnnotation(page);

  // Click on annotation to focus it (show handles)
  const annotation = page
    .locator(`.lfcc-editor .lfcc-annotation[data-annotation-id="${annotationId}"]`)
    .first();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await annotation.click();

  const annotationBounds = await getAnnotationBounds(page, annotationId);
  if (!annotationBounds) {
    throw new Error("Annotation bounds missing");
  }

  // Get start and end handles
  const startHandle = page.locator(
    `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="start"]`
  );
  const endHandle = page.locator(
    `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="end"]`
  );

  const startBox =
    (await startHandle.count()) > 0 ? await getHandleBounds(page, annotationId, "start") : null;
  const endBox =
    (await endHandle.count()) > 0 ? await getHandleBounds(page, annotationId, "end") : null;
  if (startBox || endBox) {
    const threshold = await page.evaluate(() => {
      const annotation = document.querySelector(".lfcc-editor .lfcc-annotation");
      if (!annotation) {
        return 24;
      }
      const lineHeight = Number.parseFloat(getComputedStyle(annotation).lineHeight);
      if (Number.isNaN(lineHeight)) {
        return 24;
      }
      return Math.max(24, lineHeight * 2.5);
    });

    const centers = [startBox?.centerX, endBox?.centerX].filter(
      (value): value is number => typeof value === "number"
    );
    if (centers.length > 0) {
      for (const center of centers) {
        expect(center).toBeGreaterThanOrEqual(annotationBounds.left - threshold);
        expect(center).toBeLessThanOrEqual(annotationBounds.right + threshold);
      }
    }
  }
}

test.describe("Annotation Handle Positioning", () => {
  test("handles are positioned at annotation boundaries", async ({ page }) => {
    await runWithNavigationRetry(page, async (resetNavigation) => {
      await verifyHandlePositioning(page, resetNavigation);
    });
  });

  test("handles should not cause layout shift", async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);
    const editor = page.locator(".lfcc-editor .ProseMirror");

    // Find annotation and click it to show handles
    await createSingleBlockAnnotation(page);
    // Get initial editor height after content is inserted but before handles render
    const initialHeight = await editor.evaluate((el) => el.scrollHeight);
    const annotation = page.locator(".lfcc-editor .lfcc-annotation").first();
    await annotation.click();

    // Wait for handles to render
    await page.waitForTimeout(200);

    // Get editor height after handles appear
    const afterHeight = await editor.evaluate((el) => el.scrollHeight);

    // Height should not change materially (no layout shift). Allow tiny tolerance for rendering.
    expect(Math.abs(afterHeight - initialHeight)).toBeLessThanOrEqual(2);
  });
});

test.describe("Annotation Hover Stability", () => {
  test("hidden handles do not intercept pointer events", async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);

    const annotationId = await createSingleBlockAnnotation(page);

    await page.evaluate(() => window.getSelection()?.removeAllRanges());

    const handle = page.locator(
      `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="start"]`
    );
    await expect(handle).toHaveCount(1);

    const annotation = page
      .locator(`.lfcc-editor .lfcc-annotation[data-annotation-id="${annotationId}"]`)
      .last();
    await annotation.hover();
    await page.waitForTimeout(100);

    await expect
      .poll(async () => handle.evaluate((node) => getComputedStyle(node).pointerEvents))
      .toBe("auto");

    const header = page.getByRole("heading", { name: "Untitled Document" });
    if (await header.count()) {
      await header.hover();
    } else {
      await page.mouse.move(4, 4);
    }
    await page.waitForTimeout(80);

    await expect
      .poll(async () => handle.evaluate((node) => getComputedStyle(node).pointerEvents))
      .toBe("none");
  });
});

test.describe("Annotation Drag Preview", () => {
  test("drag preview uses text-level rects", async ({ page }) => {
    await page.goto("/editor");
    await waitForEditorReady(page);

    const suffix = Date.now().toString().slice(-5);
    const lineOne = `Preview line one ${suffix}`;
    const lineTwo = `Preview line two ${suffix}`;
    await appendParagraphs(page, [lineOne, lineTwo]);

    const baselineIds = await getAnnotationIds(page);
    await selectRangeBetweenSubstrings(page, lineOne, lineTwo);

    const highlightButton = page.getByRole("button", { name: "Highlight yellow" });
    await expect(highlightButton).toBeVisible({ timeout: 3000 });
    await highlightButton.click();

    await expect
      .poll(async () => (await getAnnotationIds(page)).length)
      .toBeGreaterThan(baselineIds.length);

    const currentIds = await getAnnotationIds(page);
    const annotationId = currentIds.find((id) => !baselineIds.includes(id));
    if (!annotationId) {
      throw new Error("Failed to create a new annotation");
    }

    const annotation = page
      .locator(`.lfcc-editor .lfcc-annotation[data-annotation-id="${annotationId}"]`)
      .last();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const header = page.getByRole("heading", { name: "Untitled Document" });
    if (await header.count()) {
      await header.hover();
    } else {
      await page.mouse.move(4, 4);
    }
    await page.waitForTimeout(60);
    await annotation.hover();
    await page.waitForTimeout(80);

    const handleLocator = page.locator(
      `.lfcc-annotation-handle[data-annotation-id="${annotationId}"][data-handle="end"]`
    );
    await expect
      .poll(async () => handleLocator.evaluate((node) => getComputedStyle(node).pointerEvents))
      .toBe("auto");

    const handleCenter = await getHandleCenter(page, annotationId, "end");
    if (!handleCenter) {
      throw new Error("End handle not found");
    }

    const targetPoint = await getPointForSubstring(page, lineTwo);
    if (!targetPoint) {
      throw new Error("Target text not found for drag");
    }

    await page.mouse.move(handleCenter.x, handleCenter.y);
    await page.mouse.down();
    try {
      await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 6 });
      await page.waitForSelector(".annotation-preview", { timeout: 3000 });

      const metrics = await page.evaluate((id) => {
        const overlayWidths = Array.from(
          document.querySelectorAll<HTMLElement>(".annotation-preview")
        )
          .map((node) => node.getBoundingClientRect().width)
          .filter((width) => width > 0);
        const spanWidths = Array.from(
          document.querySelectorAll<HTMLElement>(`.lfcc-annotation[data-annotation-id="${id}"]`)
        )
          .map((node) => node.getBoundingClientRect().width)
          .filter((width) => width > 0);
        const maxSpanWidth = spanWidths.length > 0 ? Math.max(...spanWidths) : 0;
        return { overlayWidths, maxSpanWidth };
      }, annotationId);

      expect(metrics.overlayWidths.length).toBeGreaterThan(0);
      const tolerance = 8;
      for (const width of metrics.overlayWidths) {
        expect(width).toBeLessThanOrEqual(metrics.maxSpanWidth + tolerance);
      }
    } finally {
      await page.mouse.up();
    }
  });
});
