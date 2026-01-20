import { randomUUID } from "node:crypto";

export type MemoryEntryType = "episodic" | "semantic" | "procedural";

export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  content: string;
  embedding?: number[];
  metadata: {
    createdAt: number;
    accessedAt: number;
    accessCount: number;
    importance: number;
    source: string;
    sessionId?: string;
  };
}

export interface SessionMemoryConfig {
  workingMemoryLimit: number;
  evictionStrategy?: "lru" | "fifo";
}

export class SessionMemory {
  private readonly config: Required<SessionMemoryConfig>;
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly order: string[] = [];
  private readonly sessionLinks = new Map<string, Set<string>>();

  constructor(config: SessionMemoryConfig) {
    this.config = {
      workingMemoryLimit: config.workingMemoryLimit,
      evictionStrategy: config.evictionStrategy ?? "lru",
    };
  }

  async remember(
    content: string,
    type: MemoryEntryType,
    options: { importance: number; source: string; sessionId?: string; embedding?: number[] }
  ): Promise<string> {
    const now = Date.now();
    const entry: MemoryEntry = {
      id: `mem_${randomUUID()}`,
      type,
      content,
      embedding: options.embedding,
      metadata: {
        createdAt: now,
        accessedAt: now,
        accessCount: 1,
        importance: options.importance,
        source: options.source,
        sessionId: options.sessionId,
      },
    };

    this.entries.set(entry.id, entry);
    this.order.push(entry.id);
    this.evictIfNeeded();

    return entry.id;
  }

  get(id: string): MemoryEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) {
      return undefined;
    }

    this.touch(entry);
    return entry;
  }

  list(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  linkSessions(sourceSessionId: string, targetSessionId: string): void {
    const links = this.sessionLinks.get(sourceSessionId) ?? new Set<string>();
    links.add(targetSessionId);
    this.sessionLinks.set(sourceSessionId, links);
  }

  getLinkedSessions(sessionId: string): string[] {
    return Array.from(this.sessionLinks.get(sessionId) ?? []);
  }

  remove(id: string): void {
    this.entries.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) {
      this.order.splice(index, 1);
    }
  }

  private touch(entry: MemoryEntry): void {
    entry.metadata.accessedAt = Date.now();
    entry.metadata.accessCount += 1;

    if (this.config.evictionStrategy === "lru") {
      const index = this.order.indexOf(entry.id);
      if (index >= 0) {
        this.order.splice(index, 1);
      }
      this.order.push(entry.id);
    }
  }

  private evictIfNeeded(): void {
    while (this.order.length > this.config.workingMemoryLimit) {
      const victim = this.order.shift();
      if (!victim) {
        break;
      }
      this.entries.delete(victim);
    }
  }
}
