/**
 * LFCC v0.9 RC - Fuzz Testing Framework
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md
 */

import {
  type CanonInputNode,
  canonicalizeDocument,
  stableStringifyCanon,
} from "../canonicalizer/index.js";
import { applyOp } from "../shadow/shadowModel.js";
import type { ShadowBlock, ShadowDocument, TypedOp } from "../shadow/types.js";
import { DEFAULT_FUZZ_CONFIG, createRng, generateOp, randomInt } from "./generators.js";
import {
  advanceNetwork,
  createNetworkSim,
  enqueueNetworkMessage,
  mergeNetworkStats,
  resolveNetworkScenario,
  summarizeNetworkLog,
} from "./networkSim.js";
import type {
  ConvergenceResult,
  FuzzConfig,
  FuzzReproArtifact,
  FuzzRunResult,
  NetworkMessage,
  NetworkStats,
  ReplicaState,
  SECAssertionResult,
  SECFailure,
  TestHarnessState,
} from "./types.js";

/**
 * Create initial test harness state
 */
export function createTestHarness(config: FuzzConfig): TestHarnessState {
  const replicas = new Map<string, ReplicaState>();

  for (let i = 0; i < config.replicas; i++) {
    const id = `replica-${i}`;
    const doc = createInitialDocument();

    replicas.set(id, {
      id,
      document: doc,
      pending_ops: [],
      applied_ops: [],
      canonical_snapshot: null,
      seen_op_ids: new Set<string>(),
    });
  }

  const scenario = resolveNetworkScenario(config);
  const replicaIds = Array.from(replicas.keys());
  const network = createNetworkSim(
    config.seed + 1337,
    scenario,
    replicaIds,
    config.max_message_log
  );

  return {
    replicas,
    network,
    rng_state: config.seed,
    op_history: [],
  };
}

/**
 * Create initial document with some content
 */
function createInitialDocument(): ShadowDocument {
  // IMPORTANT: Use deterministic block IDs for fuzz-test convergence
  const rootId = "fuzz-root-fixed";
  const root: ShadowBlock = {
    id: rootId,
    type: "document",
    attrs: {},
    parent_id: null,
    children_ids: [],
  };

  const blocks = new Map<string, ShadowBlock>();
  blocks.set(rootId, root);

  // Add fixed-id paragraphs
  const p1Id = "fuzz-p1-fixed";
  const p1: ShadowBlock = {
    id: p1Id,
    type: "paragraph",
    attrs: {},
    text: "Hello world",
    parent_id: rootId,
    children_ids: [],
  };
  blocks.set(p1Id, p1);

  const p2Id = "fuzz-p2-fixed";
  const p2: ShadowBlock = {
    id: p2Id,
    type: "paragraph",
    attrs: {},
    text: "This is a test document",
    parent_id: rootId,
    children_ids: [],
  };
  blocks.set(p2Id, p2);

  // Update root's children
  blocks.set(rootId, { ...root, children_ids: [p1Id, p2Id] });

  return {
    root_id: rootId,
    blocks,
    block_order: [p1Id, p2Id],
  };
}

/**
 * Apply operation to a replica
 */
function applyToReplica(replica: ReplicaState, op: TypedOp): ReplicaState {
  const { doc } = applyOp(replica.document, op);
  return {
    ...replica,
    document: doc,
    applied_ops: [...replica.applied_ops, op],
  };
}

function markOpSeen(replica: ReplicaState, opId: string): ReplicaState {
  const seen = new Set(replica.seen_op_ids);
  seen.add(opId);
  return { ...replica, seen_op_ids: seen };
}

/**
 * Get canonical hash for a document
 */
function mapBlockTypeToTag(type: string): string {
  switch (type) {
    case "document":
      return "doc";
    case "paragraph":
      return "p";
    case "heading":
      return "h1";
    case "list":
      return "ul";
    case "list_item":
      return "li";
    case "quote":
      return "blockquote";
    case "code":
    case "code_block":
      return "pre";
    case "table":
      return "table";
    case "table_row":
      return "tr";
    case "table_cell":
      return "td";
    default:
      return "p";
  }
}

