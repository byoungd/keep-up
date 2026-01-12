import {
  type BlockNode,
  type LoroRuntime,
  type SpanList,
  createAnnotationRepo,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";

export function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(
      16
    )
  );
}

export type LiquidRefactorSeedAnnotation = {
  spans: Array<{ blockIndex: number; text: string }>;
  color?: "yellow" | "green" | "red" | "purple";
  comments?: string[];
};

export const LIQUID_REFACTOR_SEED = {
  blocks: [
    "Project Sync - Meeting Notes (Liquid Refactor Demo)",
    "Date: 2025-02-12 | Attendees: Alex, Mia, Jun",
    "Goal: align on onboarding redesign and QA automation.",
    "Action: Update onboarding copy (owner: Alex, due: Fri).",
    "Action: Instrument funnel metrics (owner: Mia, due: Tue).",
    "Action: Fix flaky tests in Loro adapter (owner: Jun, due: Mon).",
    "Decision: Keep strict mapping; reject ambiguous refactors.",
    "Open question: Should we split docs by team?",
  ],
  annotations: [
    {
      spans: [
        { blockIndex: 3, text: "Update onboarding copy" },
        { blockIndex: 4, text: "Instrument funnel metrics" },
      ],
      color: "yellow",
      comments: ["Track this through the new onboarding funnel review."],
    },
    {
      spans: [{ blockIndex: 5, text: "Jun" }],
      color: "green",
    },
    {
      spans: [{ blockIndex: 6, text: "strict mapping" }],
      color: "red",
      comments: ["Fail closed if mapping is ambiguous."],
    },
  ] satisfies LiquidRefactorSeedAnnotation[],
} as const;

function buildSeedBlockId(prefix: string, index: number): string {
  return `seed-${prefix}-${String(index + 1).padStart(4, "0")}`;
}

function buildSeedAnnotationId(prefix: string, index: number): string {
  return `seed-${prefix}-anno-${String(index + 1).padStart(4, "0")}`;
}

function buildSeedBlocks(texts: readonly string[], prefix: string): BlockNode[] {
  const attrs = serializeAttrs({});
  return texts.map((text, index) => ({
    id: buildSeedBlockId(prefix, index),
    type: "paragraph",
    attrs,
    text,
    children: [],
  }));
}

function buildLiquidRefactorSpanList(seed: LiquidRefactorSeedAnnotation): SpanList | null {
  const spans: SpanList = [];
  for (const span of seed.spans) {
    const blockText = LIQUID_REFACTOR_SEED.blocks[span.blockIndex];
    if (!blockText) {
      continue;
    }
    const start = blockText.indexOf(span.text);
    if (start < 0) {
      continue;
    }
    spans.push({
      blockId: buildSeedBlockId("liquid", span.blockIndex),
      start,
      end: start + span.text.length,
    });
  }

  return spans.length > 0 ? spans : null;
}

function seedLiquidRefactorAnnotations(runtime: LoroRuntime): void {
  const repo = createAnnotationRepo(runtime, { originTag: "lfcc:seed" });
  const now = Date.now();

  LIQUID_REFACTOR_SEED.annotations.forEach((seed, index) => {
    const spanList = buildLiquidRefactorSpanList(seed);
    if (!spanList) {
      return;
    }

    repo.create({
      annotationId: buildSeedAnnotationId("liquid", index),
      kind: "highlight",
      createdAtMs: now,
      updatedAtMs: now,
      spanList,
      chainPolicy: { mode: "required_order", gap: 0 },
      verificationState: "active",
      content: seed.comments?.[0] ?? "",
      color: seed.color,
    });
  });
}

type SeederOptions = {
  /** When set, cap rendered blocks to this value (used for virtualization/perf) */
  virtualizeLimit?: number;
};

export function createLfccSeeder(seed?: number | "liquid-refactor", options?: SeederOptions) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Seeder handles multiple seed modes and query params
  return (runtime: LoroRuntime) => {
    const isLiquidRefactorSeed = seed === "liquid-refactor";
    if (seed === 0 || seed === ("none" as unknown)) {
      return;
    }
    // Explicit count or check legacy window flag
    const explicitCount = typeof seed === "number" ? seed : undefined;
    const legacyFlag =
      typeof window !== "undefined" &&
      (window as { __LFCC_PERF_SEED__?: boolean }).__LFCC_PERF_SEED__ === true;

    const virtualizeLimit = options?.virtualizeLimit;
    const queryLimit =
      typeof window !== "undefined"
        ? (() => {
            try {
              const params = new URLSearchParams(window.location.search);
              const virtualFlag = params.get("virtual") || params.get("virtualize");
              if (virtualFlag === "1" || virtualFlag === "true") {
                const qLimit = params.get("virtual_limit");
                return qLimit ? Number(qLimit) : 5000;
              }
            } catch {
              // ignore
            }
            return undefined;
          })()
        : undefined;

    const effectiveLimit = queryLimit ?? virtualizeLimit;

    if (explicitCount || legacyFlag) {
      const requested = explicitCount || 1000;
      const count =
        typeof effectiveLimit === "number" ? Math.min(requested, effectiveLimit) : requested;
      const blocks: BlockNode[] = Array.from({ length: count }, (_, index) => {
        const text = `Perf block ${String(index + 1).padStart(5, "0")} - LFCC benchmark content. The quick brown fox jumps over the lazy dog to test text rendering and CRDT overhead.`;
        return {
          id: buildSeedBlockId("perf", index),
          type: "paragraph",
          attrs: serializeAttrs({}),
          text,
          children: [],
        };
      });

      writeBlockTree(runtime.doc, blocks);
      if (effectiveLimit && requested > effectiveLimit) {
        console.warn(
          `[LFCC] Virtualized seeding enabled: requested ${requested} blocks, capped to ${effectiveLimit}`
        );
      }
      return;
    }

    if (isLiquidRefactorSeed) {
      const blocks = buildSeedBlocks(LIQUID_REFACTOR_SEED.blocks, "liquid");

      writeBlockTree(runtime.doc, blocks);
      seedLiquidRefactorAnnotations(runtime);
      return;
    }

    const blocks = buildSeedBlocks(
      [
        "LFCC anchors survive edits inside a block without guessing.",
        "Multi-block spans stay ordered and deterministically degrade to partial.",
        "Drag the handles to update the range or split a block to see partial/orphan behavior.",
      ],
      "demo"
    );

    writeBlockTree(runtime.doc, blocks);
  };
}

// Default export for backward compatibility if needed, though we'll update LfccDemo
export const seedLfccDemoDoc = createLfccSeeder();
