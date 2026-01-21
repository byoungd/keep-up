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
    return this.engine.appendEvent(payload);
  }

  replay(fromSequenceId: number, limit?: number): TaskGraphEvent[] {
    const payloads = this.engine.replayEvents(fromSequenceId, limit);
    return payloads.map((payload) => decode(payload) as TaskGraphEvent);
  }

  prune(beforeSequenceId: number): number {
    return this.engine.pruneEvents(beforeSequenceId);
  }
}

function createStorageEngine(rootDir: string): NativeStorageEngine {
  if (!isNativeStorageEngineAvailable()) {
    throw new Error("Native storage engine binding is not available.");
  }
  return new StorageEngine(rootDir);
}
