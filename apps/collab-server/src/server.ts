/**
 * LFCC Collaboration Server
 *
 * WebSocket server for real-time document collaboration using Loro CRDTs.
 * Wraps the @ku0/core SyncServer with ws library.
 */

import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { parse } from "node:url";
// Import directly from sync/server since it's not re-exported from main to avoid ws in browser bundles
import { type PersistenceHooks, SyncServer, type WebSocketLike } from "@ku0/core/sync/server";
import { LoroDoc } from "loro-crdt";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 3030;
const HOST = process.env.HOST || "0.0.0.0";

// ============================================================================
// In-Memory Persistence (Demo)
// ============================================================================

interface DocState {
  doc: LoroDoc;
  snapshot: Uint8Array | null;
  frontierTag: string;
  updates: Map<string, Uint8Array>; // frontierTag -> update
}

const documents = new Map<string, DocState>();

function getOrCreateDoc(docId: string): DocState {
  let doc = documents.get(docId);
  if (!doc) {
    doc = {
      doc: new LoroDoc(),
      snapshot: null,
      frontierTag: "0",
      updates: new Map(),
    };
    documents.set(docId, doc);
  }
  return doc;
}

const persistence: PersistenceHooks = {
  async getUpdatesSince(
    docId: string,
    _frontierTag: string
  ): Promise<{ data: Uint8Array; frontierTag: string } | null> {
    const doc = documents.get(docId);
    if (!doc) {
      return null;
    }

    // For simplicity, we return the latest snapshot
    // In production, this should return incremental updates
    if (doc.snapshot) {
      return {
        data: doc.snapshot,
        frontierTag: doc.frontierTag,
      };
    }
    return null;
  },

  async getSnapshot(docId: string): Promise<{ data: Uint8Array; frontierTag: string } | null> {
    const doc = documents.get(docId);
    if (!doc || !doc.snapshot) {
      return null;
    }
    return {
      data: doc.snapshot,
      frontierTag: doc.frontierTag,
    };
  },

  async saveUpdate(docId: string, data: Uint8Array, frontierTag: string): Promise<void> {
    const doc = getOrCreateDoc(docId);
    try {
      doc.doc.import(data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[WS] Failed to apply update", {
        docId,
        frontierTag,
        message: err.message,
      });
      throw err;
    }
    doc.snapshot = doc.doc.export({ mode: "snapshot" });
    doc.frontierTag = frontierTag;
    doc.updates.set(frontierTag, data);
  },

  async getCurrentFrontierTag(docId: string): Promise<string> {
    const doc = documents.get(docId);
    return doc?.frontierTag ?? "0";
  },
};

// ============================================================================
// Polling Endpoints (Serverless-style)
// ============================================================================

type PollingPullRequest = {
  docId?: string;
  fromFrontierTag?: string;
  preferSnapshot?: boolean;
};

