import { describe, expect, it } from "vitest";
import { ClarificationManager } from "../clarificationManager";

describe("ClarificationManager", () => {
  it("queues clarifications and resolves responses", async () => {
    const manager = new ClarificationManager({ defaultTimeoutMs: 1000 });
    const events: string[] = [];

    manager.onEvent((event) => events.push(event.type));

    const request = {
      id: "clarify-1",
      question: "Which option should we use?",
      options: ["alpha", "beta"],
      continueWorkWhileWaiting: true,
      context: { sessionId: "session-1" },
    };

    const responsePromise = manager.ask(request);
    expect(manager.getPending()).toHaveLength(1);

    const response = manager.submitAnswer({
      requestId: request.id,
      answer: "alpha",
      selectedOption: 0,
    });

    const awaited = await responsePromise;
    expect(awaited).toMatchObject({ requestId: request.id, answer: "alpha", selectedOption: 0 });
    expect(response).toMatchObject({ requestId: request.id, answer: "alpha", selectedOption: 0 });

    const resolved = manager.consumeResolved();
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.request.id).toBe(request.id);
    expect(resolved[0]?.response.answer).toBe("alpha");
    expect(manager.consumeResolved()).toHaveLength(0);

    expect(events).toEqual(["requested", "answered"]);
  });

  it("filters pending questions by session", async () => {
    const manager = new ClarificationManager({ defaultTimeoutMs: 1000 });

    const first = manager.ask({
      id: "clarify-2",
      question: "First?",
      context: { sessionId: "session-a" },
    });
    const second = manager.ask({
      id: "clarify-3",
      question: "Second?",
      context: { sessionId: "session-b" },
    });

    expect(manager.getPending("session-a").map((req) => req.id)).toEqual(["clarify-2"]);
    expect(manager.getPending("session-b").map((req) => req.id)).toEqual(["clarify-3"]);

    manager.submitAnswer({ requestId: "clarify-2", answer: "Done" });
    manager.submitAnswer({ requestId: "clarify-3", answer: "Done" });

    await Promise.all([first, second]);
  });
});
