import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock loro-crdt before any imports
vi.mock("loro-crdt", () => {
  return {
    LoroDoc: class MockLoroDoc {
      private seq = 0;
      peerIdStr = "mock_peer";
      getMovableList() {
        return {
          length: 0,
          insert: vi.fn(),
          toArray: () => [],
        };
      }
      getMap() {
        return {
          get: () => this.seq,
          set: vi.fn((key: string, val: unknown) => {
            if (key === "block_seq") {
              this.seq = val as number;
            }
          }),
          delete: vi.fn(),
          getOrCreateContainer: () => ({
            length: 0,
            delete: vi.fn(),
            toString: () => "",
            update: vi.fn(),
            toArray: () => [],
            insert: vi.fn(),
          }),
        };
      }
      export() {
        return new Uint8Array([1, 2, 3, 4, 5]);
      }
    },
  };
});

// Mock docPersistence
vi.mock("@/lib/persistence/docPersistence", () => ({
  docPersistence: {
    saveDoc: vi.fn().mockResolvedValue(undefined),
    saveMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

// Import after mocks
const { ingestMetaToLoroSnapshot } = await import("../ingestToLoro");

describe("ingestToLoro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ingestMetaToLoroSnapshot", () => {
    it("converts single paragraph content to snapshot", () => {
      const meta = {
        title: "Test Document",
        content: "This is a single paragraph.",
      };

      const snapshot = ingestMetaToLoroSnapshot(meta);

      expect(snapshot).toBeInstanceOf(Uint8Array);
      expect(snapshot.length).toBeGreaterThan(0);
    });

    it("converts multi-paragraph content to snapshot", () => {
      const meta = {
        title: "Multi Paragraph",
        content: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
      };

      const snapshot = ingestMetaToLoroSnapshot(meta);

      expect(snapshot).toBeInstanceOf(Uint8Array);
      expect(snapshot.length).toBeGreaterThan(0);
    });

    it("handles empty content gracefully", () => {
      const meta = {
        title: "Empty Doc",
        content: "",
      };

      const snapshot = ingestMetaToLoroSnapshot(meta);

      expect(snapshot).toBeInstanceOf(Uint8Array);
      expect(snapshot.length).toBeGreaterThan(0);
    });
  });
});
