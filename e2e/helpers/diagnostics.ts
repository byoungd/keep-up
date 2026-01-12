import type { ConsoleMessage, Page, Request, TestInfo } from "@playwright/test";

type DiagnosticsOptions = {
  maxConsoleEntries?: number;
  crashPattern?: RegExp;
  maxWebSocketEntries?: number;
  maxSyncEvents?: number;
};

type ConsoleEntry = {
  timestamp: string;
  type: string;
  text: string;
  location?: string;
};

type PageErrorEntry = {
  timestamp: string;
  message: string;
  stack?: string;
};

type RequestFailureEntry = {
  timestamp: string;
  url: string;
  method: string;
  resourceType: string;
  errorText?: string;
};

type WebSocketEntry = {
  timestamp: string;
  url: string;
  direction: "sent" | "received" | "close";
  data?: string;
  closeCode?: number;
  closeReason?: string;
};

type SyncEntry = {
  timestamp: string;
  message: string;
};

export type PageDiagnostics = {
  runWithCrashFailFast: <T>(task: () => Promise<T>) => Promise<T>;
  logSyncEvent: (message: string) => void;
  attachOnFailure: () => Promise<void>;
  dispose: () => void;
};

const DEFAULT_MAX_CONSOLE_ENTRIES = 80;
const DEFAULT_CRASH_PATTERN = /RuntimeError: unreachable/i;
const DEFAULT_MAX_WS_ENTRIES = 200;
const DEFAULT_MAX_SYNC_EVENTS = 200;

