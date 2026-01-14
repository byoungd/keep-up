"use client";

import type { DocumentRow } from "@ku0/db";

import { getDbClient } from "@/lib/db";
import { decodeContentTextFromUpdates } from "./decodeLoro";

export type DocumentTextResult = {
  docId: string;
  title: string;
  contentText: string;
};

const documentTextCache = new Map<string, DocumentTextResult>();

export async function getDocumentById(docId: string): Promise<DocumentRow | null> {
  const client = await getDbClient();
  return client.getDocument(docId);
}

export async function getDocumentTextById(docId: string): Promise<DocumentTextResult | null> {
  const cached = documentTextCache.get(docId);
  if (cached) {
    return cached;
  }

  const client = await getDbClient();
  const document = await client.getDocument(docId);
  if (!document) {
    return null;
  }

  const updates = await client.listUpdates({ docId });
  const contentText = decodeContentTextFromUpdates(updates);

  const result = {
    docId: document.docId,
    title: document.title ?? "Untitled",
    contentText,
  };

  documentTextCache.set(docId, result);
  return result;
}

export function clearDocumentTextCache(docId?: string): void {
  if (docId) {
    documentTextCache.delete(docId);
    return;
  }
  documentTextCache.clear();
}