function mapTagToBlockType(tag: string, _attrs: Record<string, string>): string | null {
  switch (tag.toLowerCase()) {
    case "doc":
      return "document";
    case "p":
    case "div":
      return "paragraph";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "list_item";
    case "table":
      return "table";
    case "tr":
      return "table_row";
    case "td":
    case "th":
      return "table_cell";
    case "blockquote":
      return "quote";
    case "pre":
      return "code_block";
    default:
      return null;
  }
}

function coerceAttrs(attrs: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    }
  }
  return result;
}

function buildTextChildren(text: string | undefined): CanonInputNode[] {
  if (!text) {
    return [];
  }
  return [{ kind: "text", text }];
}

function shadowBlockToCanonInput(
  doc: ShadowDocument,
  blockId: string,
  visited: Set<string>
): CanonInputNode | null {
  if (visited.has(blockId)) {
    return null;
  }
  const block = doc.blocks.get(blockId);
  if (!block) {
    return null;
  }
  visited.add(blockId);

  const children = block.children_ids
    .map((childId) => shadowBlockToCanonInput(doc, childId, visited))
    .filter((child): child is CanonInputNode => !!child);

  return {
    kind: "element",
    tag: mapBlockTypeToTag(block.type),
    attrs: coerceAttrs(block.attrs ?? {}),
    children: children.length > 0 ? children : buildTextChildren(block.text),
  };
}

function shadowDocToCanonInput(doc: ShadowDocument): CanonInputNode {
  const visited = new Set<string>();
  const root = doc.blocks.get(doc.root_id);
  const ordered = root?.children_ids?.length ? root.children_ids : doc.block_order;
  const children = ordered
    .map((blockId) => shadowBlockToCanonInput(doc, blockId, visited))
    .filter((child): child is CanonInputNode => !!child);

  return {
    kind: "element",
    tag: "doc",
    attrs: {},
    children,
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function getCanonicalHash(doc: ShadowDocument): string {
  const input = shadowDocToCanonInput(doc);
  const canonical = canonicalizeDocument({ root: input, mapTagToBlockType }).root;
  const stable = stableStringifyCanon(canonical);
  return hashString(stable);
}

function createEmptyNetworkStats(): NetworkStats {
  return {
    queued: 0,
    delivered: 0,
    dropped: 0,
    duplicated: 0,
    delayed: 0,
    partition_blocked: 0,
  };
}

/**
 * Check if all replicas have converged
 */
export function checkConvergence(harness: TestHarnessState): ConvergenceResult {
  const hashes = new Map<string, string>();

  for (const [id, replica] of harness.replicas) {
    hashes.set(id, getCanonicalHash(replica.document));
  }

  const uniqueHashes = new Set(hashes.values());

  if (uniqueHashes.size === 1) {
    return {
      converged: true,
      replicas_checked: harness.replicas.size,
      canonical_hashes: hashes,
    };
  }

  // Find first divergence
  const entries = Array.from(hashes.entries());
  for (let i = 0; i < entries.length - 1; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i][1] !== entries[j][1]) {
        return {
          converged: false,
          replicas_checked: harness.replicas.size,
          canonical_hashes: hashes,
          first_divergence: {
            replica_a: entries[i][0],
            replica_b: entries[j][0],
            diff_path: "root",
          },
        };
      }
    }
  }

  return {
    converged: false,
    replicas_checked: harness.replicas.size,
    canonical_hashes: hashes,
  };
}

function serializeCanonicalHashes(hashes: Map<string, string>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [id, hash] of hashes) {
    record[id] = hash;
  }
  return record;
}

/**
 * Run a single fuzz iteration
 */
function appendOpHistory(history: TypedOp[], op: TypedOp, maxEntries: number): TypedOp[] {
  if (maxEntries <= 0) {
    return history;
  }
  const next = [...history, op];
  if (next.length > maxEntries) {
    next.splice(0, next.length - maxEntries);
  }
  return next;
}

