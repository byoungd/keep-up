"use client";

import type { Message } from "@/components/layout/MessageItem";
import {
  type EnhancedDocument,
  applyOperation,
  createEnhancedDocument,
  createMessageBlock,
  getBlockText,
} from "@keepup/lfcc-bridge";
import * as React from "react";

const STORAGE_KEY = "ai-companion-conversation-v3";
const KEY_STORAGE = "ai-companion-key-v1";
const STORAGE_VERSION = 3;
const MAX_MESSAGES = 200;
const ALLOW_PLAINTEXT = process.env.NODE_ENV !== "production";

interface PersistenceState {
  doc: EnhancedDocument;
  model: string;
}

type StoredEncryptedPayload = {
  version: 3;
  encrypted: {
    iv: string;
    data: string;
  };
};

// Legacy payload type for migration
type LegacyPayload = {
  messages?: Message[];
  model?: string;
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
    if (parsed?.doc?.blocks) {
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
  const version = payload.version as number;
  return (
    (version === 2 || version === STORAGE_VERSION) &&
    typeof payload.encrypted?.iv === "string" &&
    typeof payload.encrypted?.data === "string"
  );
}

function migrateLegacyToEnhanced(legacy: LegacyPayload): PersistenceState {
  const messages = Array.isArray(legacy.messages) ? legacy.messages : [];
  const model = typeof legacy.model === "string" ? legacy.model : "";

  let doc = createEnhancedDocument("chat", { title: "Migrated Chat" });

  // Convert legacy messages to enhanced blocks
  for (const msg of messages) {
    const block = createMessageBlock(msg.role as "user" | "assistant", msg.content);
    doc = applyOperation(doc, { type: "INSERT_BLOCK", blockId: block.id, block });
  }

  return { doc, model };
}

function normalizeLegacyPayload(value: unknown): PersistenceState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const potential = value as Record<string, unknown>;
  if (potential.doc && typeof potential.doc === "object") {
    return potential as unknown as PersistenceState;
  }
  const legacy = value as LegacyPayload;
  if (legacy.messages) {
    return migrateLegacyToEnhanced(legacy);
  }
  return null;
}

export function applyRetention(state: PersistenceState): PersistenceState {
  const blocks = state.doc.blocks;
  if (blocks.length <= MAX_MESSAGES) {
    return state;
  }
  const retainedBlocks = blocks.slice(-MAX_MESSAGES);
  return {
    ...state,
    doc: { ...state.doc, blocks: retainedBlocks },
  };
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

export function useChatPersistence(defaultModel: string) {
  const [doc, setDoc] = React.useState<EnhancedDocument>(() => createEnhancedDocument("chat"));
  const [model, setModel] = React.useState<string>(defaultModel);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let cancelled = false;

    const loadFromStorage = async (): Promise<PersistenceState | null> => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }
      const parsed = JSON.parse(stored) as unknown;
      if (isEncryptedPayload(parsed)) {
        return decryptState(parsed);
      }
      return normalizeLegacyPayload(parsed);
    };

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: hook bootstraps persistence, migrations, and defaults
    void (async () => {
      try {
        const state = await loadFromStorage();
        if (!state) {
          window.localStorage.removeItem(STORAGE_KEY);
          if (!cancelled) {
            setHydrated(true);
          }
          return;
        }
        const retained = applyRetention(state);
        if (!cancelled) {
          setDoc(retained.doc);
          if (retained.model) {
            setModel(retained.model);
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
  }, []);

  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }

    const state = applyRetention({ doc, model });

    void (async () => {
      try {
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
  }, [hydrated, doc, model]);

  const clearHistory = React.useCallback(() => {
    setDoc(createEnhancedDocument("chat"));
    setModel(defaultModel);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [defaultModel]);

  const exportHistory = React.useCallback(() => {
    if (doc.blocks.length === 0) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ai-chat-export-${timestamp}.md`;

    let content = `# AI Companion Chat History\nDate: ${new Date().toLocaleString()}\n\n`;

    const messages = doc.blocks
      .filter((b) => b.type === "message" || b.message)
      .map((b) => ({ role: b.message?.role ?? "user", content: getBlockText(b) }));

    for (const msg of messages) {
      const role = msg.role === "user" ? "User" : "AI";
      const safeContent = sanitizeMarkdown(msg.content);
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
  }, [doc]);

  return {
    doc,
    setDoc,
    model,
    setModel,
    clearHistory,
    exportHistory,
    getBlockText,
  };
}
