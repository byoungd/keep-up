/**
 * Orchestrator Status Controller
 *
 * Bridges AgentState status updates with the AgentStateMachine.
 * Provides a migration path toward full state-machine driven orchestration.
 */

import type { AgentState } from "../types";
import { type AgentStateEvent, AgentStateMachine, type AgentStatus } from "./stateMachine";

export class OrchestratorStatusController {
  private machine: AgentStateMachine;

  constructor(initialStatus: AgentStatus = "idle") {
    this.machine = new AgentStateMachine({ initialStatus });
  }

  setStatus(state: AgentState, target: AgentStatus): AgentStatus {
    if (state.status === target) {
      return target;
    }

    const event = this.resolveEvent(state.status, target);
    if (event && this.machine.canTransition(event)) {
      const next = this.machine.transition(event);
      state.status = next;
      return next;
    }

    // Fallback: force sync if transition map is incomplete.
    state.status = target;
    this.machine = new AgentStateMachine({ initialStatus: target });
    return target;
  }

  getHistory(): readonly {
    from: AgentStatus;
    to: AgentStatus;
    event: AgentStateEvent;
    timestamp: number;
  }[] {
    return this.machine.getHistory();
  }

  private resolveEvent(current: AgentStatus, target: AgentStatus): AgentStateEvent | null {
    if (target === "thinking") {
      return current === "idle" ? "start" : "think";
    }
    if (target === "executing") {
      return current === "waiting_confirmation" ? "confirm" : "execute";
    }
    if (target === "waiting_confirmation") {
      return "request_confirmation";
    }
    if (target === "complete") {
      return "complete";
    }
    if (target === "error") {
      return "fail";
    }
    return null;
  }
}
