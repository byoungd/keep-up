import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../ApprovalCard";

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

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const match = buttons.find((button) => button.textContent?.includes(label));
  if (!match) {
    throw new Error(`Button with label "${label}" not found`);
  }
  return match;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ApprovalCard", () => {
  it("renders tool name and description", () => {
    const { container, root } = render(
      <ApprovalCard
        toolName="writeFile"
        toolDescription="Writes content to a file"
        parameters={{ path: "/test.txt", content: "hello" }}
        riskLevel="medium"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(container.textContent).toContain("writeFile");
    expect(container.textContent).toContain("Writes content to a file");

    act(() => {
      root.unmount();
    });
  });

  it("displays risk level badge", () => {
    const { container, root } = render(
      <ApprovalCard
        toolName="deleteFile"
        toolDescription="Deletes a file"
        parameters={{ path: "/tmp/test.txt" }}
        riskLevel="critical"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(container.textContent).toContain("CRITICAL");

    act(() => {
      root.unmount();
    });
  });

  it("calls onApprove and onReject", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const { container, root } = render(
      <ApprovalCard
        toolName="writeFile"
        toolDescription="Writes content to a file"
        parameters={{ path: "/test.txt", content: "hello" }}
        riskLevel="medium"
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    const approveButton = findButton(container, "Approve");
    const rejectButton = findButton(container, "Reject");

    act(() => {
      approveButton.click();
      rejectButton.click();
    });

    expect(onApprove).toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("allows focus on action buttons", () => {
    const { container, root } = render(
      <ApprovalCard
        toolName="writeFile"
        toolDescription="Writes content to a file"
        parameters={{ path: "/test.txt", content: "hello" }}
        riskLevel="low"
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const approveButton = findButton(container, "Approve");
    approveButton.focus();

    expect(document.activeElement).toBe(approveButton);

    act(() => {
      root.unmount();
    });
  });
});
