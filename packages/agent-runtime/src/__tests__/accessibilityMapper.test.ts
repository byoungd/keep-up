import {
  buildAccessibilitySnapshot,
  parseAccessibilitySnapshotText,
  type RawAccessibilityNode,
} from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";

describe("buildAccessibilitySnapshot", () => {
  it("assigns refs and tracks occurrences by role/name", () => {
    const tree: RawAccessibilityNode = {
      role: "document",
      name: "root",
      children: [
        { role: "button", name: "Save" },
        { role: "button", name: "Save" },
        { role: "link", name: "Docs" },
      ],
    };

    const snapshot = buildAccessibilitySnapshot(tree);
    expect(snapshot.tree?.ref).toBe("@1");
    expect(snapshot.tree?.children?.map((child) => child.ref)).toEqual(["@2", "@3", "@4"]);

    expect(snapshot.map["@2"]).toMatchObject({ role: "button", name: "Save", occurrence: 0 });
    expect(snapshot.map["@3"]).toMatchObject({ role: "button", name: "Save", occurrence: 1 });
    expect(snapshot.map["@4"]).toMatchObject({ role: "link", name: "Docs", occurrence: 0 });
    expect(snapshot.map["@2"].path).toEqual([0]);
    expect(snapshot.map["@3"].path).toEqual([1]);
    expect(snapshot.map["@4"].path).toEqual([2]);
  });

  it("parses Playwright AI snapshot text into a tree", () => {
    const raw = parseAccessibilitySnapshotText(
      "- generic [active] [ref=e1]:\n" +
        "  - text: Name\n" +
        '  - textbox "Name" [ref=e2]\n' +
        '  - button "Submit" [ref=e3]'
    );

    expect(raw?.role).toBe("generic");
    expect(raw?.children?.[0]).toMatchObject({ role: "text", name: "Name" });
    expect(raw?.children?.[1]).toMatchObject({ role: "textbox", name: "Name" });
    expect(raw?.children?.[2]).toMatchObject({ role: "button", name: "Submit" });
  });
});
