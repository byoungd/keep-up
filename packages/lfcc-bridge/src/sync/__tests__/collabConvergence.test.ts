/**
 * Collaboration MVP - Convergence Property Tests
 *
 * Property-based tests for concurrent edit convergence and offline merge convergence.
 * Uses an in-memory transport to simulate two clients with separate Loro documents.
 *
 * **Feature: collaboration-mvp**
 */

import * as fc from "fast-check";
import type { LoroDoc, LoroText } from "loro-crdt";
import { describe, expect, it } from "vitest";

import { LoroRuntime } from "../../runtime/loroRuntime";
import type { CollabAdapter, CollabAdapterStatus, CollabSession } from "../collabAdapter";
import { CollabManager } from "../collabManager";
import type { SyncMessage } from "../collabMessages";

// ============================================================================
// In-Memory Transport for Testing
// ============================================================================

/**
 * In-memory message bus that simulates network communication between clients.
 * Messages sent by one client are delivered to all other clients.
 */
class InMemoryMessageBus {
  private clients = new Map<string, InMemoryCollabAdapter>();

  register(clientId: string, adapter: InMemoryCollabAdapter): void {
    this.clients.set(clientId, adapter);
  }

  unregister(clientId: string): void {
    this.clients.delete(clientId);
  }

  broadcast(senderId: string, msg: SyncMessage): void {
    for (const [clientId, adapter] of this.clients) {
      if (clientId !== senderId) {
        adapter.receiveMessage(msg);
      }
    }
  }
}

/**
 * In-memory CollabAdapter for testing convergence without network.
 */
class InMemoryCollabAdapter implements CollabAdapter {
  status: CollabAdapterStatus = "idle";
  private messageCallbacks = new Set<(msg: SyncMessage) => void>();
  private statusCallbacks = new Set<(status: CollabAdapterStatus) => void>();
  private errorCallbacks = new Set<(error: Error) => void>();
  private bus: InMemoryMessageBus;
  private clientId: string;

  constructor(bus: InMemoryMessageBus, clientId: string) {
    this.bus = bus;
    this.clientId = clientId;
  }

  async connect(_session: CollabSession): Promise<void> {
    this.bus.register(this.clientId, this);
    this.setStatus("connected");
  }

  send(msg: SyncMessage): void {
    if (this.status === "connected") {
      this.bus.broadcast(this.clientId, msg);
    }
  }

  onMessage(cb: (msg: SyncMessage) => void): () => void {
    this.messageCallbacks.add(cb);
    return () => this.messageCallbacks.delete(cb);
  }

  onStatusChange(cb: (status: CollabAdapterStatus) => void): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  onError(cb: (error: Error) => void): () => void {
    this.errorCallbacks.add(cb);
    return () => this.errorCallbacks.delete(cb);
  }

  disconnect(): void {
    this.bus.unregister(this.clientId);
    this.setStatus("disconnected");
  }

  // Called by the message bus to deliver messages
  receiveMessage(msg: SyncMessage): void {
    for (const cb of this.messageCallbacks) {
      cb(msg);
    }
  }

  private setStatus(status: CollabAdapterStatus): void {
    this.status = status;
    for (const cb of this.statusCallbacks) {
      cb(status);
    }
  }
}

// ============================================================================
// Test Harness: Two-Client Simulation
// ============================================================================

type TwoClientSetup = {
  bus: InMemoryMessageBus;
  runtime1: LoroRuntime;
  runtime2: LoroRuntime;
  adapter1: InMemoryCollabAdapter;
  adapter2: InMemoryCollabAdapter;
  manager1: CollabManager;
  manager2: CollabManager;
  cleanup: () => void;
};

/**
 * Creates a two-client test setup with separate Loro documents connected
 * via an in-memory message bus.
 */
