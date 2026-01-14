// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { normalizeTaskListHtml } from "../pastePipelinePlugin";

describe("normalizeTaskListHtml", () => {
  it("annotates checkbox task list items and strips inputs", () => {
    const html = `
      <ul class="contains-task-list">
        <li class="task-list-item"><input type="checkbox" checked />Task one</li>
        <li class="task-list-item"><input type="checkbox" />Task two</li>
      </ul>
    `;

    const normalized = normalizeTaskListHtml(html);
    expect(normalized).not.toContain("<input");

    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const items = Array.from(doc.querySelectorAll("li"));

    expect(items[0]?.getAttribute("data-list-type")).toBe("task");
    expect(items[0]?.getAttribute("data-task-checked")).toBe("true");
    expect(items[1]?.getAttribute("data-list-type")).toBe("task");
    expect(items[1]?.getAttribute("data-task-checked")).toBe("false");
  });

  it("preserves task intent when attributes already exist", () => {
    const html = `<ul><li data-task-checked="true">Already task</li></ul>`;

    const normalized = normalizeTaskListHtml(html);
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const item = doc.querySelector("li");

    expect(item?.getAttribute("data-list-type")).toBe("task");
    expect(item?.getAttribute("data-task-checked")).toBe("true");
  });

  it("normalizes aria checkbox tasks and removes marker element", () => {
    const html = `
      <ul>
        <li><span role="checkbox" aria-checked="true"></span>Done item</li>
      </ul>
    `;

    const normalized = normalizeTaskListHtml(html);
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const item = doc.querySelector("li");

    expect(doc.querySelector('[role="checkbox"]')).toBeNull();
    expect(item?.getAttribute("data-list-type")).toBe("task");
    expect(item?.getAttribute("data-task-checked")).toBe("true");
  });

  it("converts checkbox markers in text to task attrs", () => {
    const html = `
      <ul>
        <li>\u2610 Buy milk</li>
        <li>\u2611 Ship order</li>
      </ul>
    `;

    const normalized = normalizeTaskListHtml(html);
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const items = Array.from(doc.querySelectorAll("li"));

    expect(items[0]?.getAttribute("data-task-checked")).toBe("false");
    expect(items[0]?.textContent?.trim()).toBe("Buy milk");
    expect(items[1]?.getAttribute("data-task-checked")).toBe("true");
    expect(items[1]?.textContent?.trim()).toBe("Ship order");
  });

  it("does not mark parent list items when only nested tasks exist", () => {
    const html = `
      <ul>
        <li>Parent item
          <ul>
            <li><input type="checkbox" checked />Child task</li>
          </ul>
        </li>
      </ul>
    `;

    const normalized = normalizeTaskListHtml(html);
    const doc = new DOMParser().parseFromString(normalized, "text/html");
    const items = Array.from(doc.querySelectorAll("li"));

    expect(items[0]?.getAttribute("data-list-type")).toBeNull();
    expect(items[1]?.getAttribute("data-list-type")).toBe("task");
  });
});
