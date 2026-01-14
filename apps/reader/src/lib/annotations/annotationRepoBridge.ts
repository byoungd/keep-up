import type { DisplayAnnoState, StoredAnnoState } from "@ku0/core";
import {
  type AnnotationRecord,
  type AnnotationRepo,
  type ChainPolicy,
  type LoroRuntime,
  type SpanChainPolicy,
  type SpanList,
  type VerificationState,
  createAnnotationRepo,
} from "@ku0/lfcc-bridge";

import { absoluteFromAnchor, anchorFromAbsolute } from "@/lib/kernel/anchors";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation, AnnotationColor } from "@/lib/kernel/types";
import { isVerifiedDisplayState } from "./verification";

let repo: AnnotationRepo | null = null;
let unsubscribe: (() => void) | null = null;
let hasMigrated = false;

export function attachAnnotationRepo(runtime: LoroRuntime): AnnotationRepo {
  if (repo) {
    return repo;
  }

  repo = createAnnotationRepo(runtime, { originTag: "lfcc:annotations" });
  if (!hasMigrated) {
    migrateLocalAnnotations(repo);
    hasMigrated = true;
  }

  syncAnnotationCache(repo.list());
  unsubscribe = repo.subscribe(() => {
    if (!repo) {
      return;
    }
    syncAnnotationCache(repo.list());
  });

  return repo;
}

export function detachAnnotationRepo(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  repo = null;
  hasMigrated = false;
}

export function getAnnotationRepo(): AnnotationRepo | null {
  return repo;
}

function syncAnnotationCache(records: AnnotationRecord[]): void {
  const annotations: Record<string, Annotation> = {};
  for (const record of records) {
    const annotation = recordToAnnotation(record);
    if (!annotation) {
      continue;
    }
    annotations[annotation.id] = annotation;
  }
  useAnnotationStore.getState().setAnnotations(annotations);
}

function migrateLocalAnnotations(annotationRepo: AnnotationRepo): void {
  const localAnnotations = Object.values(useAnnotationStore.getState().annotations);
  if (localAnnotations.length === 0) {
    return;
  }

  const existingIds = new Set(annotationRepo.list().map((record) => record.annotationId));
  for (const annotation of localAnnotations) {
    if (existingIds.has(annotation.id)) {
      continue;
    }
    const record = annotationToRecord(annotation);
    if (record) {
      annotationRepo.create(record);
    }
  }
}

const VALID_COLORS: readonly AnnotationColor[] = ["yellow", "green", "red", "purple"];

function isValidColor(color: string | undefined): color is AnnotationColor {
  return color !== undefined && VALID_COLORS.includes(color as AnnotationColor);
}

function recordToAnnotation(record: AnnotationRecord): Annotation | null {
  if (!record.spanList || record.spanList.length === 0) {
    return null;
  }

  const first = record.spanList[0];
  const last = record.spanList[record.spanList.length - 1];
  if (!first || !last) {
    return null;
  }

  const displayState = mapVerificationToDisplay(record.verificationState);
  const storedState = mapVerificationToStored(record.verificationState);
  const chainPolicy = mapRepoChainPolicy(record.chainPolicy);

  return {
    id: record.annotationId,
    start: anchorFromAbsolute(first.blockId, first.start, "after"),
    end: anchorFromAbsolute(last.blockId, last.end, "before"),
    content: record.content ?? "",
    color: isValidColor(record.color) ? record.color : undefined,
    storedState,
    displayState,
    createdAtMs: record.createdAtMs,
    spans: record.spanList,
    chain: {
      policy: chainPolicy,
      order: record.spanList.map((span) => span.blockId),
    },
    verified: isVerifiedDisplayState(displayState),
  };
}

function annotationToRecord(annotation: Annotation): AnnotationRecord | null {
  const spanList = annotation.spans ?? spansFromAnchors(annotation);
  if (!spanList || spanList.length === 0) {
    return null;
  }

  const chainPolicy = annotation.chain?.policy ?? {
    kind: "required_order",
    maxInterveningBlocks: 0,
  };

  return {
    annotationId: annotation.id,
    kind: "highlight",
    createdAtMs: annotation.createdAtMs,
    updatedAtMs: Date.now(),
    spanList,
    chainPolicy: mapSpanChainPolicy(chainPolicy),
    verificationState: mapDisplayToVerification(annotation.displayState),
    content: annotation.content,
    color: annotation.color,
  };
}

function spansFromAnchors(annotation: Annotation): SpanList | null {
  const start = absoluteFromAnchor(annotation.start);
  const end = absoluteFromAnchor(annotation.end);
  if (!start || !end) {
    return null;
  }
  return [
    {
      blockId: start.blockId,
      start: start.offset,
      end: end.offset,
    },
  ];
}

function mapSpanChainPolicy(policy: SpanChainPolicy): ChainPolicy {
  if (policy.kind === "bounded_gap") {
    return { mode: "bounded_gap", gap: policy.maxInterveningBlocks };
  }
  if (policy.kind === "strict_adjacency") {
    return { mode: "strict_adjacency", gap: policy.maxInterveningBlocks };
  }
  return { mode: "required_order", gap: policy.maxInterveningBlocks };
}

function mapRepoChainPolicy(policy: ChainPolicy): SpanChainPolicy {
  return {
    kind:
      policy.mode === "bounded_gap"
        ? "bounded_gap"
        : policy.mode === "strict_adjacency"
          ? "strict_adjacency"
          : "required_order",
    maxInterveningBlocks: policy.gap ?? 0,
  };
}

function mapVerificationToDisplay(state: VerificationState): DisplayAnnoState {
  switch (state) {
    case "active":
    case "active_partial":
    case "active_unverified":
    case "broken_grace":
    case "orphan":
      return state;
  }
}

function mapDisplayToVerification(state: DisplayAnnoState): VerificationState {
  switch (state) {
    case "active":
      return "active";
    case "active_partial":
      return "active_partial";
    case "active_unverified":
      return "active_unverified";
    case "broken_grace":
      return "broken_grace";
    case "orphan":
      return "orphan";
  }
}

function mapVerificationToStored(state: VerificationState): StoredAnnoState {
  switch (state) {
    case "active":
    case "active_unverified":
      return "active";
    case "active_partial":
      return "active_partial";
    case "broken_grace":
    case "orphan":
      return "orphan";
  }
}
