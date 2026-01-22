/**
 * Cowork Availability Tests
 */

import { describe, expect, it } from "vitest";
import { checkCoworkAvailability } from "../cowork/availability";

describe("checkCoworkAvailability", () => {
  it("allows macOS by default", () => {
    const result = checkCoworkAvailability({ platform: "darwin" });
    expect(result.available).toBe(true);
  });

  it("blocks non-allowed platforms", () => {
    const result = checkCoworkAvailability({ platform: "win32" });
    expect(result.available).toBe(false);
    expect(result.reason).toContain("win32");
  });
});
