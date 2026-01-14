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
});
