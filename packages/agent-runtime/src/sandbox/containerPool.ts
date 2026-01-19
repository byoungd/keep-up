/**
 * Docker Container Pool
 *
 * Keeps a warm pool of containers to reduce sandbox startup latency.
 */

import type Dockerode from "dockerode";
import type { Container } from "dockerode";
import { createSandboxContainer } from "./containerFactory";
import type { SandboxPolicy } from "./types";

export interface ContainerPoolOptions {
  minSize: number;
  maxSize: number;
  image: string;
  workspacePath: string;
  containerWorkspacePath: string;
  policy: SandboxPolicy;
  idleTimeoutMs?: number;
  healthCheckIntervalMs?: number;
  resetCommand?: string;
  resetTimeoutMs?: number;
}

export interface ContainerPoolStats {
  size: number;
  ready: number;
  leased: number;
  resetting: number;
  pendingCreates: number;
  waiters: number;
}

interface PooledContainer {
  container: Container;
  createdAt: number;
  lastUsedAt: number;
}

interface Waiter {
  resolve: (container: Container) => void;
  reject: (error: Error) => void;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_RESET_TIMEOUT_MS = 10_000;
const DEFAULT_RESET_COMMAND = "rm -rf /tmp/* /var/tmp/*";

class Mutex {
  private locked = false;
  private readonly queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        const next = this.queue.shift();
        if (next) {
          next();
          return;
        }
        this.locked = false;
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
        return;
      }

      this.queue.push(() => {
        this.locked = true;
        resolve(release);
      });
    });
  }
}

export class ContainerPool {
  private readonly docker: Dockerode;
  private readonly options: Required<ContainerPoolOptions>;
  private readonly ready: PooledContainer[] = [];
  private readonly leased = new Map<string, PooledContainer>();
  private readonly resetting = new Map<string, PooledContainer>();
  private readonly waitQueue: Waiter[] = [];
  private readonly mutex = new Mutex();
  private pendingCreates = 0;
  private started = false;
  private disposed = false;
  private maintenanceInterval?: ReturnType<typeof setInterval>;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(docker: Dockerode, options: ContainerPoolOptions) {
    this.docker = docker;
    this.options = {
      idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
      healthCheckIntervalMs: DEFAULT_HEALTH_CHECK_INTERVAL_MS,
      resetCommand: DEFAULT_RESET_COMMAND,
      resetTimeoutMs: DEFAULT_RESET_TIMEOUT_MS,
      ...options,
    };

    if (this.options.minSize < 0 || this.options.maxSize < 1) {
      throw new Error("Container pool size must be positive");
    }
    if (this.options.minSize > this.options.maxSize) {
      throw new Error("Container pool minSize cannot exceed maxSize");
    }
  }

  start(): void {
    if (this.started || this.disposed) {
      return;
    }

    this.started = true;
    void this.ensureMinSize();

    if (this.options.idleTimeoutMs > 0) {
      this.maintenanceInterval = setInterval(() => {
        void this.cleanupIdle();
      }, this.options.idleTimeoutMs);
    }

    if (this.options.healthCheckIntervalMs > 0) {
      this.healthCheckInterval = setInterval(() => {
        void this.runHealthChecks();
      }, this.options.healthCheckIntervalMs);
    }
  }

  async acquire(): Promise<Container> {
    if (this.disposed) {
      throw new Error("Container pool disposed");
    }
    if (!this.started) {
      this.start();
    }

    while (true) {
      const container = await this.acquireCandidate();
      const ready = await this.ensureRunning(container);
      if (ready) {
        return container;
      }
      await this.retireContainer(container);
    }
  }

