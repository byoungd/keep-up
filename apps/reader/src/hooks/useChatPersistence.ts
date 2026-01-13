"use client";

import type { Message } from "@/components/layout/MessageItem";
import { createNumericPeerId, isValidLoroPeerId } from "@/lib/loroPeerId";
import {
  type AIContext,
  type DocumentFacade,
  type LoroRuntime,
  type MessageBlock,
  createDocumentFacade,
  createLoroRuntime,
} from "@keepup/lfcc-bridge";
import * as React from "react";

const STORAGE_KEY = "ai-chat-loro-v1";
const CHAT_PEER_ID_KEY = "ai-chat-peer-id";
const KEY_STORAGE = "ai-companion-key-v1";
const STORAGE_VERSION = 4;
const MAX_MESSAGES = 200;
const ALLOW_PLAINTEXT = process.env.NODE_ENV !== "production";

interface PersistenceState {
  snapshot: string; // Base64 encoded Loro snapshot
  model: string;
}

type StoredEncryptedPayload = {
  version: 4;
  encrypted: {
    iv: string;
    data: string;
  };
};

function toBase64(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): ArrayBuffer {
  const binary = atob(encoded);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }
  return array.buffer;
}

async function getOrCreateKey(): Promise<CryptoKey | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return null;
  }
  const cached = window.localStorage.getItem(KEY_STORAGE);
  if (cached) {
    try {
      const raw = fromBase64(cached);
      return await window.crypto.subtle.importKey("raw", raw, "AES-GCM", true, [
        "encrypt",
        "decrypt",
      ]);
    } catch {
      window.localStorage.removeItem(KEY_STORAGE);
    }
  }
  const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await window.crypto.subtle.exportKey("raw", key);
  window.localStorage.setItem(KEY_STORAGE, toBase64(raw));
  return key;
}

async function encryptState(state: PersistenceState): Promise<StoredEncryptedPayload | null> {
  const key = await getOrCreateKey();
  if (!key || typeof window === "undefined") {
    return null;
  }
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  const data = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    version: STORAGE_VERSION,
    encrypted: {
      iv: toBase64(iv.buffer),
      data: toBase64(data),
    },
  };
}

async function decryptState(payload: StoredEncryptedPayload): Promise<PersistenceState | null> {
  const key = await getOrCreateKey();
  if (!key || typeof window === "undefined") {
    return null;
  }
  try {
    const iv = new Uint8Array(fromBase64(payload.encrypted.iv));
    const data = fromBase64(payload.encrypted.data);
    const decoded = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const text = new TextDecoder().decode(decoded);
    const parsed = JSON.parse(text) as PersistenceState;
    if (parsed?.snapshot && parsed?.model !== undefined) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function isEncryptedPayload(value: unknown): value is StoredEncryptedPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as StoredEncryptedPayload;
  return (
    payload.version === STORAGE_VERSION &&
    typeof payload.encrypted?.iv === "string" &&
    typeof payload.encrypted?.data === "string"
  );
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return "#";
  }
  return trimmed;
}

export function sanitizeMarkdown(content: string): string {
  let sanitized = content;
  sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=\s*"[^"]*"/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=\s*'[^']*'/gi, "");
  sanitized = sanitized.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const safeUrl = sanitizeUrl(url);
    return `[${text}](${safeUrl})`;
  });
  sanitized = sanitized.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return sanitized;
}

function getOrCreateChatPeerId(): `${number}` {
  if (typeof window === "undefined") {
    return "1";
  }
  const cached = window.localStorage.getItem(CHAT_PEER_ID_KEY);
  if (cached && isValidLoroPeerId(cached)) {
    return cached as `${number}`;
  }
  const nextId = createNumericPeerId();
  window.localStorage.setItem(CHAT_PEER_ID_KEY, nextId);
  return nextId as `${number}`;
}

/** Convert MessageBlock to legacy Message format for UI compatibility */
function messageBlockToMessage(block: MessageBlock): Message {
  return {
    id: block.id,
    role: block.role as "user" | "assistant",
    content: block.text,
    createdAt: block.createdAt,
  };
}

