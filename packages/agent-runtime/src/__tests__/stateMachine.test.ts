/**
 * @file stateMachine.test.ts
 * @description Tests for the AgentStateMachine
 */

import { describe, expect, it, vi } from "vitest";
import {
  AgentStateMachine,
  createAgentStateMachine,
  InvalidTransitionError,
} from "../orchestrator/stateMachine";

describe("AgentStateMachine", () => {
  describe("initial state", () => {
    it("starts in idle status by default", () => {
      const sm = createAgentStateMachine();
      expect(sm.getStatus()).toBe("idle");
    });

    it("can start with a custom initial status", () => {
      const sm = new AgentStateMachine({ initialStatus: "thinking" });
      expect(sm.getStatus()).toBe("thinking");
    });
  });

  describe("valid transitions", () => {
    it("transitions from idle to thinking on start", () => {
      const sm = createAgentStateMachine();
      const status = sm.transition("start");
      expect(status).toBe("thinking");
    });

    it("transitions from thinking to executing on execute", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      const status = sm.transition("execute");
      expect(status).toBe("executing");
    });

    it("transitions from executing to waiting_confirmation on request_confirmation", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      const status = sm.transition("request_confirmation");
      expect(status).toBe("waiting_confirmation");
    });

    it("transitions from waiting_confirmation to executing on confirm", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      sm.transition("request_confirmation");
      const status = sm.transition("confirm");
      expect(status).toBe("executing");
    });

    it("transitions from waiting_confirmation to complete on deny", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      sm.transition("request_confirmation");
      const status = sm.transition("deny");
      expect(status).toBe("complete");
    });

    it("transitions from thinking to complete on complete", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      const status = sm.transition("complete");
      expect(status).toBe("complete");
    });

    it("transitions from thinking to error on fail", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      const status = sm.transition("fail");
      expect(status).toBe("error");
    });

    it("transitions from executing back to thinking on think", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      const status = sm.transition("think");
      expect(status).toBe("thinking");
    });
  });

  describe("invalid transitions", () => {
    it("throws InvalidTransitionError on invalid transition from idle", () => {
      const sm = createAgentStateMachine();
      expect(() => sm.transition("complete")).toThrow(InvalidTransitionError);
    });

    it("throws InvalidTransitionError on invalid transition from complete", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("complete");
      expect(() => sm.transition("start")).toThrow(InvalidTransitionError);
    });

    it("includes status and event in error", () => {
      const sm = createAgentStateMachine();
      try {
        sm.transition("complete");
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        const error = err as InvalidTransitionError;
        expect(error.status).toBe("idle");
        expect(error.event).toBe("complete");
      }
    });
  });

  describe("reset", () => {
    it("resets to idle from any state", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      sm.reset();
      expect(sm.getStatus()).toBe("idle");
    });

    it("does nothing when already idle", () => {
      const sm = createAgentStateMachine();
      sm.reset();
      expect(sm.getStatus()).toBe("idle");
      expect(sm.getHistory()).toHaveLength(0);
    });
  });

  describe("canTransition", () => {
    it("returns true for valid events", () => {
      const sm = createAgentStateMachine();
      expect(sm.canTransition("start")).toBe(true);
    });

    it("returns false for invalid events", () => {
      const sm = createAgentStateMachine();
      expect(sm.canTransition("complete")).toBe(false);
    });
  });

  describe("history", () => {
    it("records transitions with timestamps", () => {
      const sm = new AgentStateMachine();
      const before = Date.now();
      sm.transition("start");
      sm.transition("execute");
      const after = Date.now();

      const history = sm.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ from: "idle", to: "thinking", event: "start" });
      expect(history[1]).toMatchObject({ from: "thinking", to: "executing", event: "execute" });
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[1].timestamp).toBeLessThanOrEqual(after);
    });

    it("respects maxHistorySize", () => {
      const sm = new AgentStateMachine({ maxHistorySize: 2 });
      sm.transition("start");
      sm.transition("execute");
      sm.transition("think");
      sm.transition("complete");

      const history = sm.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].event).toBe("think");
      expect(history[1].event).toBe("complete");
    });
  });

  describe("transition handlers", () => {
    it("calls handler on transition", () => {
      const sm = new AgentStateMachine();
      const handler = vi.fn();

      sm.onTransition(handler);
      sm.transition("start");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ from: "idle", to: "thinking", event: "start" })
      );
    });

    it("allows unsubscribing", () => {
      const sm = new AgentStateMachine();
      const handler = vi.fn();

      const unsubscribe = sm.onTransition(handler);
      sm.transition("start");
      unsubscribe();
      sm.transition("execute");

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("continues on handler error", () => {
      const sm = new AgentStateMachine();
      const errorHandler = vi.fn(() => {
        throw new Error("Handler failed");
      });
      const goodHandler = vi.fn();

      sm.onTransition(errorHandler);
      sm.onTransition(goodHandler);
      sm.transition("start");

      expect(errorHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
      expect(sm.getStatus()).toBe("thinking");
    });
  });
});
