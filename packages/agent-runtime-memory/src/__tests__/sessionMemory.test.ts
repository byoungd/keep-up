import { describe, expect, it } from "vitest";
import { SessionMemory } from "../working/sessionMemory";

const options = { importance: 0.5, source: "agent" };

describe("SessionMemory", () => {
  it("evicts entries beyond working memory limit", async () => {
    const memory = new SessionMemory({ workingMemoryLimit: 2, evictionStrategy: "fifo" });

    await memory.remember("one", "episodic", options);
    await memory.remember("two", "episodic", options);
    await memory.remember("three", "episodic", options);

    expect(memory.list().length).toBe(2);
  });

  it("tracks linked sessions", () => {
    const memory = new SessionMemory({ workingMemoryLimit: 5 });
    memory.linkSessions("session-a", "session-b");
    memory.linkSessions("session-a", "session-c");

    const linked = memory.getLinkedSessions("session-a");
    expect(linked).toEqual(["session-b", "session-c"]);
  });
});