export function useChatPersistence(defaultModel: string) {
  const [runtime, setRuntime] = React.useState<LoroRuntime | null>(null);
  const [facade, setFacade] = React.useState<DocumentFacade | null>(null);
  const [messages, setMessages] = React.useState<MessageBlock[]>([]);
  const [model, setModel] = React.useState<string>(defaultModel);
  const [hydrated, setHydrated] = React.useState(false);

  // Initialize runtime and facade
  React.useEffect(() => {
    const rt = createLoroRuntime({ peerId: getOrCreateChatPeerId() });
    const fc = createDocumentFacade(rt);
    setRuntime(rt);
    setFacade(fc);

    // Subscribe to changes
    const unsubscribe = fc.subscribe((event) => {
      if (
        event.type === "message_inserted" ||
        event.type === "message_updated" ||
        event.type === "message_streaming"
      ) {
        setMessages(fc.getMessages());
      }
    });

    return () => unsubscribe();
  }, []);

  // Load from storage
  React.useEffect(() => {
    if (!runtime || !facade || typeof window === "undefined") {
      return;
    }
    let cancelled = false;

    const loadFromStorage = async (): Promise<PersistenceState | null> => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (isEncryptedPayload(parsed)) {
          return decryptState(parsed);
        }
      } catch {
        return null;
      }
      return null;
    };

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Legacy hydration logic with multiple fallback paths
    void (async () => {
      try {
        const state = await loadFromStorage();
        if (!state) {
          if (!cancelled) {
            setMessages(facade.getMessages());
            setHydrated(true);
          }
          return;
        }

        // Import Loro snapshot
        const snapshotBytes = new Uint8Array(fromBase64(state.snapshot));
        runtime.doc.import(snapshotBytes);

        if (!cancelled) {
          setMessages(facade.getMessages());
          if (state.model) {
            setModel(state.model);
          }
          setHydrated(true);
        }
      } catch (error) {
        console.warn("Failed to load AI chat history:", error);
        window.localStorage.removeItem(STORAGE_KEY);
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runtime, facade]);

  // Save to storage
  React.useEffect(() => {
    if (!hydrated || !runtime || typeof window === "undefined") {
      return;
    }

    // Apply retention: delete oldest messages if over limit
    if (facade && messages.length > MAX_MESSAGES) {
      const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
      const cutoffIndex = messages.length - MAX_MESSAGES;
      const cutoffTimestamp = sorted[cutoffIndex]?.createdAt ?? 0;
      if (cutoffTimestamp > 0) {
        facade.deleteMessagesOlderThan(cutoffTimestamp);
      }
    }

    void (async () => {
      try {
        const snapshot = runtime.doc.export({ mode: "snapshot" });
        const state: PersistenceState = {
          snapshot: toBase64(snapshot.buffer as ArrayBuffer),
          model,
        };

        const encrypted = await encryptState(state);
        if (encrypted) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
          return;
        }
        if (ALLOW_PLAINTEXT) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
      } catch (error) {
        console.warn("Failed to save AI chat history:", error);
      }
    })();
  }, [hydrated, runtime, messages, model, facade]);

  const addMessage = React.useCallback(
    (role: "user" | "assistant", content: string, aiContext?: AIContext) => {
      if (!facade) {
        return "";
      }
      return facade.insertMessage({ role, content, aiContext });
    },
    [facade]
  );

  const createStreamingMessage = React.useCallback(
    (aiContext?: AIContext) => {
      if (!facade) {
        return "";
      }
      return facade.createStreamingMessage("assistant", aiContext);
    },
    [facade]
  );

  const appendStreamChunk = React.useCallback(
    (messageId: string, chunk: string, isFinal?: boolean, aiContext?: AIContext) => {
      if (!facade) {
        return;
      }
      facade.appendStreamChunk({ messageId, chunk, isFinal, aiContext });
    },
    [facade]
  );

  const clearHistory = React.useCallback(() => {
    if (!runtime) {
      return;
    }
    // Create new runtime (clears all data)
    const rt = createLoroRuntime({ peerId: "chat" as `${number}` });
    const fc = createDocumentFacade(rt);
    setRuntime(rt);
    setFacade(fc);
    setMessages([]);
    setModel(defaultModel);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [runtime, defaultModel]);

  const exportHistory = React.useCallback(() => {
    if (messages.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ai-chat-export-${timestamp}.md`;

    let content = `# AI Companion Chat History\nDate: ${new Date().toLocaleString()}\n\n`;

    for (const msg of messages) {
      const role = msg.role === "user" ? "User" : "AI";
      const safeContent = sanitizeMarkdown(msg.text);
      content += `## ${role}\n\n${safeContent}\n\n---\n\n`;
    }

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages]);

  // Legacy compatibility: convert MessageBlock[] to Message[] for existing UI
  const legacyMessages = React.useMemo(() => messages.map(messageBlockToMessage), [messages]);

  return {
    // New Facade-based API
    facade,
    messages,
    addMessage,
    createStreamingMessage,
    appendStreamChunk,
    // Legacy compatibility
    legacyMessages,
    model,
    setModel,
    clearHistory,
    exportHistory,
    hydrated,
  };
}