function applyDeliveredMessages(
  replicas: Map<string, ReplicaState>,
  messages: NetworkMessage[]
): Map<string, ReplicaState> {
  const updated = new Map(replicas);
  for (const message of messages) {
    const replica = updated.get(message.to_replica);
    if (!replica) {
      continue;
    }
    if (replica.seen_op_ids.has(message.op_id)) {
      continue;
    }
    const applied = applyToReplica(replica, message.op);
    updated.set(message.to_replica, markOpSeen(applied, message.op_id));
  }
  return updated;
}

function advanceHarnessNetwork(harness: TestHarnessState): TestHarnessState {
  const { sim, deliverable } = advanceNetwork(harness.network);
  const replicas = applyDeliveredMessages(harness.replicas, deliverable);
  return { ...harness, network: sim, replicas };
}

function drainNetwork(harness: TestHarnessState, maxTicks: number): TestHarnessState {
  let current = harness;
  for (let i = 0; i < maxTicks; i++) {
    if (current.network.queue.length === 0) {
      break;
    }
    current = advanceHarnessNetwork(current);
  }
  return current;
}

function attachDeterministicBlockIds(op: TypedOp, opId: string): TypedOp {
  if (op.code === "OP_BLOCK_SPLIT") {
    if (op.new_right_id) {
      return op;
    }
    return { ...op, new_right_id: `block-${opId}-right` };
  }
  if (op.code === "OP_BLOCK_CONVERT") {
    if (op.new_block_id) {
      return op;
    }
    return { ...op, new_block_id: `block-${opId}-convert` };
  }
  return op;
}

export function runFuzzIteration(
  harness: TestHarnessState,
  config: FuzzConfig
): { harness: TestHarnessState; ops_generated: number } {
  let currentHarness = harness;
  let rng = createRng(currentHarness.rng_state);
  let ops_generated = 0;

  for (let i = 0; i < config.ops_per_iteration; i++) {
    // Select random replica to generate op
    const replicaIds = Array.from(currentHarness.replicas.keys());
    const { value: replicaIdx, rng: rng1 } = randomInt(rng, 0, replicaIds.length - 1);
    rng = rng1;

    const replicaId = replicaIds[replicaIdx];
    const replica = currentHarness.replicas.get(replicaId);
    if (!replica) {
      continue;
    }

    // Generate operation
    const { op, rng: rng2 } = generateOp(rng, replica.document, config);
    rng = rng2;

    if (!op) {
      const advanced = advanceHarnessNetwork(currentHarness);
      currentHarness = { ...advanced, rng_state: rng.seed };
      continue;
    }
    ops_generated++;
    const opId = `op-${config.seed}-${ops_generated}-${replicaId}`;
    const opWithIds = attachDeterministicBlockIds(op, opId);

    // Apply to originating replica
    const updatedReplica = markOpSeen(applyToReplica(replica, opWithIds), opId);
    const newReplicas = new Map(currentHarness.replicas);
    newReplicas.set(replicaId, updatedReplica);

    // Broadcast to other replicas (with network simulation)
    let network = currentHarness.network;
    for (const [otherId] of newReplicas) {
      if (otherId === replicaId) {
        continue;
      }
      network = enqueueNetworkMessage(network, replicaId, otherId, opId, opWithIds);
    }

    const opHistory = appendOpHistory(currentHarness.op_history, opWithIds, config.max_op_history);
    const advancedHarness = advanceHarnessNetwork({
      ...currentHarness,
      replicas: newReplicas,
      network,
      op_history: opHistory,
    });

    currentHarness = {
      ...advancedHarness,
      rng_state: rng.seed,
    };
  }

  return { harness: currentHarness, ops_generated };
}

