/**
 * JSON-RPC transport for LSP over stdio.
 */

import type { ChildProcess } from "node:child_process";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface Transport {
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  close(): Promise<void>;
}

const HEADER_DELIMITER = "\r\n\r\n";

/**
 * Create a stdio-based transport for LSP communication.
 */
export function createStdioTransport(process: ChildProcess): Transport {
  if (!process.stdout || !process.stdin) {
    throw new Error("LSP process missing stdio streams");
  }

  const handlers = new Set<(message: JsonRpcMessage) => void>();
  let buffer: Buffer = Buffer.alloc(0);

  const handleData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    parseMessages();
  };

  const parseMessages = () => {
    while (true) {
      const result = readNextPayload(buffer);
      buffer = result.remaining;
      if (result.needsMoreData) {
        return;
      }
      if (!result.payload) {
        continue;
      }
      dispatchPayload(result.payload, handlers);
    }
  };

  process.stdout.on("data", handleData);

  return {
    async send(message: JsonRpcMessage): Promise<void> {
      const stdin = process.stdin;
      if (!stdin || stdin.destroyed) {
        throw new Error("LSP stdin is not writable");
      }
      const payload = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}${HEADER_DELIMITER}`;
      const data = header + payload;
      await new Promise<void>((resolve, reject) => {
        stdin.write(data, "utf8", (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    onMessage(handler: (message: JsonRpcMessage) => void): void {
      handlers.add(handler);
    },
    async close(): Promise<void> {
      process.stdout?.off("data", handleData);
      if (process.stdin && !process.stdin.destroyed) {
        process.stdin.end();
      }
    },
  };
}

function readNextPayload(buffer: Buffer): {
  payload: string | null;
  remaining: Buffer;
  needsMoreData: boolean;
} {
  const headerEnd = buffer.indexOf(HEADER_DELIMITER);
  if (headerEnd === -1) {
    return { payload: null, remaining: buffer, needsMoreData: true };
  }

  const headerText = buffer.slice(0, headerEnd).toString("utf8");
  const contentLength = parseContentLength(headerText);
  const messageStart = headerEnd + HEADER_DELIMITER.length;
  if (contentLength === null) {
    return { payload: null, remaining: buffer.slice(messageStart), needsMoreData: false };
  }

  const messageEnd = messageStart + contentLength;
  if (buffer.length < messageEnd) {
    return { payload: null, remaining: buffer, needsMoreData: true };
  }

  const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
  return { payload, remaining: buffer.slice(messageEnd), needsMoreData: false };
}

function parseContentLength(headerText: string): number | null {
  const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) {
    return null;
  }
  return Number(lengthMatch[1]);
}

function dispatchPayload(payload: string, handlers: Set<(message: JsonRpcMessage) => void>): void {
  try {
    const message = JSON.parse(payload) as JsonRpcMessage;
    for (const handler of handlers) {
      handler(message);
    }
  } catch {
    // Ignore malformed payloads.
  }
}