function createTwoClientSetup(docId: string): TwoClientSetup {
  const bus = new InMemoryMessageBus();

  // Create separate Loro runtimes with unique peer IDs
  const runtime1 = new LoroRuntime({ docId, peerId: 1 });
  const runtime2 = new LoroRuntime({ docId, peerId: 2 });

  // Create adapters
  const adapter1 = new InMemoryCollabAdapter(bus, "client1");
  const adapter2 = new InMemoryCollabAdapter(bus, "client2");

  // Create managers
  const manager1 = new CollabManager({
    runtime: runtime1,
    adapter: adapter1,
    userId: "user1",
    docId,
  });

  const manager2 = new CollabManager({
    runtime: runtime2,
    adapter: adapter2,
    userId: "user2",
    docId,
  });

  const cleanup = () => {
    manager1.stop();
    manager2.stop();
  };

  return {
    bus,
    runtime1,
    runtime2,
    adapter1,
    adapter2,
    manager1,
    manager2,
    cleanup,
  };
}

// ============================================================================
// Edit Operations for Property Testing
// ============================================================================

type EditOperation =
  | { type: "insert"; index: number; text: string }
  | { type: "delete"; index: number; length: number };

/**
 * Apply an edit operation to a LoroText container.
 * Handles bounds checking to ensure valid operations.
 */
function applyEdit(text: LoroText, op: EditOperation): void {
  const currentLength = text.length;

  if (op.type === "insert") {
    // Clamp index to valid range [0, currentLength]
    const index = Math.min(Math.max(0, op.index), currentLength);
    text.insert(index, op.text);
  } else {
    // Delete operation
    if (currentLength === 0) {
      return;
    }
    // Clamp index and length to valid range
    const index = Math.min(Math.max(0, op.index), currentLength - 1);
    const maxLength = currentLength - index;
    const length = Math.min(Math.max(1, op.length), maxLength);
    text.delete(index, length);
  }
}

/**
 * Get the text content from a LoroDoc's "content" text container.
 */
