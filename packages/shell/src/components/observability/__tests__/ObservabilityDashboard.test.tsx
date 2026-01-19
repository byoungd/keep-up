import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createStaticMetricsClient } from "../metrics";
import { ObservabilityDashboard } from "../ObservabilityDashboard";

type RenderResult = {
  container: HTMLDivElement;
  root: Root;
};

function render(ui: React.ReactElement): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ObservabilityDashboard", () => {
  it("renders summary metrics and runs", () => {
    const client = createStaticMetricsClient({
      summary: {
        activeRuns: 2,
        totalToolCalls: 12,
        avgLatencyMs: 450,
        errorRate: 0.02,
        tokenUsage: { input: 1200, output: 800, cached: 300 },
      },
      recentRuns: [
        {
          id: "run-1",
          title: "Summarize documents",
          status: "running",
          model: "claude-3.5",
          startedAt: Date.now(),
          durationMs: 1200,
          toolCalls: 3,
        },
      ],
    });

    const { container, root } = render(<ObservabilityDashboard client={client} />);

    expect(container.textContent).toContain("Active Runs");
    expect(container.textContent).toContain("Summarize documents");

    act(() => {
      root.unmount();
    });
  });
});