export function createPageDiagnostics(
  page: Page,
  testInfo: TestInfo,
  options: DiagnosticsOptions = {}
): PageDiagnostics {
  const maxConsoleEntries = options.maxConsoleEntries ?? DEFAULT_MAX_CONSOLE_ENTRIES;
  const crashPattern = options.crashPattern ?? DEFAULT_CRASH_PATTERN;
  const maxWebSocketEntries = options.maxWebSocketEntries ?? DEFAULT_MAX_WS_ENTRIES;
  const maxSyncEvents = options.maxSyncEvents ?? DEFAULT_MAX_SYNC_EVENTS;
  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  const requestFailures: RequestFailureEntry[] = [];
  const webSocketEntries: WebSocketEntry[] = [];
  const syncEntries: SyncEntry[] = [];
  let crashError: Error | null = null;
  let rejectCrash: ((error: Error) => void) | null = null;
  let attachmentsDone = false;

  const crashPromise = new Promise<never>((_, reject) => {
    rejectCrash = reject;
  });

  const recordConsole = (msg: ConsoleMessage) => {
    const location = msg.location();
    const locationLabel = location.url
      ? `${location.url}:${location.lineNumber}:${location.columnNumber}`
      : undefined;
    consoleEntries.push({
      timestamp: new Date().toISOString(),
      type: msg.type(),
      text: msg.text(),
      location: locationLabel,
    });
    trimToLimit(consoleEntries, maxConsoleEntries);

    if (crashPattern.test(msg.text())) {
      recordCrash("console", msg.text());
    }
  };

  const recordPageError = (error: Error) => {
    pageErrors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
    });

    if (crashPattern.test(error.message)) {
      recordCrash("pageerror", error.message);
    }
  };

  const recordRequestFailure = (request: Request) => {
    const failure = request.failure();
    requestFailures.push({
      timestamp: new Date().toISOString(),
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: failure?.errorText,
    });
  };

  const recordWebSocket = (entry: WebSocketEntry) => {
    webSocketEntries.push(entry);
    trimToLimit(webSocketEntries, maxWebSocketEntries);
  };

  const recordSyncEvent = (message: string) => {
    syncEntries.push({ timestamp: new Date().toISOString(), message });
    trimToLimit(syncEntries, maxSyncEvents);
  };

  const recordCrash = (source: string, message: string) => {
    if (crashError) {
      return;
    }
    crashError = new Error(`WASM crash signal from ${source}: ${message}`);
    rejectCrash?.(crashError);
  };

  page.on("console", recordConsole);
  page.on("pageerror", recordPageError);
  page.on("requestfailed", recordRequestFailure);
  const onWebSocket = (ws: WebSocket) => {
    const url = ws.url();
    ws.on("framesent", (event) => {
      recordWebSocket({
        timestamp: new Date().toISOString(),
        url,
        direction: "sent",
        data: formatWsPayload(event),
      });
    });
    ws.on("framereceived", (event) => {
      recordWebSocket({
        timestamp: new Date().toISOString(),
        url,
        direction: "received",
        data: formatWsPayload(event),
      });
    });
    ws.on("close", (event) => {
      const rawCode =
        typeof (event as { code?: number }).code === "number"
          ? (event as { code?: number }).code
          : typeof (event as { code?: () => number }).code === "function"
            ? (event as { code?: () => number }).code?.()
            : undefined;
      const rawReason =
        typeof (event as { reason?: string }).reason === "string"
          ? (event as { reason?: string }).reason
          : typeof (event as { reason?: () => string }).reason === "function"
            ? (event as { reason?: () => string }).reason?.()
            : undefined;
      recordWebSocket({
        timestamp: new Date().toISOString(),
        url,
        direction: "close",
        closeCode: rawCode,
        closeReason: rawReason,
      });
    });
  };
  page.on("websocket", onWebSocket);

  const attachOnFailure = async () => {
    if (attachmentsDone) {
      return;
    }
    if (testInfo.status === testInfo.expectedStatus) {
      return;
    }
    await attachDiagnostics();
  };

  const attachDiagnostics = async () => {
    if (attachmentsDone) {
      return;
    }
    attachmentsDone = true;
    await attachText(testInfo, "console.log", formatConsole(consoleEntries));
    await attachText(testInfo, "pageerrors.log", formatPageErrors(pageErrors));
    await attachText(testInfo, "requestfailures.log", formatRequestFailures(requestFailures));
    await attachText(testInfo, "ws-events.log", formatWsEntries(webSocketEntries));
    await attachText(testInfo, "sync-events.log", formatSyncEntries(syncEntries));
    if (crashError) {
      await attachText(testInfo, "crash-signal.log", crashError.message);
    }
  };

  const runWithCrashFailFast = async <T>(task: () => Promise<T>): Promise<T> => {
    let finished = false;
    const taskPromise = task().finally(() => {
      finished = true;
    });
    const crashWatcher = crashPromise.catch((error) => {
      if (finished) {
        return new Promise<never>(() => {
          /* ignore crash after task finished */
        });
      }
      throw error;
    });
    return await Promise.race([taskPromise, crashWatcher]);
  };

  const dispose = () => {
    page.off("console", recordConsole);
    page.off("pageerror", recordPageError);
    page.off("requestfailed", recordRequestFailure);
    page.off("websocket", onWebSocket);
  };

  return {
    runWithCrashFailFast,
    logSyncEvent: recordSyncEvent,
    attachOnFailure,
    dispose,
  };
}

function trimToLimit<T>(entries: T[], max: number): void {
  while (entries.length > max) {
    entries.shift();
  }
}

function formatConsole(entries: ConsoleEntry[]): string {
  if (entries.length === 0) {
    return "<no-console-entries>";
  }
  const lines: string[] = [];
  for (const entry of entries) {
    const location = entry.location ? ` (${entry.location})` : "";
    lines.push(`${entry.timestamp} [${entry.type}] ${entry.text}${location}`);
  }
  return lines.join("\n");
}

function formatPageErrors(entries: PageErrorEntry[]): string {
  if (entries.length === 0) {
    return "<no-page-errors>";
  }
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`${entry.timestamp} ${entry.message}`);
    if (entry.stack) {
      lines.push(entry.stack);
    }
  }
  return lines.join("\n");
}

