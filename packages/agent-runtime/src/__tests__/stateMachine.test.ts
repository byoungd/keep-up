/**
 * @file stateMachine.test.ts
 * @description Tests for the AgentStateMachine
 */

import { describe, expect, it } from "vitest";
import { AgentStateMachine, createAgentStateMachine } from "../orchestrator/stateMachine";

describe("AgentStateMachine", () => {
  describe("initial state", () => {
    it("starts in idle status", () => {
      const sm = createAgentStateMachine();
      expect(sm.getStatus()).toBe("idle");
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
  });

  describe("invalid transitions", () => {
    it("throws on invalid transition from idle", () => {
      const sm = createAgentStateMachine();
      expect(() => sm.transition("complete")).toThrow();
    });

    it("throws on invalid transition from complete", () => {
      const sm = createAgentStateMachine();
      sm.transition("start");
      sm.transition("complete");
      expect(() => sm.transition("start")).toThrow();
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
    it("records transitions", () => {
      const sm = new AgentStateMachine();
      sm.transition("start");
      sm.transition("execute");
      const history = sm.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ from: "idle", to: "thinking", event: "start" });
      expect(history[1]).toEqual({ from: "thinking", to: "executing", event: "execute" });
    });
  });
});
