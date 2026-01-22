/**
 * Backpressure-Aware Event Stream
 *
 * Provides a buffered event stream with backpressure support.
 * Allows producers to push events and consumers to pull them asynchronously.
 *
 * Designed for single-consumer use cases (e.g., streaming orchestrator events).
 */

export class BackpressureEventStream<T> {
  private readonly buffer: T[] = [];
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;
  private isClosed = false;
  private hasConsumer = false;
  private resolveNext?: (value: { value: T | undefined; done: boolean }) => void;

  constructor(options: { highWaterMark?: number; lowWaterMark?: number } = {}) {
    this.highWaterMark = options.highWaterMark ?? 100;
    this.lowWaterMark = options.lowWaterMark ?? 20;
  }

  /**
   * Push an event to the stream.
   * @returns boolean - true if the buffer is below highWaterMark, false otherwise (signaling backpressure).
   */
  push(event: T): boolean {
    if (this.isClosed) {
      return false;
    }

    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = undefined;
      resolve({ value: event, done: false });
    } else {
      this.buffer.push(event);
    }

    return this.buffer.length < this.highWaterMark;
  }

  /**
   * Close the stream.
   */
  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = undefined;
      resolve({ value: undefined, done: true });
    }
  }

  /**
   * Consume events using an async generator.
   * Throws if multiple consumers attempt to consume simultaneously.
   */
  async *consume(): AsyncGenerator<T> {
    if (this.hasConsumer) {
      throw new Error("BackpressureEventStream only supports a single consumer");
    }
    this.hasConsumer = true;

    try {
      while (!this.isClosed || this.buffer.length > 0) {
        if (this.buffer.length > 0) {
          yield this.buffer.shift() as T;
        } else if (!this.isClosed) {
          const next = await new Promise<{ value: T | undefined; done: boolean }>((resolve) => {
            this.resolveNext = resolve;
          });
          if (next.done) {
            break;
          }
          if (next.value !== undefined) {
            yield next.value;
          }
        }
      }
    } finally {
      this.hasConsumer = false;
    }
  }

  /**
   * Current buffer size.
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Whether the stream is below lowWaterMark.
   */
  get canResume(): boolean {
    return this.buffer.length <= this.lowWaterMark;
  }
}
