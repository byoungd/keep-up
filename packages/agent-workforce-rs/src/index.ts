import type { NativeAgentWorkforceBinding } from "./types";

export type { NativeAgentWorkforceBinding, WorkforceOrchestratorBinding } from "./types";

const browserError = new Error("Agent workforce native bindings are not available in browser.");

export function getNativeAgentWorkforce(): NativeAgentWorkforceBinding | null {
  return null;
}

export function getNativeAgentWorkforceError(): Error | null {
  return browserError;
}