function getTextContent(doc: LoroDoc): string {
  const text = doc.getText("content");
  return text.toString();
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const editOperationArb: fc.Arbitrary<EditOperation> = fc.oneof(
  fc.record({
    type: fc.constant("insert" as const),
    index: fc.nat({ max: 100 }),
    text: fc.string({ minLength: 1, maxLength: 10 }),
  }),
  fc.record({
    type: fc.constant("delete" as const),
    index: fc.nat({ max: 100 }),
    length: fc.nat({ min: 1, max: 10 }),
  })
);

const editSequenceArb = fc.array(editOperationArb, { minLength: 1, maxLength: 10 });

// ============================================================================
// Property Tests
// ============================================================================

describe("Collaboration Convergence Property Tests", () => {
  /**
   * **Feature: collaboration-mvp, Property 4: Concurrent Edit Convergence**
   *
   * For any two Loro documents starting from the same initial state, and for any
   * sequence of concurrent edits applied to each document, after exchanging all
   * CRDT updates, both documents SHALL have identical content.
   *
   * **Validates: Requirements 4.4**
   */
  describe("Property 4: Concurrent Edit Convergence", () => {
    it("documents converge after concurrent edits are exchanged", async () => {
      await fc.assert(
        fc.asyncProperty(editSequenceArb, editSequenceArb, async (edits1, edits2) => {
          const docId = `test-doc-${Date.now()}-${Math.random()}`;
          const setup = createTwoClientSetup(docId);

          try {
            // Start both managers
            await setup.manager1.start();
            await setup.manager2.start();

            // Get text containers
            const text1 = setup.runtime1.doc.getText("content");
            const text2 = setup.runtime2.doc.getText("content");

            // Apply edits concurrently (without syncing yet)
            // Temporarily disconnect to simulate concurrent editing
            setup.adapter1.disconnect();
            setup.adapter2.disconnect();

            // Apply edits to doc1
            for (const edit of edits1) {
              applyEdit(text1, edit);
              setup.runtime1.doc.commit({ origin: "test" });
            }

            // Apply edits to doc2
            for (const edit of edits2) {
              applyEdit(text2, edit);
              setup.runtime2.doc.commit({ origin: "test" });
            }

            // Now exchange updates to achieve convergence
            // Export updates from each doc and import into the other
            const update1 = setup.runtime1.doc.export({ mode: "update" });
            const update2 = setup.runtime2.doc.export({ mode: "update" });

            setup.runtime2.doc.import(update1);
            setup.runtime1.doc.import(update2);

            // Verify convergence: both documents should have identical content
            const content1 = getTextContent(setup.runtime1.doc);
            const content2 = getTextContent(setup.runtime2.doc);

            expect(content1).toBe(content2);
          } finally {
            setup.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("documents converge with real-time sync via CollabManager", async () => {
      await fc.assert(
        fc.asyncProperty(editSequenceArb, editSequenceArb, async (edits1, edits2) => {
          const docId = `test-doc-${Date.now()}-${Math.random()}`;
          const setup = createTwoClientSetup(docId);

          try {
            // Start both managers (connected via in-memory bus)
            await setup.manager1.start();
            await setup.manager2.start();

            // Get text containers
            const text1 = setup.runtime1.doc.getText("content");
            const text2 = setup.runtime2.doc.getText("content");

            // Interleave edits from both clients
            const maxLen = Math.max(edits1.length, edits2.length);
            for (let i = 0; i < maxLen; i++) {
              if (i < edits1.length) {
                applyEdit(text1, edits1[i]);
                setup.runtime1.doc.commit({ origin: "test" });
              }
              if (i < edits2.length) {
                applyEdit(text2, edits2[i]);
                setup.runtime2.doc.commit({ origin: "test" });
              }
            }

            // Allow a small delay for message propagation (in-memory is sync, but just in case)
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Verify convergence
            const content1 = getTextContent(setup.runtime1.doc);
            const content2 = getTextContent(setup.runtime2.doc);

            expect(content1).toBe(content2);
          } finally {
            setup.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("empty initial state converges correctly", async () => {
      const docId = "empty-test-doc";
      const setup = createTwoClientSetup(docId);

      try {
        await setup.manager1.start();
        await setup.manager2.start();

        // Both start empty
        expect(getTextContent(setup.runtime1.doc)).toBe("");
        expect(getTextContent(setup.runtime2.doc)).toBe("");

        // Client 1 inserts "Hello"
        const text1 = setup.runtime1.doc.getText("content");
        text1.insert(0, "Hello");
        setup.runtime1.doc.commit({ origin: "test" });

        // Client 2 inserts "World"
        const text2 = setup.runtime2.doc.getText("content");
        text2.insert(0, "World");
        setup.runtime2.doc.commit({ origin: "test" });

        // Exchange updates
        const update1 = setup.runtime1.doc.export({ mode: "update" });
        const update2 = setup.runtime2.doc.export({ mode: "update" });
        setup.runtime2.doc.import(update1);
        setup.runtime1.doc.import(update2);

        // Both should have the same content (order may vary due to CRDT semantics)
        const content1 = getTextContent(setup.runtime1.doc);
        const content2 = getTextContent(setup.runtime2.doc);
        expect(content1).toBe(content2);
        // Content should contain both "Hello" and "World"
        expect(content1).toContain("Hello");
        expect(content1).toContain("World");
      } finally {
        setup.cleanup();
      }
    });
  });

  /**
   * **Feature: collaboration-mvp, Property 6: Offline Merge Convergence**
   *
   * For any client that goes offline, makes edits, and reconnects, after snapshot
   * exchange, the client's document SHALL converge to the same state as other
   * connected clients.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe("Property 6: Offline Merge Convergence", () => {
    it("offline edits merge correctly after reconnection", async () => {
      await fc.assert(
        fc.asyncProperty(editSequenceArb, editSequenceArb, async (onlineEdits, offlineEdits) => {
          const docId = `offline-test-${Date.now()}-${Math.random()}`;
          const setup = createTwoClientSetup(docId);

          try {
            // Start both managers
            await setup.manager1.start();
            await setup.manager2.start();

            const text1 = setup.runtime1.doc.getText("content");
            const text2 = setup.runtime2.doc.getText("content");

            // Client 2 goes offline
            setup.adapter2.disconnect();

            // Client 1 makes edits while client 2 is offline
            for (const edit of onlineEdits) {
              applyEdit(text1, edit);
              setup.runtime1.doc.commit({ origin: "test" });
            }

            // Client 2 makes edits while offline
            for (const edit of offlineEdits) {
              applyEdit(text2, edit);
              setup.runtime2.doc.commit({ origin: "test" });
            }

            // Client 2 reconnects - simulate snapshot exchange
            // In MVP, we use full snapshot exchange for simplicity
            const snapshot1 = setup.runtime1.doc.export({ mode: "snapshot" });
            const snapshot2 = setup.runtime2.doc.export({ mode: "snapshot" });

            // Import snapshots (this merges the states)
            setup.runtime1.doc.import(snapshot2);
            setup.runtime2.doc.import(snapshot1);

            // Verify convergence
            const content1 = getTextContent(setup.runtime1.doc);
            const content2 = getTextContent(setup.runtime2.doc);

            expect(content1).toBe(content2);
          } finally {
            setup.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("multiple offline periods merge correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          editSequenceArb,
          editSequenceArb,
          editSequenceArb,
          async (edits1, edits2, edits3) => {
            const docId = `multi-offline-${Date.now()}-${Math.random()}`;
            const setup = createTwoClientSetup(docId);

            try {
              await setup.manager1.start();
              await setup.manager2.start();

              const text1 = setup.runtime1.doc.getText("content");
              const text2 = setup.runtime2.doc.getText("content");

              // Phase 1: Both online, client 1 edits
              for (const edit of edits1) {
                applyEdit(text1, edit);
                setup.runtime1.doc.commit({ origin: "test" });
              }

              // Sync
              const update1 = setup.runtime1.doc.export({ mode: "update" });
              setup.runtime2.doc.import(update1);

              // Phase 2: Client 2 goes offline and edits
              setup.adapter2.disconnect();
              for (const edit of edits2) {
                applyEdit(text2, edit);
                setup.runtime2.doc.commit({ origin: "test" });
              }

              // Phase 3: Client 1 continues editing
              for (const edit of edits3) {
                applyEdit(text1, edit);
                setup.runtime1.doc.commit({ origin: "test" });
              }

              // Reconnect and merge
              const finalUpdate1 = setup.runtime1.doc.export({ mode: "update" });
              const finalUpdate2 = setup.runtime2.doc.export({ mode: "update" });
              setup.runtime1.doc.import(finalUpdate2);
              setup.runtime2.doc.import(finalUpdate1);

              // Verify convergence
              const content1 = getTextContent(setup.runtime1.doc);
              const content2 = getTextContent(setup.runtime2.doc);

              expect(content1).toBe(content2);
            } finally {
              setup.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("snapshot-based reconnection achieves convergence", async () => {
      const docId = "snapshot-reconnect-test";
      const setup = createTwoClientSetup(docId);

      try {
        await setup.manager1.start();
        await setup.manager2.start();

        const text1 = setup.runtime1.doc.getText("content");
        const text2 = setup.runtime2.doc.getText("content");

        // Initial content
        text1.insert(0, "Initial content");
        setup.runtime1.doc.commit({ origin: "test" });

        // Sync initial state
        const initialUpdate = setup.runtime1.doc.export({ mode: "update" });
        setup.runtime2.doc.import(initialUpdate);

        // Client 2 goes offline
        setup.adapter2.disconnect();

        // Client 1 makes changes
        text1.insert(text1.length, " - online edit");
        setup.runtime1.doc.commit({ origin: "test" });

        // Client 2 makes offline changes
        text2.insert(text2.length, " - offline edit");
        setup.runtime2.doc.commit({ origin: "test" });

        // Reconnect using snapshot exchange (MVP approach)
        const snapshot1 = setup.runtime1.doc.export({ mode: "snapshot" });
        const snapshot2 = setup.runtime2.doc.export({ mode: "snapshot" });

        setup.runtime1.doc.import(snapshot2);
        setup.runtime2.doc.import(snapshot1);

        // Verify convergence
        const content1 = getTextContent(setup.runtime1.doc);
        const content2 = getTextContent(setup.runtime2.doc);

        expect(content1).toBe(content2);
        expect(content1).toContain("Initial content");
        expect(content1).toContain("online edit");
        expect(content1).toContain("offline edit");
      } finally {
        setup.cleanup();
      }
    });
  });

  describe("Edge Cases", () => {
    it("handles rapid concurrent edits at same position", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 10 }),
          async (strings) => {
            const docId = `rapid-edit-${Date.now()}-${Math.random()}`;
            const setup = createTwoClientSetup(docId);

            try {
              await setup.manager1.start();
              await setup.manager2.start();

              const text1 = setup.runtime1.doc.getText("content");
              const text2 = setup.runtime2.doc.getText("content");

              // Both clients insert at position 0 rapidly
              for (let i = 0; i < strings.length; i++) {
                if (i % 2 === 0) {
                  text1.insert(0, strings[i]);
                  setup.runtime1.doc.commit({ origin: "test" });
                } else {
                  text2.insert(0, strings[i]);
                  setup.runtime2.doc.commit({ origin: "test" });
                }
              }

              // Exchange updates
              const update1 = setup.runtime1.doc.export({ mode: "update" });
              const update2 = setup.runtime2.doc.export({ mode: "update" });
              setup.runtime1.doc.import(update2);
              setup.runtime2.doc.import(update1);

              // Verify convergence
              const content1 = getTextContent(setup.runtime1.doc);
              const content2 = getTextContent(setup.runtime2.doc);

              expect(content1).toBe(content2);
              // All strings should be present
              for (const s of strings) {
                expect(content1).toContain(s);
              }
            } finally {
              setup.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("handles delete-insert conflicts", async () => {
      const docId = "delete-insert-conflict";
      const setup = createTwoClientSetup(docId);

      try {
        await setup.manager1.start();
        await setup.manager2.start();

        const text1 = setup.runtime1.doc.getText("content");
        const text2 = setup.runtime2.doc.getText("content");

        // Set up initial content
        text1.insert(0, "ABCDE");
        setup.runtime1.doc.commit({ origin: "test" });

        // Sync
        const initialUpdate = setup.runtime1.doc.export({ mode: "update" });
        setup.runtime2.doc.import(initialUpdate);

        // Disconnect for concurrent edits
        setup.adapter1.disconnect();
        setup.adapter2.disconnect();

        // Client 1 deletes "BCD"
        text1.delete(1, 3);
        setup.runtime1.doc.commit({ origin: "test" });

        // Client 2 inserts "X" at position 2 (inside the deleted range)
        text2.insert(2, "X");
        setup.runtime2.doc.commit({ origin: "test" });

        // Exchange updates
        const update1 = setup.runtime1.doc.export({ mode: "update" });
        const update2 = setup.runtime2.doc.export({ mode: "update" });
        setup.runtime1.doc.import(update2);
        setup.runtime2.doc.import(update1);

        // Verify convergence (exact content depends on CRDT semantics)
        const content1 = getTextContent(setup.runtime1.doc);
        const content2 = getTextContent(setup.runtime2.doc);

        expect(content1).toBe(content2);
      } finally {
        setup.cleanup();
      }
    });
  });
});
