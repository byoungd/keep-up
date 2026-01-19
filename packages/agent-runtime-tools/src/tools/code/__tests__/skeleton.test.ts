import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getOutline } from "../skeleton";

const fixturePath = fileURLToPath(new URL("./fixtures/sample.ts", import.meta.url));

describe("getOutline", () => {
  it("extracts top-level symbols and class methods", async () => {
    const outline = await getOutline(fixturePath);

    expect(outline.totalLines).toBeGreaterThan(0);
    expect(outline.path).toBe(fixturePath);

    const classItem = outline.items.find((item) => item.kind === "class");
    expect(classItem?.name).toBe("SampleClass");
    expect(classItem?.children?.some((child) => child.name === "methodA")).toBe(true);
    expect(classItem?.children?.some((child) => child.name === "methodB")).toBe(true);

    const functionItem = outline.items.find((item) => item.kind === "function");
    expect(functionItem?.name).toBe("helperFunction");

    const interfaceItem = outline.items.find((item) => item.kind === "interface");
    expect(interfaceItem?.name).toBe("SampleInterface");
  });
});
