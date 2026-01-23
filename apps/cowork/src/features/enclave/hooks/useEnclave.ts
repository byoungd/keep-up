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

export type FileEntry = {
  path: string;
  name: string;
  is_dir: boolean;
  size?: number;
  modified_ms?: number;
};

export type ShellEnvVar = {
  key: string;
  value: string;
};

export type ShellExecArgs = {
  cmd: string;
  args: string[];
  cwd?: string;
  timeout_ms?: number;
  stdin?: string;
  max_output_bytes?: number;
  env?: ShellEnvVar[];
};

export type ShellExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
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
  const exportAuditLog = useCallback(() => invokeEnclave<string>("export_audit_log"), []);
  const fsRead = useCallback((path: string) => invokeEnclave<number[]>("fs_read", { path }), []);
  const fsWrite = useCallback(
    (path: string, contents: number[] | Uint8Array) =>
      invokeEnclave<void>("fs_write", { path, contents: Array.from(contents) }),
    []
  );
  const fsList = useCallback((path: string) => invokeEnclave<FileEntry[]>("fs_list", { path }), []);
  const shellExec = useCallback(
    (args: ShellExecArgs) => invokeEnclave<ShellExecResult>("shell_exec", { args }),
    []
  );

  return {
    isAvailable,
    getPolicy,
    setPolicy,
    getAuditLog,
    exportAuditLog,
    fsRead,
    fsWrite,
    fsList,
    shellExec,
  };
}