type PollingPushRequest = {
  docId?: string;
  updateData?: string;
  isBase64?: boolean;
  frontierTag?: string;
  parentFrontierTag?: string;
};

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, status: "healthy" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync/pull") {
    await handlePollingPull(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync/push") {
    await handlePollingPush(req, res);
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

async function handlePollingPull(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const payload = body as PollingPullRequest;
  if (!isString(payload.docId)) {
    sendJson(res, 400, { ok: false, error: "docId is required" });
    return;
  }

  const docId = payload.docId;
  const preferSnapshot = payload.preferSnapshot === true;
  const fromFrontierTag = isString(payload.fromFrontierTag) ? payload.fromFrontierTag : "0";
  const currentFrontierTag = await persistence.getCurrentFrontierTag(docId);

  let response: Record<string, unknown> = {
    ok: true,
    hasUpdates: false,
    frontierTag: currentFrontierTag,
    role: "editor",
  };

  if (preferSnapshot) {
    const snapshot = await persistence.getSnapshot(docId);
    if (snapshot) {
      response = {
        ok: true,
        hasUpdates: true,
        isSnapshot: true,
        dataB64: encodeBase64(snapshot.data),
        frontierTag: snapshot.frontierTag,
        updateCount: 1,
        role: "editor",
      };
    }
  } else {
    const updates = await persistence.getUpdatesSince(docId, fromFrontierTag);
    if (updates) {
      response = {
        ok: true,
        hasUpdates: true,
        isSnapshot: false,
        dataB64: encodeBase64(updates.data),
        frontierTag: updates.frontierTag,
        updateCount: 1,
        role: "editor",
      };
    } else {
      const snapshot = await persistence.getSnapshot(docId);
      if (snapshot) {
        response = {
          ok: true,
          hasUpdates: true,
          isSnapshot: true,
          dataB64: encodeBase64(snapshot.data),
          frontierTag: snapshot.frontierTag,
          updateCount: 1,
          role: "editor",
        };
      }
    }
  }

  sendJson(res, 200, response);
}

async function handlePollingPush(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const payload = body as PollingPushRequest;
  if (!isString(payload.docId)) {
    sendJson(res, 400, { ok: false, error: "docId is required" });
    return;
  }
  if (!isString(payload.updateData)) {
    sendJson(res, 400, { ok: false, error: "updateData is required" });
    return;
  }
  if (!isBoolean(payload.isBase64)) {
    sendJson(res, 400, { ok: false, error: "isBase64 is required" });
    return;
  }
  if (!isString(payload.frontierTag)) {
    sendJson(res, 400, { ok: false, error: "frontierTag is required" });
    return;
  }
  if (!isString(payload.parentFrontierTag)) {
    sendJson(res, 400, { ok: false, error: "parentFrontierTag is required" });
    return;
  }

  const docId = payload.docId;
  const data = payload.isBase64 ? decodeBase64(payload.updateData) : encodeUtf8(payload.updateData);
  const currentFrontierTag = await persistence.getCurrentFrontierTag(docId);

  if (payload.parentFrontierTag !== currentFrontierTag) {
    sendJson(res, 200, {
      ok: true,
      applied: false,
      serverFrontierTag: currentFrontierTag,
      rejectionReason: "Frontier conflict - please catch up",
      role: "editor",
    });
    return;
  }

  try {
    await persistence.saveUpdate(docId, data, payload.frontierTag);
    sendJson(res, 200, {
      ok: true,
      applied: true,
      serverFrontierTag: payload.frontierTag,
      role: "editor",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist update";
    sendJson(res, 500, { ok: false, error: message });
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function decodeBase64(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64"));
}

function encodeUtf8(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

// ============================================================================
// WebSocket Adapter
// ============================================================================

function adaptWebSocket(ws: WebSocket): WebSocketLike {
  return {
    send(data: string) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    close(code?: number, reason?: string) {
      ws.close(code, reason);
    },
  };
}

// ============================================================================
// Server Setup
// ============================================================================

const syncServer = new SyncServer(
  {
    enableNegotiationLog: true,
    presenceTtlMs: 30000,
    maxClientsPerRoom: 50,
    handshakeTimeoutMs: 10000,
  },
  persistence
);

const httpServer = createServer((req, res) => {
  void handleHttpRequest(req, res);
});

const wss = new WebSocketServer({ server: httpServer });

// Track connections by socket
const socketToClient = new WeakMap<WebSocket, { pendingId: string; docId: string }>();
const clientToSocket = new Map<string, WebSocket>();

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = parse(req.url ?? "", true);
  const docId = url.query.docId as string;

  if (!docId) {
    ws.close(1008, "Missing docId query parameter");
    return;
  }

  const adapted = adaptWebSocket(ws);
  const pendingId = syncServer.handleConnection(adapted, docId);

  socketToClient.set(ws, { pendingId, docId });

  ws.on("message", async (data: Buffer | string) => {
    const str = typeof data === "string" ? data : data.toString("utf-8");

    // Parse to get clientId for tracking
    try {
      const msg = JSON.parse(str);
      if (msg.clientId && !clientToSocket.has(msg.clientId)) {
        clientToSocket.set(msg.clientId, ws);
      }
      await syncServer.handleMessage(adapted, str, msg.clientId);
    } catch {
      await syncServer.handleMessage(adapted, str);
    }
  });

  ws.on("close", (_code: number, _reason: Buffer) => {
    const info = socketToClient.get(ws);
    if (info) {
      // Cancel pending if handshake wasn't completed
      syncServer.cancelPendingConnection(info.pendingId);

      // Find and disconnect client
      for (const [clientId, socket] of clientToSocket) {
        if (socket === ws) {
          syncServer.handleDisconnect(clientId, info.docId);
          clientToSocket.delete(clientId);
          break;
        }
      }
    }
  });

  ws.on("error", (err: Error) => {
    console.error("[WS] Error:", err.message);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.info(`LFCC Collab Server running on http://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  syncServer.shutdown();
  wss.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
});
