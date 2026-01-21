/**
 * Native TaskGraph event log adapter.
 */

import {
  isNativeStorageEngineAvailable,
  type NativeStorageEngine,
  StorageEngine,
} from "@ku0/storage-engine-rs";
import { decode, encode } from "@msgpack/msgpack";
import type { TaskGraphEvent, TaskGraphEventLog } from "./taskGraph";

export interface NativeTaskGraphEventLogConfig {
  rootDir: string;
  engine?: NativeStorageEngine;
}

export class NativeTaskGraphEventLog implements TaskGraphEventLog {
  private readonly engine: NativeStorageEngine;

  constructor(config: NativeTaskGraphEventLogConfig) {
    this.engine = config.engine ?? createStorageEngine(config.rootDir);
  }

  append(event: TaskGraphEvent): number {
    const payload = encode(event);
    const seq = this.engine.appendEvent(payload);
    return toSafeNumber(seq, "appendEvent");
  }

  replay(fromSequenceId: number, limit?: number): TaskGraphEvent[] {
    const payloads = this.engine.replayEvents(toBigInt(fromSequenceId, "fromSequenceId"), limit);
    return payloads.map((payload) => decode(payload) as TaskGraphEvent);
  }

  prune(beforeSequenceId: number): number {
    const removed = this.engine.pruneEvents(toBigInt(beforeSequenceId, "beforeSequenceId"));
    return toSafeNumber(removed, "pruneEvents");
  }
}

function createStorageEngine(rootDir: string): NativeStorageEngine {
  if (!isNativeStorageEngineAvailable()) {
    throw new Error("Native storage engine binding is not available.");
  }
  return new StorageEngine(rootDir);
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function toBigInt(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return BigInt(value);
}

function toSafeNumber(value: bigint, label: string): number {
  if (value < 0n) {
    throw new RangeError(`${label} must be unsigned.`);
  }
  if (value > MAX_SAFE_BIGINT) {
    throw new RangeError(`${label} exceeds Number.MAX_SAFE_INTEGER.`);
  }
  return Number(value);
}
