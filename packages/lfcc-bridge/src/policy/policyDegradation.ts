import type {
  ChainKind,
  ChainPolicy,
  PartialBehavior,
  PartialPolicy,
  PolicyManifestV09,
} from "@keepup/core";

export type DegradationStep = {
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
};

export type DegradationPath = {
  degraded: boolean;
  steps: DegradationStep[];
  effective: PolicyManifestV09;
};

const CHAIN_ORDER: ChainKind[] = ["strict_adjacency", "bounded_gap", "required_order"];
const PARTIAL_ORDER: PartialBehavior[] = ["none", "allow_drop_tail", "allow_islands"];

const HARD_REFUSAL_FIELDS = new Set([
  "coords.kind",
  "anchor_encoding.version",
  "anchor_encoding.format",
  "structure_mode",
  "block_id_policy.version",
  "canonicalizer_policy.version",
  "history_policy.version",
  "relocation_policy.version",
]);

const DEGRADABLE_FIELDS = new Set(["chain_policy", "partial_policy", "history_policy"]);

export function canDegrade(field: string): boolean {
  if (HARD_REFUSAL_FIELDS.has(field)) {
    return false;
  }
  return DEGRADABLE_FIELDS.has(field);
}

export function degradationPath(
  preferred: PolicyManifestV09,
  effective: PolicyManifestV09
): DegradationPath {
  const steps: DegradationStep[] = [];

  steps.push(...collectChainDegradation(preferred.chain_policy, effective.chain_policy));
  steps.push(...collectPartialDegradation(preferred.partial_policy, effective.partial_policy));
  steps.push(...collectHistoryDegradation(preferred.history_policy, effective.history_policy));

  return {
    degraded: steps.length > 0,
    steps,
    effective,
  };
}

function collectChainDegradation(
  preferred: ChainPolicy,
  effective: ChainPolicy
): DegradationStep[] {
  const steps: DegradationStep[] = [];

  const kinds = new Set([...Object.keys(preferred.defaults), ...Object.keys(effective.defaults)]);

  for (const kind of kinds) {
    const preferredEntry = preferred.defaults[kind];
    const effectiveEntry = effective.defaults[kind];
    if (!preferredEntry || !effectiveEntry) {
      continue;
    }

    const preferredIdx = CHAIN_ORDER.indexOf(preferredEntry.kind);
    const effectiveIdx = CHAIN_ORDER.indexOf(effectiveEntry.kind);

    const becameMoreRestrictive =
      effectiveIdx !== -1 && preferredIdx !== -1 && effectiveIdx < preferredIdx;

    const stricterGap =
      effectiveEntry.kind === "bounded_gap" &&
      preferredEntry.kind === "bounded_gap" &&
      effectiveEntry.max_intervening_blocks < preferredEntry.max_intervening_blocks;

    if (becameMoreRestrictive || stricterGap) {
      steps.push({
        field: `chain_policy.defaults.${kind}`,
        from: preferredEntry,
        to: effectiveEntry,
        reason: becameMoreRestrictive
          ? `Degraded chain policy for ${kind}: ${preferredEntry.kind} -> ${effectiveEntry.kind}`
          : `Reduced max_intervening_blocks for ${kind}: ${preferredEntry.max_intervening_blocks} -> ${effectiveEntry.max_intervening_blocks}`,
      });
    }
  }

  return steps;
}

function collectPartialDegradation(
  preferred: PartialPolicy,
  effective: PartialPolicy
): DegradationStep[] {
  const steps: DegradationStep[] = [];
  const kinds = new Set([...Object.keys(preferred.defaults), ...Object.keys(effective.defaults)]);

  for (const kind of kinds) {
    const preferredBehavior = preferred.defaults[kind];
    const effectiveBehavior = effective.defaults[kind];
    if (!preferredBehavior || !effectiveBehavior) {
      continue;
    }

    const preferredIdx = PARTIAL_ORDER.indexOf(preferredBehavior);
    const effectiveIdx = PARTIAL_ORDER.indexOf(effectiveBehavior);
    if (effectiveIdx !== -1 && preferredIdx !== -1 && effectiveIdx < preferredIdx) {
      steps.push({
        field: `partial_policy.defaults.${kind}`,
        from: preferredBehavior,
        to: effectiveBehavior,
        reason: `Partial policy tightened for ${kind}: ${preferredBehavior} -> ${effectiveBehavior}`,
      });
    }
  }

  return steps;
}

function collectHistoryDegradation(
  preferred: PolicyManifestV09["history_policy"],
  effective: PolicyManifestV09["history_policy"]
): DegradationStep[] {
  const steps: DegradationStep[] = [];

  if (preferred.trusted_local_undo && !effective.trusted_local_undo) {
    steps.push({
      field: "history_policy.trusted_local_undo",
      from: preferred.trusted_local_undo,
      to: effective.trusted_local_undo,
      reason: "Trusted local undo disabled in effective policy",
    });
  }

  if (preferred.restore_skip_grace && !effective.restore_skip_grace) {
    steps.push({
      field: "history_policy.restore_skip_grace",
      from: preferred.restore_skip_grace,
      to: effective.restore_skip_grace,
      reason: "Grace timer enforced on history restore",
    });
  }

  return steps;
}
