/**
 * LFCC v0.9 RC - Deterministic Network Simulator
 */

import type { TypedOp } from "../shadow/types";
import { type RngState, createRng, nextRandom, randomInt } from "./generators";
import type {
  FuzzConfig,
  NetworkLogEntry,
  NetworkLogSummary,
  NetworkMessage,
  NetworkPartitionEvent,
  NetworkScenario,
  NetworkScenarioName,
  NetworkSimState,
  NetworkStats,
} from "./types";

const DEFAULT_STATS: NetworkStats = {
  queued: 0,
  delivered: 0,
  dropped: 0,
  duplicated: 0,
  delayed: 0,
  partition_blocked: 0,
};

const BASELINE_SCENARIO: NetworkScenario = {
  name: "baseline",
  description: "No delay, no reordering, no drops.",
  delay_range: [0, 0],
  reorder_probability: 0,
  drop_probability: 0,
  duplicate_probability: 0,
  partition_schedule: [],
};

export const NETWORK_SCENARIOS: Record<NetworkScenarioName, NetworkScenario> = {
  baseline: BASELINE_SCENARIO,
  "high-delay-reorder": {
    name: "high-delay-reorder",
    description: "High latency with aggressive reordering.",
    delay_range: [20, 200],
    reorder_probability: 0.6,
    drop_probability: 0,
    duplicate_probability: 0,
    partition_schedule: [],
  },
  "partition-heal": {
    name: "partition-heal",
    description: "Partition the mesh and heal later.",
    delay_range: [5, 80],
    reorder_probability: 0.2,
    drop_probability: 0,
    duplicate_probability: 0,
    partition_schedule: [
      { at_tick: 5, action: "partition" },
      { at_tick: 25, action: "heal" },
    ],
  },
  "drop-duplicate": {
    name: "drop-duplicate",
    description: "Transient drops with duplicate delivery.",
    delay_range: [0, 60],
    reorder_probability: 0.2,
    drop_probability: 0.25,
    duplicate_probability: 0.35,
    partition_schedule: [],
    drop_mode: "retry",
  },
  "long-partition": {
    name: "long-partition",
    description: "Isolate replica-0 for an extended partition window.",
    delay_range: [5, 120],
    reorder_probability: 0.15,
    drop_probability: 0,
    duplicate_probability: 0,
    partition_schedule: [
      {
        at_tick: 3,
        action: "partition",
        groups: [["replica-0"], ["replica-1", "replica-2", "replica-3"]],
      },
      { at_tick: 60, action: "heal" },
    ],
  },
  "asymmetric-drop": {
    name: "asymmetric-drop",
    description: "A→B drops while B→A delivers.",
    delay_range: [0, 40],
    reorder_probability: 0.2,
    drop_probability: 0,
    duplicate_probability: 0,
    partition_schedule: [],
    link_drop_overrides: [{ from: "replica-0", to: "replica-1", drop_probability: 0.8 }],
    drop_mode: "retry",
  },
  "burst-delay-reorder": {
    name: "burst-delay-reorder",
    description: "Bursty high delay with reordering.",
    delay_range: [0, 30],
    reorder_probability: 0.5,
    drop_probability: 0,
    duplicate_probability: 0.2,
    partition_schedule: [],
    delay_bursts: [
      { start_tick: 5, end_tick: 12, delay_range: [200, 400] },
      { start_tick: 20, end_tick: 28, delay_range: [120, 240] },
    ],
  },
  custom: {
    ...BASELINE_SCENARIO,
    name: "custom",
    description: "Custom scenario from config.",
  },
};

export function resolveNetworkScenario(config: FuzzConfig): NetworkScenario {
  if (config.scenario && config.scenario !== "custom" && NETWORK_SCENARIOS[config.scenario]) {
    return NETWORK_SCENARIOS[config.scenario];
  }

  return {
    name: "custom",
    description: "Custom scenario from config.",
    delay_range: config.network_delay_range,
    reorder_probability: config.reorder_probability,
    drop_probability: config.drop_probability,
    duplicate_probability: config.duplicate_probability,
    partition_schedule: config.partition_schedule,
    link_drop_overrides: config.link_drop_overrides ?? [],
    delay_bursts: config.delay_bursts ?? [],
  };
}

