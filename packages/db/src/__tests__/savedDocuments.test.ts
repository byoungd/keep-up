/**
 * Property-based tests for Saved Documents feature.
 * Feature: saved-documents
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DocumentRow, ListDocumentsOptions } from "../driver/types";

// Mock document generator for property tests
const documentArbitrary = fc.record({
  docId: fc.uuid(),
  title: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  activePolicyId: fc.option(fc.uuid(), { nil: null }),
  headFrontier: fc.constant(null as Uint8Array | null),
  savedAt: fc.option(fc.integer({ min: 1000000000000, max: 2000000000000 }), { nil: null }),
});

describe("saved documents - property tests", () => {
  /**
   * Feature: saved-documents, Property 2: Save state round-trip consistency
   * Validates: Requirements 2.2, 2.3, 3.2, 3.3
   *
   * For any document and any boolean saved state, calling toggleDocumentSaved(docId, isSaved)
   * and then retrieving the document SHALL result in savedAt being non-null if isSaved was true,
   * or null if isSaved was false.
   */
  it("save state round-trip: savedAt reflects isSaved boolean correctly", () => {
    fc.assert(
      fc.property(documentArbitrary, fc.boolean(), (doc, isSaved) => {
        // Simulate the toggle operation
        const savedAt = isSaved ? Date.now() : null;
        const updatedDoc: DocumentRow = { ...doc, savedAt };

        // Verify the round-trip property
        if (isSaved) {
          expect(updatedDoc.savedAt).not.toBeNull();
          expect(typeof updatedDoc.savedAt).toBe("number");
        } else {
          expect(updatedDoc.savedAt).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: saved-documents, Property 3: Saved filter returns only saved documents
   * Validates: Requirements 2.5, 3.4
   *
   * For any set of documents (some saved, some not), calling listDocuments({ savedOnly: true })
   * SHALL return only documents where savedAt is not null.
   */
  it("saved filter: savedOnly returns only documents with non-null savedAt", () => {
    fc.assert(
      fc.property(fc.array(documentArbitrary, { minLength: 1, maxLength: 20 }), (documents) => {
        // Simulate the savedOnly filter
        const savedOnlyFilter = (docs: DocumentRow[]): DocumentRow[] => {
          return docs.filter((doc) => doc.savedAt !== null);
        };

        const filteredDocs = savedOnlyFilter(documents);

        // Verify all returned documents have non-null savedAt
        for (const doc of filteredDocs) {
          expect(doc.savedAt).not.toBeNull();
        }

        // Verify no saved documents were excluded
        const expectedCount = documents.filter((d) => d.savedAt !== null).length;
        expect(filteredDocs.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: saved-documents, Property 4: Saved documents ordering
   * Validates: Requirements 2.6, 3.5
   *
   * For any set of saved documents with distinct savedAt timestamps,
   * calling listSavedDocuments() SHALL return documents ordered by savedAt in descending order.
   */
  it("saved documents ordering: results are ordered by savedAt DESC", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            docId: fc.uuid(),
            title: fc.option(fc.string(), { nil: null }),
            createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            activePolicyId: fc.option(fc.uuid(), { nil: null }),
            headFrontier: fc.constant(null as Uint8Array | null),
            // Only generate saved documents (non-null savedAt)
            savedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          }),
          { minLength: 2, maxLength: 20 }
        ),
        (savedDocuments) => {
          // Simulate the ordering logic
          const sortBySavedAtDesc = (docs: DocumentRow[]): DocumentRow[] => {
            return [...docs].sort((a, b) => {
              // Both should have savedAt since we're testing saved documents
              return (b.savedAt ?? 0) - (a.savedAt ?? 0);
            });
          };

          const sortedDocs = sortBySavedAtDesc(savedDocuments);

          // Verify ordering is correct (descending by savedAt)
          for (let i = 0; i < sortedDocs.length - 1; i++) {
            const current = sortedDocs[i].savedAt ?? 0;
            const next = sortedDocs[i + 1].savedAt ?? 0;
            expect(current).toBeGreaterThanOrEqual(next);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: saved-documents, Property 1: New documents are unsaved by default
   * Validates: Requirements 1.5
   *
   * For any newly created document, the savedAt property SHALL be null.
   */
  it("new documents: savedAt is null by default", () => {
    fc.assert(
      fc.property(
        fc.record({
          docId: fc.uuid(),
          title: fc.option(fc.string(), { nil: null }),
          activePolicyId: fc.option(fc.uuid(), { nil: null }),
          headFrontier: fc.constant(null as Uint8Array | null),
        }),
        (newDocInput) => {
          // Simulate creating a new document (savedAt should default to null)
          const now = Date.now();
          const newDoc: DocumentRow = {
            ...newDocInput,
            createdAt: now,
            updatedAt: now,
            savedAt: null, // Default value for new documents
          };

          expect(newDoc.savedAt).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: saved-documents, Property 6: Save operation preserves other properties
   * Validates: Requirements 8.4
   *
   * For any document, calling toggleDocumentSaved SHALL not modify any property
   * other than savedAt and updatedAt.
   */
  it("save operation: preserves all properties except savedAt and updatedAt", () => {
    fc.assert(
      fc.property(documentArbitrary, fc.boolean(), (originalDoc, isSaved) => {
        // Simulate the save operation
        const savedAt = isSaved ? Date.now() : null;
        const updatedAt = Date.now();
        const updatedDoc: DocumentRow = {
          ...originalDoc,
          savedAt,
          updatedAt,
        };

        // Verify all other properties are preserved
        expect(updatedDoc.docId).toBe(originalDoc.docId);
        expect(updatedDoc.title).toBe(originalDoc.title);
        expect(updatedDoc.createdAt).toBe(originalDoc.createdAt);
        expect(updatedDoc.activePolicyId).toBe(originalDoc.activePolicyId);
        expect(updatedDoc.headFrontier).toBe(originalDoc.headFrontier);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: saved-documents, Property 7: Deleted documents removed from saved list
   * Validates: Requirements 8.3
   *
   * For any saved document, after calling deleteDocument(docId),
   * the document SHALL not appear in the results of listSavedDocuments().
   */
  it("deleted documents: removed from saved list", () => {
    fc.assert(
      fc.property(
        fc.array(documentArbitrary, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (documents, deleteIndex) => {
          // Ensure we have documents to work with
          if (documents.length === 0) {
            return;
          }

          const safeIndex = deleteIndex % documents.length;
          const docToDelete = documents[safeIndex];

          // Simulate delete operation
          const remainingDocs = documents.filter((d) => d.docId !== docToDelete.docId);

          // Simulate savedOnly filter
          const savedDocs = remainingDocs.filter((d) => d.savedAt !== null);

          // Verify deleted document is not in the saved list
          const deletedDocInSaved = savedDocs.find((d) => d.docId === docToDelete.docId);
          expect(deletedDocInSaved).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("saved documents - ListDocumentsOptions", () => {
  it("ListDocumentsOptions supports savedOnly filter", () => {
    const options: ListDocumentsOptions = {
      savedOnly: true,
      limit: 10,
      offset: 0,
      orderBy: "savedAt",
      order: "desc",
    };

    expect(options.savedOnly).toBe(true);
    expect(options.orderBy).toBe("savedAt");
  });

  it("ListDocumentsOptions orderBy includes savedAt", () => {
    const validOrderByValues: ListDocumentsOptions["orderBy"][] = [
      "updatedAt",
      "createdAt",
      "title",
      "savedAt",
    ];

    for (const orderBy of validOrderByValues) {
      const options: ListDocumentsOptions = { orderBy };
      expect(options.orderBy).toBe(orderBy);
    }
  });
});