function createReproArtifact(
  harness: TestHarnessState,
  config: FuzzConfig,
  checkpointHashes: Array<{ tick: number; canonical_hashes: Record<string, string> }>
): FuzzReproArtifact {
  return {
    seed: config.seed,
    scenario: harness.network.scenario.name,
    config,
    last_ops: harness.op_history,
    shrunk_ops: null,
    network_log: summarizeNetworkLog(harness.network),
    checkpoint_hashes: checkpointHashes,
  };
}

/**
 * Run a single fuzz scenario and return convergence + repro artifact
 */
export function runFuzz(config: FuzzConfig = DEFAULT_FUZZ_CONFIG): FuzzRunResult {
  const harness = createTestHarness(config);
  const initial = checkConvergence(harness);
  const checkpointHashes = [
    {
      tick: harness.network.time,
      canonical_hashes: serializeCanonicalHashes(initial.canonical_hashes),
    },
  ];
  const { harness: withOps, ops_generated } = runFuzzIteration(harness, config);
  const drained = drainNetwork(withOps, config.max_drain_ticks);
  const convergence = checkConvergence(drained);
  checkpointHashes.push({
    tick: drained.network.time,
    canonical_hashes: serializeCanonicalHashes(convergence.canonical_hashes),
  });

  if (convergence.converged) {
    return {
      passed: true,
      ops_generated,
      scenario: drained.network.scenario.name,
      convergence,
      network_stats: drained.network.stats,
    };
  }

  return {
    passed: false,
    ops_generated,
    scenario: drained.network.scenario.name,
    convergence,
    network_stats: drained.network.stats,
    repro_artifact: createReproArtifact(drained, config, checkpointHashes),
  };
}

/**
 * Run SEC (Strong Eventual Consistency) assertion test
 */
export function runSECAssertion(config: FuzzConfig = DEFAULT_FUZZ_CONFIG): SECAssertionResult {
  const failures: SECFailure[] = [];
  let networkStats = createEmptyNetworkStats();
  const scenarioName = resolveNetworkScenario(config).name;

  for (let iteration = 0; iteration < config.iterations; iteration++) {
    const iterationSeed = config.seed + iteration;
    const iterationConfig = { ...config, seed: iterationSeed };

    const result = runFuzz(iterationConfig);
    networkStats = mergeNetworkStats(networkStats, result.network_stats);

    if (!result.convergence.converged) {
      failures.push({
        iteration,
        ops_applied: result.ops_generated,
        failure_type: "divergence",
        details: `Replicas diverged: ${result.convergence.first_divergence?.replica_a} vs ${result.convergence.first_divergence?.replica_b}`,
        replay_seed: iterationSeed,
        scenario: result.scenario,
        repro_artifact: result.repro_artifact,
      });

      // Stop early if too many failures
      if (failures.length >= 10) {
        break;
      }
    }
  }

  return {
    passed: failures.length === 0,
    iterations_run: config.iterations,
    failures,
    seed: config.seed,
    scenario: scenarioName,
    network_stats: networkStats,
  };
}

/**
 * Format SEC assertion result for display
 */
export function formatSECResult(result: SECAssertionResult): string {
  const lines: string[] = [
    "=== SEC Assertion Result ===",
    `Status: ${result.passed ? "PASSED" : "FAILED"}`,
    `Iterations: ${result.iterations_run}`,
    `Seed: ${result.seed}`,
    `Scenario: ${result.scenario}`,
    `Network: queued=${result.network_stats.queued} delivered=${result.network_stats.delivered} dropped=${result.network_stats.dropped} duplicated=${result.network_stats.duplicated} delayed=${result.network_stats.delayed} blocked=${result.network_stats.partition_blocked}`,
  ];

  if (result.failures.length > 0) {
    lines.push("", "--- Failures ---");
    for (const f of result.failures) {
      lines.push(`  Iteration ${f.iteration}: ${f.failure_type}`);
      lines.push(`    ${f.details}`);
      lines.push(`    Replay seed: ${f.replay_seed}`);
    }
  }

  return lines.join("\n");
}
