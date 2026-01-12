/**
 * LFCC v0.9 RC - Debug Snapshot Export
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 */

import type {
  AnnotationRowData,
  DebugSnapshot,
  DirtySectionData,
  DocumentSectionData,
  FocusSectionData,
  SelectionSectionData,
} from "./types";

/**
 * Create a debug snapshot for export
 * Contains no PII - only IDs, counts, and short snippets
 */
export function createDebugSnapshot(data: {
  document: DocumentSectionData | null;
  selection: SelectionSectionData | null;
  annotations: AnnotationRowData[];
  focus: FocusSectionData | null;
  dirty: DirtySectionData | null;
  recentErrors: Array<{ code: string; message: string; timestamp: number }>;
}): DebugSnapshot {
  return {
    version: "1.0.0",
    timestamp: Date.now(),
    document: data.document,
    selection: data.selection,
    annotations: data.annotations.map((anno) => ({
      ...anno,
      // Truncate any long strings
      lastError: anno.lastError
        ? {
            code: anno.lastError.code,
            message: anno.lastError.message.slice(0, 120),
          }
        : null,
    })),
    focus: data.focus,
    dirty: data.dirty,
    recentErrors: data.recentErrors.slice(0, 20).map((e) => ({
      code: e.code,
      message: e.message.slice(0, 120),
      timestamp: e.timestamp,
    })),
  };
}

/**
 * Export snapshot to JSON string
 */
export function serializeSnapshot(snapshot: DebugSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Copy snapshot to clipboard
 */
export async function copySnapshotToClipboard(snapshot: DebugSnapshot): Promise<boolean> {
  try {
    const json = serializeSnapshot(snapshot);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download snapshot as JSON file
 */
export function downloadSnapshot(snapshot: DebugSnapshot): void {
  const json = serializeSnapshot(snapshot);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `lfcc-debug-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate snapshot schema (for tests)
 */
export function validateSnapshotSchema(snapshot: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof snapshot !== "object" || snapshot === null) {
    return { valid: false, errors: ["Snapshot must be an object"] };
  }

  const s = snapshot as Record<string, unknown>;

  // Required fields
  if (s.version !== "1.0.0") {
    errors.push("version must be '1.0.0'");
  }

  if (typeof s.timestamp !== "number") {
    errors.push("timestamp must be a number");
  }

  if (!Array.isArray(s.annotations)) {
    errors.push("annotations must be an array");
  }

  if (!Array.isArray(s.recentErrors)) {
    errors.push("recentErrors must be an array");
  }

  // Optional fields must be object or null
  const optionalFields = ["document", "selection", "focus", "dirty"];
  for (const field of optionalFields) {
    if (s[field] !== null && typeof s[field] !== "object") {
      errors.push(`${field} must be an object or null`);
    }
  }

  return { valid: errors.length === 0, errors };
}