export function createNetworkSim(
  seed: number,
  scenario: NetworkScenario,
  replicaIds: string[],
  maxLogEntries: number
): NetworkSimState {
  return {
    scenario,
    replica_ids: replicaIds,
    time: 0,
    queue: [],
    stats: { ...DEFAULT_STATS },
    log: [],
    max_log_entries: maxLogEntries,
    partitioned_links: new Set<string>(),
    partition_schedule_index: 0,
    rng_state: seed,
    message_seq: 0,
  };
}

function linkKey(from: string, to: string): string {
  return `${from}::${to}`;
}

function appendLog(
  log: NetworkLogEntry[],
  entry: NetworkLogEntry,
  maxLogEntries: number
): NetworkLogEntry[] {
  if (maxLogEntries <= 0) {
    return log;
  }
  const next = [...log, entry];
  if (next.length > maxLogEntries) {
    next.splice(0, next.length - maxLogEntries);
  }
  return next;
}

function createMessageId(sim: NetworkSimState): { id: string; nextSeq: number } {
  return { id: `msg-${sim.time}-${sim.message_seq}`, nextSeq: sim.message_seq + 1 };
}

function withQueuedMessage(
  sim: NetworkSimState,
  message: Omit<NetworkMessage, "id">,
  event: "queued" | "duplicated"
): NetworkSimState {
  const { id, nextSeq } = createMessageId(sim);
  const queue = [...sim.queue, { ...message, id }];
  const delay = Math.max(0, message.deliver_time - message.send_time - 1);

  const stats: NetworkStats = {
    ...sim.stats,
    queued: sim.stats.queued + 1,
    delayed: sim.stats.delayed + (delay > 0 ? 1 : 0),
    duplicated: sim.stats.duplicated + (event === "duplicated" ? 1 : 0),
  };

  const log = appendLog(
    sim.log,
    {
      id,
      from_replica: message.from_replica,
      to_replica: message.to_replica,
      send_time: message.send_time,
      deliver_time: message.deliver_time,
      event,
    },
    sim.max_log_entries
  );

  return {
    ...sim,
    queue,
    stats,
    log,
    message_seq: nextSeq,
  };
}

function resolveDropProbability(sim: NetworkSimState, from: string, to: string): number {
  const overrides = sim.scenario.link_drop_overrides;
  if (!overrides || overrides.length === 0) {
    return sim.scenario.drop_probability;
  }
  for (const override of overrides) {
    if (override.from === from && override.to === to) {
      return override.drop_probability;
    }
  }
  return sim.scenario.drop_probability;
}

function shouldDrop(
  sim: NetworkSimState,
  rng: RngState,
  from: string,
  to: string
): { drop: boolean; rng: RngState } {
  const dropProbability = resolveDropProbability(sim, from, to);
  if (dropProbability <= 0) {
    return { drop: false, rng };
  }
  const { value, rng: nextRng } = nextRandom(rng);
  return { drop: value < dropProbability, rng: nextRng };
}

function shouldDuplicate(
  sim: NetworkSimState,
  rng: RngState
): { duplicate: boolean; rng: RngState } {
  if (sim.scenario.duplicate_probability <= 0) {
    return { duplicate: false, rng };
  }
  const { value, rng: nextRng } = nextRandom(rng);
  return { duplicate: value < sim.scenario.duplicate_probability, rng: nextRng };
}

function resolveDelayRange(sim: NetworkSimState): [number, number] {
  const bursts = sim.scenario.delay_bursts;
  if (!bursts || bursts.length === 0) {
    return sim.scenario.delay_range;
  }
  for (const burst of bursts) {
    if (sim.time >= burst.start_tick && sim.time <= burst.end_tick) {
      return burst.delay_range;
    }
  }
  return sim.scenario.delay_range;
}

