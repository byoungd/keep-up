import { expect, test } from "@playwright/test";
import { setEditorContent, waitForEditorReady } from "./helpers/editor";

const RUN_PERF = process.env.LFCC_PERF_PROFILE === "1";
const PERF_BUDGET_MS = Number(process.env.LFCC_PERF_BUDGET_MS ?? 16);
const MEMORY_BUDGET_BYTES = Number(process.env.LFCC_PERF_MEMORY_BUDGET_BYTES ?? 8 * 1024 * 1024);
const WORKER_INDEX = process.env.PLAYWRIGHT_WORKER_INDEX ?? Math.random().toString(36).slice(2, 5);

type PerfSummary = {
  avg: number;
  p50: number;
  p95: number;
  samples: number;
};

function buildLargeDocument(targetBytes = 50_000): string {
  const base =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
  const lines: string[] = [];
  let total = 0;

  for (let i = 0; total < targetBytes && i < 500; i += 1) {
    const line = `${i + 1}. ${base}`;
    lines.push(line);
    total += line.length + 1;
  }

  return lines.join("\n");
}

async function readHeapBytes(page: import("@playwright/test").Page): Promise<number | null> {
  return page.evaluate(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return perf.memory?.usedJSHeapSize ?? null;
  });
}

test.describe("LFCC Bridge Perf Profiling", () => {
  test.skip(!RUN_PERF, "Set LFCC_PERF_PROFILE=1 to run perf profiling");

  test("input latency stays within budget on large documents", async ({ page }) => {
    test.setTimeout(120_000);

    const docId = `perf-${Date.now()}`;
    const dbName = `reader-db-worker-${WORKER_INDEX}-perf`;
    await page.goto(`/editor?doc=${docId}&db=${dbName}&seed=0`);
    await waitForEditorReady(page);

    const largeDoc = buildLargeDocument();
    await setEditorContent(page, largeDoc);

    const heapBefore = await readHeapBytes(page);

    const summary = await page.evaluate(async (iterations: number): Promise<PerfSummary> => {
      const view = (window as unknown as { __lfccView?: import("prosemirror-view").EditorView })
        .__lfccView;
      if (!view) {
        throw new Error("LFCC view not available");
      }

      const latencies: number[] = [];

      const endPos = view.state.doc.content.size;
      const SelectionCtor =
        (
          window as unknown as {
            pmTextSelection?: {
              create?: (doc: import("prosemirror-model").Node, from: number, to: number) => unknown;
            };
          }
        ).pmTextSelection ??
        (view.state.selection?.constructor as {
          create?: (doc: import("prosemirror-model").Node, from: number, to: number) => unknown;
        });
      if (SelectionCtor?.create) {
        const selection = SelectionCtor.create(view.state.doc, endPos, endPos);
        view.dispatch(view.state.tr.setSelection(selection));
      }

      for (let i = 0; i < iterations; i += 1) {
        const start = performance.now();
        const tr = view.state.tr.insertText("x");
        view.dispatch(tr);
        latencies.push(performance.now() - start);
      }

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const sorted = [...latencies].sort((a, b) => a - b);
      const pick = (p: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const sum = sorted.reduce((acc, value) => acc + value, 0);

      return {
        avg: sum / sorted.length,
        p50: pick(0.5),
        p95: pick(0.95),
        samples: sorted.length,
      };
    }, 50);

    const heapAfter = await readHeapBytes(page);

    console.info("[LFCC Perf]", summary);
    if (heapBefore !== null && heapAfter !== null) {
      const delta = heapAfter - heapBefore;
      console.info("[LFCC Perf] heap delta bytes:", delta);
      expect(delta).toBeLessThan(MEMORY_BUDGET_BYTES);
    } else {
      test.info().annotations.push({
        type: "note",
        description: "JS heap metrics unavailable; skipped memory delta check.",
      });
    }

    expect(summary.p95).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });
});