function formatRequestFailures(entries: RequestFailureEntry[]): string {
  if (entries.length === 0) {
    return "<no-request-failures>";
  }
  const lines: string[] = [];
  for (const entry of entries) {
    const errorText = entry.errorText ? ` (${entry.errorText})` : "";
    lines.push(
      `${entry.timestamp} ${entry.method} ${entry.url} [${entry.resourceType}]${errorText}`
    );
  }
  return lines.join("\n");
}

function formatWsEntries(entries: WebSocketEntry[]): string {
  if (entries.length === 0) {
    return "<no-websocket-events>";
  }
  return entries
    .map((entry) => {
      if (entry.direction === "close") {
        return `${entry.timestamp} [${entry.direction}] ${entry.url} code=${entry.closeCode ?? ""} reason="${entry.closeReason ?? ""}"`;
      }
      return `${entry.timestamp} [${entry.direction}] ${entry.url} data=${entry.data ?? "<empty>"}`;
    })
    .join("\n");
}

function formatSyncEntries(entries: SyncEntry[]): string {
  if (entries.length === 0) {
    return "<no-sync-events>";
  }
  return entries.map((entry) => `${entry.timestamp} ${entry.message}`).join("\n");
}

function formatWsPayload(data: unknown): string {
  if (typeof data === "string") {
    return data.length > 500 ? `${data.slice(0, 500)}…` : data;
  }
  if (data instanceof ArrayBuffer) {
    return `<binary ${data.byteLength} bytes>`;
  }
  if (ArrayBuffer.isView(data)) {
    return `<binary ${data.byteLength} bytes>`;
  }
  return `<${typeof data}>`;
}

/**
 * Install a WebSocket tap inside the page to capture send/recv/close events.
 * Useful for collab sync debugging when Playwright’s websocket event misses worker-level sockets.
 */
export async function installWebSocketTap(page: Page, maxEntries = 400): Promise<void> {
  await page.addInitScript(
    ({ maxEntries: max }) => {
      const OriginalWS = window.WebSocket;
      const logs: Array<{ ts: number; direction: string; url: string; data?: string }> = [];
      const push = (direction: string, url: string, data?: string) => {
        logs.push({ ts: Date.now(), direction, url, data });
        while (logs.length > max) {
          logs.shift();
        }
      };
      class TappedWS extends OriginalWS {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          this.addEventListener("message", (ev) => {
            const data =
              typeof ev.data === "string" ? ev.data.slice(0, 500) : `<${typeof ev.data}>`;
            push("recv", this.url, data);
          });
          this.addEventListener("close", (ev) => {
            push("close", this.url, `code=${(ev as { code?: number }).code ?? ""}`);
          });
          this.addEventListener("error", () => {
            push("error", this.url, "error");
          });
        }
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
          const label =
            typeof data === "string"
              ? data.slice(0, 500)
              : data instanceof ArrayBuffer || ArrayBuffer.isView(data)
                ? `<binary ${data.byteLength} bytes>`
                : `<${typeof data}>`;
          push("send", this.url, label);
          super.send(data);
        }
      }
      (window as unknown as { __wsTap?: typeof logs }).__wsTap = logs;
      window.WebSocket = TappedWS as unknown as typeof WebSocket;
    },
    { maxEntries }
  );
}

export async function readWebSocketTap(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const logs = (
      window as unknown as {
        __wsTap?: Array<{ ts: number; direction: string; url: string; data?: string }>;
      }
    ).__wsTap;
    if (!logs || logs.length === 0) {
      return "<no-ws-tap>";
    }
    return logs
      .map((entry) => {
        return `${new Date(entry.ts).toISOString()} [${entry.direction}] ${entry.url} ${entry.data ?? ""}`;
      })
      .join("\n");
  });
}

async function attachText(testInfo: TestInfo, name: string, body: string): Promise<void> {
  await testInfo.attach(name, {
    body,
    contentType: "text/plain",
  });
}
