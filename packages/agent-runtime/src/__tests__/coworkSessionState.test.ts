/**
 * Cowork Session State Tests
 */

import { describe, expect, it } from "vitest";
import { createCoworkSessionState } from "../cowork/sessionState";

describe("createCoworkSessionState", () => {
  it("returns a session state with no-op memory", async () => {
    const session = createCoworkSessionState();

    const context = await session.memory.getContext();
    const memories = await session.memory.recall("anything");

    expect(context).toBe("");
    expect(memories).toEqual([]);
  });
});
