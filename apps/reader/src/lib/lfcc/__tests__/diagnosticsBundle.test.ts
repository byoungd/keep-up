import { describe, expect, it, vi } from "vitest";

import type { Annotation } from "@/lib/kernel/types";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import { createDiagnosticsBundle } from "@/lib/lfcc/diagnosticsBundle";
import type { DirtyInfoEntry, ReproErrorEntry } from "@/lib/lfcc/reproBundle";
import type { LoroRuntime } from "@keepup/lfcc-bridge";

describe("diagnosticsBundle", () => {
  it("builds a stable diagnostics bundle snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const runtime = {
      frontiers: ["f-1"],
      versionVector: { a: 1 },
    } as unknown as LoroRuntime;

    const annotations: Annotation[] = [
      {
        id: "anno-1",
        start: "anchor-start",
        end: "anchor-end",
        content: "Short note",
        color: "yellow",
        storedState: "active",
        displayState: "active_unverified",
        createdAtMs: 0,
        spans: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        verified: false,
      },
    ];

    const dirtyInfo: DirtyInfoEntry[] = [
      { timestamp: 1, info: { opCodes: ["OP_TEXT_EDIT"], touchedBlocks: ["b1"] } },
    ];

    const errors: ReproErrorEntry[] = [];

    const syncSummary: DiagnosticsSyncSummary = {
      state: "connected",
      error: null,
      pendingUpdates: 0,
      lastSyncAt: 10,
      docId: "doc-1",
      clientId: "client-1",
      sessionId: "session-1",
      peers: [],
      effectiveManifest: { policy_id: "default" },
    };

    const bundle = createDiagnosticsBundle({
      runtime,
      annotations,
      dirtyInfo,
      errors,
      syncSummary,
      includeContent: false,
      environment: {
        userAgent: "unit-test",
        platform: "test",
        language: "en",
        buildHash: "hash-1",
      },
    });

    expect(bundle).toMatchSnapshot();
    vi.useRealTimers();
  });

  it("caps ops and annotations and redacts large payloads", () => {
    const runtime = {
      frontiers: ["f-1"],
      versionVector: { a: 1 },
    } as unknown as LoroRuntime;

    const annotations: Annotation[] = Array.from({ length: 60 }, (_, index) => ({
      id: `anno-${index}`,
      start: "anchor-start",
      end: "anchor-end",
      content: `Note ${index}`.repeat(20),
      color: "yellow",
      storedState: "active",
      displayState: "active_partial",
      createdAtMs: 0,
      spans: [{ blockId: "b1", start: 0, end: 5 }],
      chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
      verified: false,
    }));

    const dirtyInfo: DirtyInfoEntry[] = Array.from({ length: 40 }, (_value, index) => ({
      timestamp: index,
      info: {
        opCodes: ["OP_TEXT_EDIT"],
        touchedBlocks: [`b-${index}`],
        touchedRanges: [{ blockId: `b-${index}`, start: 0, end: 1 }],
      },
    }));

    const errors: ReproErrorEntry[] = Array.from({ length: 30 }, (_value, index) => ({
      timestamp: index,
      code: "ERR",
      message: "Failure",
      payload: "x".repeat(500),
    }));

    const bundle = createDiagnosticsBundle({
      runtime,
      annotations,
      dirtyInfo,
      errors,
      includeContent: false,
      environment: {
        userAgent: "unit-test",
      },
    });

    expect(bundle.annotations).toHaveLength(50);
    expect(bundle.ops).toHaveLength(20);
    expect(bundle.errors).toHaveLength(20);
    expect(bundle.annotations[0]?.content).toBeUndefined();
    expect(bundle.annotations[0]?.contentSummary?.size).toBeGreaterThan(0);
    expect(bundle.errors[0]?.payload).toBeUndefined();
    expect(bundle.errors[0]?.payloadSummary?.size).toBeGreaterThan(0);
  });

  it("includes content when includeContent is enabled", () => {
    const runtime = {
      frontiers: ["f-1"],
      versionVector: { a: 1 },
    } as unknown as LoroRuntime;

    const annotations: Annotation[] = [
      {
        id: "anno-include",
        start: "anchor-start",
        end: "anchor-end",
        content: "Visible content",
        color: "yellow",
        storedState: "active",
        displayState: "active_unverified",
        createdAtMs: 0,
        spans: [{ blockId: "b1", start: 0, end: 5 }],
        chain: { policy: { kind: "required_order", maxInterveningBlocks: 0 }, order: ["b1"] },
        verified: false,
      },
    ];

    const bundle = createDiagnosticsBundle({
      runtime,
      annotations,
      dirtyInfo: [],
      errors: [],
      includeContent: true,
      environment: {
        userAgent: "unit-test",
      },
    });

    expect(bundle.annotations[0]?.content).toBe("Visible content");
    expect(bundle.annotations[0]?.contentSummary).toBeUndefined();
  });
});