  async release(container: Container, clean: boolean): Promise<void> {
    if (this.disposed) {
      await this.destroyContainer(container);
      return;
    }

    const releaseLock = await this.mutex.acquire();
    const pooled = this.leased.get(container.id);
    if (!pooled) {
      releaseLock();
      return;
    }

    this.leased.delete(container.id);
    if (clean) {
      this.returnToPoolLocked(pooled);
      releaseLock();
      return;
    }

    this.resetting.set(container.id, pooled);
    releaseLock();

    const resetOk = await this.resetContainer(container);
    const finishLock = await this.mutex.acquire();
    this.resetting.delete(container.id);

    if (this.disposed) {
      finishLock();
      await this.destroyContainer(container);
      return;
    }

    if (resetOk) {
      this.returnToPoolLocked(pooled);
      finishLock();
      return;
    }

    finishLock();
    await this.destroyContainer(container);
    if (this.started) {
      void this.ensureMinSize();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = undefined;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    const releaseLock = await this.mutex.acquire();
    const waiters = this.waitQueue.splice(0, this.waitQueue.length);
    const containers = [
      ...this.ready.map((entry) => entry.container),
      ...Array.from(this.leased.values()).map((entry) => entry.container),
      ...Array.from(this.resetting.values()).map((entry) => entry.container),
    ];
    this.ready.length = 0;
    this.leased.clear();
    this.resetting.clear();
    releaseLock();

    for (const waiter of waiters) {
      waiter.reject(new Error("Container pool disposed"));
    }

    for (const container of containers) {
      await this.destroyContainer(container);
    }
  }

  getStats(): ContainerPoolStats {
    return {
      size: this.ready.length + this.leased.size + this.resetting.size,
      ready: this.ready.length,
      leased: this.leased.size,
      resetting: this.resetting.size,
      pendingCreates: this.pendingCreates,
      waiters: this.waitQueue.length,
    };
  }

  private async acquireCandidate(): Promise<Container> {
    const releaseLock = await this.mutex.acquire();

    if (this.disposed) {
      releaseLock();
      throw new Error("Container pool disposed");
    }

    const ready = this.ready.pop();
    if (ready) {
      this.leased.set(ready.container.id, ready);
      releaseLock();
      return ready.container;
    }

    const total = this.totalCount();
    if (total < this.options.maxSize) {
      this.pendingCreates += 1;
      releaseLock();
      let container: Container;
      try {
        container = await this.createContainer();
      } catch (error) {
        const finishLock = await this.mutex.acquire();
        this.pendingCreates = Math.max(0, this.pendingCreates - 1);
        finishLock();
        throw error;
      }
      const finishLock = await this.mutex.acquire();
      this.pendingCreates = Math.max(0, this.pendingCreates - 1);
      if (this.disposed) {
        finishLock();
        await this.destroyContainer(container);
        throw new Error("Container pool disposed");
      }
      const pooled: PooledContainer = {
        container,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };
      this.leased.set(container.id, pooled);
      finishLock();
      return container;
    }

    const containerPromise = new Promise<Container>((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
    releaseLock();
    return containerPromise;
  }

  private async ensureMinSize(): Promise<void> {
    if (this.disposed) {
      return;
    }

    let toCreate = 0;
    const releaseLock = await this.mutex.acquire();
    const total = this.totalCount();
    if (total < this.options.minSize) {
      toCreate = this.options.minSize - total;
      this.pendingCreates += toCreate;
    }
    releaseLock();

    for (let i = 0; i < toCreate; i++) {
      try {
        const container = await this.createContainer();
        const finishLock = await this.mutex.acquire();
        this.pendingCreates = Math.max(0, this.pendingCreates - 1);
        if (this.disposed) {
          finishLock();
          await this.destroyContainer(container);
          continue;
        }
        const pooled: PooledContainer = {
          container,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        };
        this.returnToPoolLocked(pooled);
        finishLock();
      } catch {
        const finishLock = await this.mutex.acquire();
        this.pendingCreates = Math.max(0, this.pendingCreates - 1);
        finishLock();
      }
    }
  }

  private returnToPoolLocked(pooled: PooledContainer): void {
    pooled.lastUsedAt = Date.now();
    const waiter = this.waitQueue.shift();
    if (waiter) {
      this.leased.set(pooled.container.id, pooled);
      waiter.resolve(pooled.container);
      return;
    }
    this.ready.push(pooled);
  }

  private totalCount(): number {
    return this.ready.length + this.leased.size + this.resetting.size + this.pendingCreates;
  }

  private async createContainer(): Promise<Container> {
    return createSandboxContainer({
      docker: this.docker,
      image: this.options.image,
      workspacePath: this.options.workspacePath,
      containerWorkspacePath: this.options.containerWorkspacePath,
      policy: this.options.policy,
    });
  }

  private async ensureRunning(container: Container): Promise<boolean> {
    try {
      const info = await container.inspect();
      if (info.State?.Running) {
        return true;
      }
      await container.start();
      return true;
    } catch {
      return false;
    }
  }

  private async resetContainer(container: Container): Promise<boolean> {
    const resetCommand = this.options.resetCommand;
    if (!resetCommand) {
      return false;
    }
    const running = await this.ensureRunning(container);
    if (!running) {
      return false;
    }

    let timedOut = false;
    try {
      const exec = await container.exec({
        Cmd: ["sh", "-lc", resetCommand],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      stream.resume();

      const timeout = setTimeout(() => {
        timedOut = true;
        void container.kill().catch(() => undefined);
      }, this.options.resetTimeoutMs);

      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
      }).finally(() => clearTimeout(timeout));

      const inspect = await exec.inspect().catch(() => null);
      const exitCode = inspect?.ExitCode ?? (timedOut ? -1 : 0);
      return !timedOut && exitCode === 0;
    } catch {
      return false;
    }
  }

  private async retireContainer(container: Container): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    this.leased.delete(container.id);
    releaseLock();
    await this.destroyContainer(container);
    if (this.started) {
      void this.ensureMinSize();
    }
  }

  private async cleanupIdle(): Promise<void> {
    if (this.disposed || this.options.idleTimeoutMs <= 0) {
      return;
    }

    const now = Date.now();
    const releaseLock = await this.mutex.acquire();
    const removable: PooledContainer[] = [];
    const removeIds = new Set<string>();
    let total = this.totalCount();

    for (const pooled of this.ready) {
      if (now - pooled.lastUsedAt < this.options.idleTimeoutMs) {
        continue;
      }
      if (total - 1 < this.options.minSize) {
        break;
      }
      total -= 1;
      removable.push(pooled);
      removeIds.add(pooled.container.id);
    }

    if (removeIds.size > 0) {
      const remaining = this.ready.filter((entry) => !removeIds.has(entry.container.id));
      this.ready.length = 0;
      this.ready.push(...remaining);
    }
    releaseLock();

    for (const pooled of removable) {
      await this.destroyContainer(pooled.container);
    }
  }

  private async runHealthChecks(): Promise<void> {
    if (this.disposed || this.options.healthCheckIntervalMs <= 0) {
      return;
    }

    const releaseLock = await this.mutex.acquire();
    const snapshot = this.ready.map((entry) => entry.container);
    releaseLock();

    let removedAny = false;
    for (const container of snapshot) {
      const ok = await this.ensureRunning(container);
      if (ok) {
        continue;
      }
      const removeLock = await this.mutex.acquire();
      const index = this.ready.findIndex((entry) => entry.container.id === container.id);
      if (index === -1) {
        removeLock();
        continue;
      }
      this.ready.splice(index, 1);
      removeLock();
      await this.destroyContainer(container);
      removedAny = true;
    }

    if (removedAny && this.started) {
      void this.ensureMinSize();
    }
  }

  private async destroyContainer(container: Container): Promise<void> {
    try {
      await container.stop({ t: 2 });
    } catch {
      // Ignore stop errors
    }
    try {
      await container.remove({ force: true });
    } catch {
      // Ignore removal errors
    }
  }
}
