import type { PolicyManifestV09, TokenRange } from "@keepup/core";
import { describe, expect, test, vi } from "vitest";
import {
  type BridgeAnnotation,
  createDegradationContext,
  transitionDegradationState,
} from "../degradationStateMachine";

describe("Degradation State Machine", () => {
  const mockRange: TokenRange = { startTokenId: "token-start", endTokenId: "token-end" };
  const mockAnnotations: BridgeAnnotation[] = [
    {
      id: "a1",
      kind: "highlight",
      range: mockRange,
      createdAtMs: 0,
      status: { state: "active" },
      chain: {
        policy: { kind: "bounded_gap", max_intervening_blocks: 2 },
        order: ["b1", "b5"],
      },
    },
  ];

  const mockManifest: PolicyManifestV09 = {
    v: 9,
    capabilities: {
      cross_block_annotations: true,
      bounded_gap: true,
      tables: false,
      reorder_blocks: false,
      ai_replace_spans: false,
    },
    chain_policy: {
      version: "v5",
      defaults: {
        highlight: { kind: "strict_adjacency", max_intervening_blocks: 0 },
      },
    },
  } as unknown as PolicyManifestV09;

  test("transitions from negotiating to validating on policy mismatch", () => {
    const context = createDegradationContext(mockAnnotations);
    const onStateChange = vi.fn();
    const onNotification = vi.fn();

    const updatedContext = {
      ...context,
      onStateChange,
      onNotification,
    };

    const newContext = transitionDegradationState(updatedContext, {
      type: "POLICY_MISMATCH_DETECTED",
      currentManifest: mockManifest,
      effectiveManifest: mockManifest,
    });

    expect(newContext.state.type).toBe("validating");
    if (newContext.state.type === "validating") {
      expect(newContext.state.migrationPlan).toBeDefined();
      expect(onStateChange).toHaveBeenCalled();
    }
  });

  test("calls notification when >10% affected", () => {
    const manyAnnotations: BridgeAnnotation[] = Array.from({ length: 100 }, (_, i) => ({
      id: `a${i}`,
      kind: "highlight",
      range: mockRange,
      createdAtMs: 0,
      status: { state: "active" },
      chain: {
        policy: { kind: "bounded_gap", max_intervening_blocks: 2 },
        order: ["b1", "b5"],
      },
    }));

    const context = createDegradationContext(manyAnnotations);
    const onNotification = vi.fn();

    const updatedContext = {
      ...context,
      onNotification,
    };

    transitionDegradationState(updatedContext, {
      type: "POLICY_MISMATCH_DETECTED",
      currentManifest: mockManifest,
      effectiveManifest: mockManifest,
    });

    // Should call notification if >10% affected
    expect(onNotification).toHaveBeenCalled();
  });

  test("transitions from validating to migrating on approval", () => {
    const context = createDegradationContext(mockAnnotations);
    const validatingState = {
      type: "validating" as const,
      migrationPlan: {
        affectedAnnotations: ["a1"],
        migrationPlan: [],
      },
      requiresConfirmation: false,
    };

    const newContext = transitionDegradationState(
      { ...context, state: validatingState },
      { type: "MIGRATION_APPROVED" }
    );

    expect(newContext.state.type).toBe("migrating");
  });

  test("transitions from validating to rejected on rejection", () => {
    const context = createDegradationContext(mockAnnotations);
    const validatingState = {
      type: "validating" as const,
      migrationPlan: {
        affectedAnnotations: ["a1"],
        migrationPlan: [],
      },
      requiresConfirmation: false,
    };

    const newContext = transitionDegradationState(
      { ...context, state: validatingState },
      { type: "MIGRATION_REJECTED" }
    );

    expect(newContext.state.type).toBe("rejected");
  });

  test("transitions from migrating to completed", () => {
    const context = createDegradationContext(mockAnnotations);
    const migratingState = {
      type: "migrating" as const,
      migrationPlan: {
        affectedAnnotations: ["a1"],
        migrationPlan: [],
      },
    };

    const newContext = transitionDegradationState(
      { ...context, state: migratingState },
      { type: "MIGRATION_COMPLETED" }
    );

    expect(newContext.state.type).toBe("completed");
  });
});
