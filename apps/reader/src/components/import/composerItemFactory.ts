/**
 * Composer item factory helpers.
 */

import { isValidHttpUrl } from "@/hooks/useGlobalDropTarget";
import { importFeatureFlags } from "@/lib/import/importFeatures";
import type { AddSourceItem, SourceKind } from "./types";
import { FILE_LIMITS, URL_ERROR_CODES } from "./types";

export function generateComposerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function detectSourceKind(input: string): SourceKind {
  const trimmed = input.trim();
  if (isValidHttpUrl(trimmed)) {
    return "url";
  }
  return "text";
}

function generateDisplayName(kind: SourceKind, input: string, file?: File): string {
  switch (kind) {
    case "text": {
      const snippet = input.trim().slice(0, 50);
      return snippet.length < input.trim().length ? `${snippet}...` : snippet;
    }
    case "file":
      return file?.name || "Unknown file";
    case "url": {
      try {
        const url = new URL(input);
        return url.hostname;
      } catch {
        return input.slice(0, 50);
      }
    }
    default:
      return "Unknown source";
  }
}

function validateFile(file: File): { valid: boolean; error?: string } {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > FILE_LIMITS.MAX_SIZE_MB) {
    return {
      valid: false,
      error: `File too large (${sizeMB.toFixed(1)}MB). Maximum size is ${FILE_LIMITS.MAX_SIZE_MB}MB.`,
    };
  }

  const extension = file.name.toLowerCase().split(".").pop();
  const hasValidExtension =
    extension && FILE_LIMITS.SUPPORTED_TYPES.some((type) => type.slice(1) === extension);

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Unsupported file type. Supported: ${FILE_LIMITS.SUPPORTED_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

export function createTextItem(content: string, localId?: string): AddSourceItem {
  return {
    localId: localId ?? generateComposerId(),
    kind: "text",
    displayName: generateDisplayName("text", content),
    content: content.trim(),
    status: "draft",
    createdAt: Date.now(),
  };
}

export function createUrlItem(url: string, localId?: string): AddSourceItem {
  const trimmed = url.trim();
  const item: AddSourceItem = {
    localId: localId ?? generateComposerId(),
    kind: "url",
    displayName: generateDisplayName("url", trimmed),
    url: trimmed,
    status: "draft",
    createdAt: Date.now(),
  };

  if (!importFeatureFlags.url) {
    item.status = "failed";
    item.errorCode = URL_ERROR_CODES.UNSUPPORTED;
    item.errorMessage = "URL import is temporarily unavailable. Paste text instead.";
  }

  return item;
}

export function createFileItem(file: File, localId?: string): AddSourceItem {
  const validation = validateFile(file);

  const item: AddSourceItem = {
    localId: localId ?? generateComposerId(),
    kind: "file",
    displayName: generateDisplayName("file", "", file),
    sizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
    status: validation.valid ? "draft" : "failed",
    createdAt: Date.now(),
  };

  if (!validation.valid) {
    item.errorMessage = validation.error;
  } else {
    item._tempFile = file;
  }

  return item;
}

export function createItemFromInput(input: string, localId?: string): AddSourceItem {
  const kind = detectSourceKind(input);
  if (kind === "url") {
    return createUrlItem(input, localId);
  }
  return createTextItem(input, localId);
}
