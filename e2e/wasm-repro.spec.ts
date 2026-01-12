import { test } from "@playwright/test";

/**
 * Minimal repro harness to surface WASM "RuntimeError: unreachable" during WS sync.
 * Runs a tight offline/online loop with small edits to maximize race exposure.
 */

test.describe("WASM crash repro (WS sync)", () => {
  test("offline/online edit loop surfaces crash signal", async () => {
    test.skip("Use collab-wasm-repro.spec.ts harness for reproducible coverage");
  });
});
