import { describe, expect, it } from "vitest";
import type { ImportJobRow } from "../driver/types";
import { deriveImportDocumentId } from "../import/ImportManager";
import type { ContentResult } from "../import/normalization/types";

const baseJob: ImportJobRow = {
  jobId: "job_123",
  sourceType: "url",
  sourceRef: "https://example.com",
  status: "queued",
  progress: 0,
  errorCode: null,
  errorMessage: null,
  resultDocumentId: null,
  assetId: null,
  documentVersionId: null,
  dedupeHit: null,
  attemptCount: 0,
  nextRetryAt: null,
  parserVersion: null,
  createdAt: 0,
  updatedAt: 0,
};

const baseContent: ContentResult = {
  title: "Hello",
  textContent: "World",
  crdtUpdate: new Uint8Array([1, 2, 3]),
  metadata: {},
};

describe("deriveImportDocumentId", () => {
  it("returns a deterministic id for identical input", async () => {
    const id1 = await deriveImportDocumentId(baseJob, baseContent);
    const id2 = await deriveImportDocumentId(baseJob, baseContent);
    expect(id1).toBe(id2);
  });

  it("changes the id when content or source changes", async () => {
    const idOriginal = await deriveImportDocumentId(baseJob, baseContent);
    const idChangedSource = await deriveImportDocumentId(
      { ...baseJob, sourceRef: "https://example.com/other" },
      baseContent
    );
    const idChangedContent = await deriveImportDocumentId(baseJob, {
      ...baseContent,
      textContent: "New",
    });

    expect(idChangedSource).not.toBe(idOriginal);
    expect(idChangedContent).not.toBe(idOriginal);
  });
});
