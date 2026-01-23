import { useCallback } from "react";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriCore = {
  invoke: TauriInvoke;
};

type TauriGlobal = {
  core: TauriCore;
};

function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tauriGlobal = (window as { __TAURI__?: unknown }).__TAURI__;
  if (!tauriGlobal || typeof tauriGlobal !== "object") {
    return null;
  }

  const core = (tauriGlobal as Partial<TauriGlobal>).core;
  if (!core || typeof core !== "object") {
    return null;
  }

  const invoke = (core as { invoke?: unknown }).invoke;
  if (typeof invoke !== "function") {
    return null;
  }

  return invoke as TauriInvoke;
}

async function invokeEnclave<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error("Tauri runtime unavailable");
  }

  return invoke<T>(command, args);
}

export type EnclavePolicy = {
  allowed_roots: string[];
  allowed_commands: string[];
  allowed_hosts: string[];
  session_id: string;
};

export type Decision = "Allowed" | "NeedsConfirmation" | { Denied: { reason: string } };

export type AuditEntry = {
  timestamp: number;
  action: string;
  target: string;
  decision: Decision;
  session_id: string;
};

export function useEnclave() {
  const isAvailable = getTauriInvoke() !== null;

  const getPolicy = useCallback(() => invokeEnclave<EnclavePolicy>("get_policy"), []);
  const setPolicy = useCallback(
    (policy: EnclavePolicy) => invokeEnclave<void>("set_policy", { policy }),
    []
  );
  const getAuditLog = useCallback(
    (limit?: number) =>
      invokeEnclave<AuditEntry[]>(
        "get_audit_log",
        typeof limit === "number" ? { limit } : undefined
      ),
    []
  );

  return { isAvailable, getPolicy, setPolicy, getAuditLog };
}