function drawDelay(sim: NetworkSimState, rng: RngState): { delay: number; rng: RngState } {
  const [minDelay, maxDelay] = resolveDelayRange(sim);
  if (maxDelay <= minDelay) {
    return { delay: Math.max(0, minDelay), rng };
  }
  const { value, rng: nextRng } = randomInt(rng, minDelay, maxDelay);
  return { delay: Math.max(0, value), rng: nextRng };
}

export function enqueueNetworkMessage(
  sim: NetworkSimState,
  fromReplica: string,
  toReplica: string,
  opId: string,
  op: TypedOp
): NetworkSimState {
  let rng = createRng(sim.rng_state);
  const sendTime = sim.time;

  const dropCheck = shouldDrop(sim, rng, fromReplica, toReplica);
  rng = dropCheck.rng;

  let nextSim = sim;
  if (dropCheck.drop) {
    const log = appendLog(
      sim.log,
      {
        id: `drop-${sim.time}-${sim.message_seq}`,
        from_replica: fromReplica,
        to_replica: toReplica,
        send_time: sendTime,
        deliver_time: null,
        event: "dropped",
      },
      sim.max_log_entries
    );
    nextSim = {
      ...sim,
      stats: { ...sim.stats, dropped: sim.stats.dropped + 1 },
      log,
    };

    if (sim.scenario.drop_mode !== "retry") {
      return { ...nextSim, rng_state: rng.seed };
    }
  }

  const delayDraw = drawDelay(nextSim, rng);
  rng = delayDraw.rng;

  const retryPenalty =
    dropCheck.drop && nextSim.scenario.drop_mode === "retry" ? delayDraw.delay : 0;
  const deliverTime = sendTime + delayDraw.delay + retryPenalty + 1;

  nextSim = withQueuedMessage(
    nextSim,
    {
      from_replica: fromReplica,
      to_replica: toReplica,
      op_id: opId,
      op,
      send_time: sendTime,
      deliver_time: deliverTime,
    },
    "queued"
  );

  const duplicateCheck = shouldDuplicate(nextSim, rng);
  rng = duplicateCheck.rng;

  if (duplicateCheck.duplicate) {
    const dupDelayDraw = drawDelay(nextSim, rng);
    rng = dupDelayDraw.rng;
    const dupDeliver = sendTime + dupDelayDraw.delay + 1;
    nextSim = withQueuedMessage(
      nextSim,
      {
        from_replica: fromReplica,
        to_replica: toReplica,
        op_id: opId,
        op,
        send_time: sendTime,
        deliver_time: dupDeliver,
      },
      "duplicated"
    );
  }

  return { ...nextSim, rng_state: rng.seed };
}

function buildPartitionLinks(replicaIds: string[], groups?: string[][]): Set<string> {
  const resolvedGroups =
    groups && groups.length > 1
      ? groups
      : [
          replicaIds.slice(0, Math.ceil(replicaIds.length / 2)),
          replicaIds.slice(Math.ceil(replicaIds.length / 2)),
        ];

  const blocked = new Set<string>();
  for (let i = 0; i < resolvedGroups.length; i++) {
    for (let j = 0; j < resolvedGroups.length; j++) {
      if (i === j) {
        continue;
      }
      for (const from of resolvedGroups[i]) {
        for (const to of resolvedGroups[j]) {
          blocked.add(linkKey(from, to));
        }
      }
    }
  }
  return blocked;
}

