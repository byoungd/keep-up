/**
 * File tool path validation tests
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PathValidator } from "../tools/core/file";

describe("PathValidator", () => {
  it("allows paths within the allowed root", () => {
    const root = path.resolve("sandbox/root");
    const validator = new PathValidator({ allowedPaths: [root] });

    const result = validator.validate(path.join(root, "child", "file.txt"));

    expect(result.valid).toBe(true);
  });

  it("rejects paths that only share a prefix with the allowed root", () => {
    const root = path.resolve("sandbox/root");
    const validator = new PathValidator({ allowedPaths: [root] });

    const result = validator.validate(`${root}-suffix`);

    expect(result.valid).toBe(false);
  });

  it("rejects paths that escape the allowed root", () => {
    const root = path.resolve("sandbox/root");
    const validator = new PathValidator({ allowedPaths: [root] });

    const result = validator.validate(path.join(root, "..", "sibling", "file.txt"));

    expect(result.valid).toBe(false);
  });
});
