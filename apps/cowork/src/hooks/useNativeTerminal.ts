import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { isTauriRuntime } from "../lib/tauriRuntime";

export type TerminalInputDisposable = {
  dispose: () => void;
};

export type TerminalAdapter = {
  write: (data: string | Uint8Array) => void;
  writeln?: (data: string) => void;
  onData: (listener: (data: string) => void) => TerminalInputDisposable;
};

export type NativeTerminalOptions = {
  terminalRef: RefObject<TerminalAdapter | null>;
  command: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  onExit?: () => void;
  enabled?: boolean;
};

type TerminalEventPayload = number[] | Uint8Array | ArrayBuffer;

type SpawnTerminalPayload = {
  id: string;
  cmd: string;
  args: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
};

function toUint8Array(payload: TerminalEventPayload): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  return new Uint8Array(payload);
}

export function useNativeTerminal(options: NativeTerminalOptions) {
  const { terminalRef, enabled = true, command, args, cwd, cols, rows, onExit } = options;
  const sessionIdRef = useRef<string | null>(null);
  const onExitRef = useRef(onExit);
  const isAvailable = useMemo(() => isTauriRuntime(), []);
  const terminal = terminalRef.current;

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    if (!enabled || !isAvailable || !terminal) {
      return undefined;
    }

    const id = crypto.randomUUID();
    sessionIdRef.current = id;
    const encoder = new TextEncoder();

    const dataListenerPromise = listen<TerminalEventPayload>(`term-data-${id}`, (event) => {
      terminal.write(toUint8Array(event.payload));
    });

    const exitListenerPromise = listen(`term-exit-${id}`, () => {
      terminal.writeln?.("\r\n[Process exited]");
      onExitRef.current?.();
    });

    const inputDisposable = terminal.onData((data) => {
      const bytes = encoder.encode(data);
      void invoke("write_terminal", { id, data: Array.from(bytes) });
    });

    const payload: SpawnTerminalPayload = {
      id,
      cmd: command,
      args: args ?? [],
      cwd: cwd || undefined,
      cols: typeof cols === "number" ? cols : undefined,
      rows: typeof rows === "number" ? rows : undefined,
    };

    void invoke("spawn_terminal", payload);

    return () => {
      inputDisposable.dispose();
      void invoke("kill_terminal", { id });
      void dataListenerPromise.then((unlisten) => unlisten());
      void exitListenerPromise.then((unlisten) => unlisten());
    };
  }, [enabled, isAvailable, terminal, command, args, cwd, cols, rows]);

  return sessionIdRef;
}
