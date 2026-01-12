/**
 * Helper functions for ContentComposer to reduce complexity
 */

import type { AddSourceItem, ComposerAction } from "./types";
import { mapSourceKindToImportType } from "./types";

/** Minimal interface for ImportManager - only what we need */
interface ImportManagerLike {
  enqueue(params: { sourceType: string; sourceRef: string }): Promise<{ jobId: string } | string>;
}

/**
 * Process item enqueue - handles different source types
 */
export async function processItemEnqueue(
  item: AddSourceItem,
  manager: ImportManagerLike,
  registerFile: (file: File) => Promise<string>
): Promise<{ jobId: string } | string> {
  let sourceRef: string;
  const sourceType = mapSourceKindToImportType(item.kind);

  if (item.kind === "text" && item.content) {
    const blob = new Blob([item.content], { type: "text/plain" });
    const file = new File([blob], "pasted-text.txt", { type: "text/plain" });
    sourceRef = await registerFile(file);
  } else if (item.kind === "url" && item.url) {
    sourceRef = item.url;
  } else if (item.kind === "file" && item._tempFile) {
    sourceRef = await registerFile(item._tempFile);
  } else {
    throw new Error("Invalid item for enqueue");
  }

  return await manager.enqueue({
    sourceType,
    sourceRef,
  });
}

/**
 * Update item with job result - handles both string and object results
 */
export function updateItemWithResult(
  dispatch: React.Dispatch<ComposerAction>,
  localId: string,
  result: { jobId: string } | string
) {
  if (typeof result === "string") {
    dispatch({
      type: "UPDATE_ITEM_STATUS",
      localId,
      status: "processing",
      jobId: result,
    });
  } else {
    dispatch({
      type: "UPDATE_ITEM_STATUS",
      localId,
      status: "processing",
      jobId: result.jobId,
    });
  }
}