function applyPartitionEvents(sim: NetworkSimState): NetworkSimState {
  const schedule = sim.scenario.partition_schedule;
  if (schedule.length === 0) {
    return sim;
  }

  let nextSim = sim;
  let idx = sim.partition_schedule_index;

  while (idx < schedule.length && schedule[idx].at_tick <= sim.time) {
    const event = schedule[idx];
    if (event.action === "partition") {
      nextSim = {
        ...nextSim,
        partitioned_links: buildPartitionLinks(sim.replica_ids, event.groups),
      };
    } else {
      nextSim = { ...nextSim, partitioned_links: new Set<string>() };
    }
    idx += 1;
  }

  return { ...nextSim, partition_schedule_index: idx };
}

function shuffleMessages(
  messages: NetworkMessage[],
  rng: RngState
): { messages: NetworkMessage[]; rng: RngState } {
  const shuffled = [...messages];
  let currentRng = rng;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const { value: j, rng: nextRng } = randomInt(currentRng, 0, i);
    currentRng = nextRng;
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return { messages: shuffled, rng: currentRng };
}

export function advanceNetwork(sim: NetworkSimState): {
  sim: NetworkSimState;
  deliverable: NetworkMessage[];
} {
  let nextSim: NetworkSimState = { ...sim, time: sim.time + 1 };
  nextSim = applyPartitionEvents(nextSim);

  const deliverable: NetworkMessage[] = [];
  const remaining: NetworkMessage[] = [];
  let stats = { ...nextSim.stats };
  let log = nextSim.log;

  for (const message of nextSim.queue) {
    if (message.deliver_time > nextSim.time) {
      remaining.push(message);
      continue;
    }

    if (nextSim.partitioned_links.has(linkKey(message.from_replica, message.to_replica))) {
      stats = { ...stats, partition_blocked: stats.partition_blocked + 1 };
      log = appendLog(
        log,
        {
          id: message.id,
          from_replica: message.from_replica,
          to_replica: message.to_replica,
          send_time: message.send_time,
          deliver_time: null,
          event: "blocked",
        },
        nextSim.max_log_entries
      );
      remaining.push({ ...message, deliver_time: nextSim.time + 1 });
      continue;
    }

    deliverable.push(message);
  }

  let rng = createRng(nextSim.rng_state);
  if (deliverable.length > 1 && nextSim.scenario.reorder_probability > 0) {
    const { value, rng: rng1 } = nextRandom(rng);
    rng = rng1;
    if (value < nextSim.scenario.reorder_probability) {
      const shuffled = shuffleMessages(deliverable, rng);
      deliverable.splice(0, deliverable.length, ...shuffled.messages);
      rng = shuffled.rng;
    } else {
      deliverable.sort((a, b) => a.deliver_time - b.deliver_time);
    }
  } else {
    deliverable.sort((a, b) => a.deliver_time - b.deliver_time);
  }

  for (const message of deliverable) {
    stats = { ...stats, delivered: stats.delivered + 1 };
    log = appendLog(
      log,
      {
        id: message.id,
        from_replica: message.from_replica,
        to_replica: message.to_replica,
        send_time: message.send_time,
        deliver_time: message.deliver_time,
        event: "delivered",
      },
      nextSim.max_log_entries
    );
  }

  nextSim = {
    ...nextSim,
    queue: remaining,
    stats,
    log,
    rng_state: rng.seed,
  };

  return { sim: nextSim, deliverable };
}

export function summarizeNetworkLog(sim: NetworkSimState): NetworkLogSummary {
  return {
    stats: sim.stats,
    recent: [...sim.log],
  };
}

export function mergeNetworkStats(left: NetworkStats, right: NetworkStats): NetworkStats {
  return {
    queued: left.queued + right.queued,
    delivered: left.delivered + right.delivered,
    dropped: left.dropped + right.dropped,
    duplicated: left.duplicated + right.duplicated,
    delayed: left.delayed + right.delayed,
    partition_blocked: left.partition_blocked + right.partition_blocked,
  };
}

export function formatPartitionSchedule(schedule: NetworkPartitionEvent[]): string {
  if (schedule.length === 0) {
    return "none";
  }
  return schedule.map((event) => `${event.action}@${event.at_tick}`).join(", ");
}
