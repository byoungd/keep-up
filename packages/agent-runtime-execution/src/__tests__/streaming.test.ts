/**
 * Streaming Tests
 */

import { describe, expect, it, vi } from "vitest";
import {
  collectStream,
  collectText,
  createStreamWriter,
  filterStream,
  mergeStreams,
  processStreamWithCallbacks,
  type RuntimeStreamChunk,
  type TextChunkData,
  transformStream,
} from "../streaming";

describe("StreamWriter", () => {
  describe("basic operations", () => {
    it("should create a stream writer", () => {
      const writer = createStreamWriter();
      expect(writer.id).toMatch(/^stream_/);
      expect(writer.isClosed).toBe(false);
    });

    it("should create with custom ID", () => {
      const writer = createStreamWriter("my-stream");
      expect(writer.id).toBe("my-stream");
    });

    it("should write text chunks", async () => {
      const writer = createStreamWriter();

      writer.writeText("Hello ");
      writer.writeText("World", false);
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks).toHaveLength(3); // 2 text + done
      expect(chunks[0].type).toBe("text");
      expect((chunks[0].data as TextChunkData).content).toBe("Hello ");
      expect((chunks[0].data as TextChunkData).isPartial).toBe(true);
      expect((chunks[1].data as TextChunkData).isPartial).toBe(false);
    });

    it("should write tool call chunks", async () => {
      const writer = createStreamWriter();

      writer.writeToolCall("call-1", "bash", { command: "ls" });
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("tool_call");
      expect(chunks[0].data).toEqual({
        callId: "call-1",
        name: "bash",
        arguments: { command: "ls" },
      });
    });

    it("should write tool result chunks", async () => {
      const writer = createStreamWriter();

      writer.writeToolResult("call-1", "bash", "file.txt", true, 50);
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("tool_result");
      expect(chunks[0].data).toEqual({
        callId: "call-1",
        name: "bash",
        result: "file.txt",
        success: true,
        durationMs: 50,
      });
    });

    it("should write progress chunks", async () => {
      const writer = createStreamWriter();

      writer.writeProgress("processing", "Loading documents", { percent: 50 });
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("progress");
      expect(chunks[0].data).toEqual({
        stage: "processing",
        message: "Loading documents",
        percent: 50,
      });
    });

    it("should write thinking chunks", async () => {
      const writer = createStreamWriter();

      writer.writeThinking("Let me analyze this...");
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("thinking");
    });

    it("should write error chunks", async () => {
      const writer = createStreamWriter();

      writer.writeError("Rate limit exceeded", "RATE_LIMIT", true);
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("error");
      expect(chunks[0].data).toEqual({
        message: "Rate limit exceeded",
        code: "RATE_LIMIT",
        recoverable: true,
      });
    });

    it("should write metadata chunks", async () => {
      const writer = createStreamWriter();

      writer.writeMetadata("model", "claude-3-opus");
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].type).toBe("metadata");
      expect(chunks[0].data).toEqual({
        key: "model",
        value: "claude-3-opus",
      });
    });

    it("should close with done chunk", async () => {
      const writer = createStreamWriter();

      writer.writeText("test");
      writer.close();

      const chunks = await collectStream(writer);

      const doneChunk = chunks.find((c) => c.type === "done");
      expect(doneChunk).toBeDefined();
      expect(doneChunk?.data).toHaveProperty("stats");
    });

    it("should throw when writing to closed stream", () => {
      const writer = createStreamWriter();
      writer.close();

      expect(() => writer.writeText("test")).toThrow("Stream is closed");
    });
  });

  describe("sequence and ordering", () => {
    it("should assign sequential numbers to chunks", async () => {
      const writer = createStreamWriter();

      writer.writeText("a");
      writer.writeText("b");
      writer.writeText("c");
      writer.close();

      const chunks = await collectStream(writer);

      expect(chunks[0].sequence).toBe(0);
      expect(chunks[1].sequence).toBe(1);
      expect(chunks[2].sequence).toBe(2);
    });

    it("should include timestamps", async () => {
      const before = Date.now();
      const writer = createStreamWriter();

      writer.writeText("test");
      writer.close();

      const after = Date.now();
      const chunks = await collectStream(writer);

      expect(chunks[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(chunks[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("stats", () => {
    it("should track stats", async () => {
      const writer = createStreamWriter();

      writer.writeText("Hello");
      writer.writeText("World");
      writer.close();

      const stats = writer.getStats();

      expect(stats.chunksEmitted).toBe(2); // 2 text chunks (done is internal)
      expect(stats.bytesEmitted).toBeGreaterThan(0);
      expect(stats.startTime).toBeGreaterThan(0);
      expect(stats.endTime).toBeGreaterThan(0);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("backpressure", () => {
    it("should drop old chunks when buffer is full", async () => {
      const writer = createStreamWriter(undefined, { bufferSize: 3 });

      // Write more than buffer size
      for (let i = 0; i < 10; i++) {
        writer.writeText(`chunk-${i}`);
      }
      writer.close();

      const stats = writer.getStats();
      expect(stats.chunksDropped).toBe(7); // 10 - 3 = 7 dropped
    });
  });
});

describe("collectText", () => {
  it("should collect all text content", async () => {
    const writer = createStreamWriter();

    writer.writeText("Hello ");
    writer.writeProgress("step", "processing");
    writer.writeText("World");
    writer.writeToolCall("c1", "tool", {});
    writer.writeText("!");
    writer.close();

    const text = await collectText(writer);

    expect(text).toBe("Hello World!");
  });
});

describe("transformStream", () => {
  it("should transform chunks", async () => {
    const writer = createStreamWriter();

    writer.writeText("hello");
    writer.close();

    const transformed = transformStream(writer, (chunk) => {
      if (chunk.type === "text") {
        const data = chunk.data as TextChunkData;
        return {
          ...chunk,
          data: { ...data, content: data.content.toUpperCase() },
        };
      }
      return chunk;
    });

    const chunks = await collectStream(transformed);

    expect((chunks[0].data as TextChunkData).content).toBe("HELLO");
  });

  it("should filter out null results", async () => {
    const writer = createStreamWriter();

    writer.writeText("keep");
    writer.writeProgress("step", "skip this");
    writer.writeText("also keep");
    writer.close();

    const transformed = transformStream(writer, (chunk) => {
      if (chunk.type === "progress") {
        return null;
      }
      return chunk;
    });

    const chunks = await collectStream(transformed);
    const progressChunks = chunks.filter((c) => c.type === "progress");

    expect(progressChunks).toHaveLength(0);
  });
});

describe("filterStream", () => {
  it("should filter chunks", async () => {
    const writer = createStreamWriter();

    writer.writeText("text1");
    writer.writeProgress("step", "progress");
    writer.writeText("text2");
    writer.close();

    const filtered = filterStream(writer, (chunk) => chunk.type === "text");

    const chunks = await collectStream(filtered);
    const textChunks = chunks.filter((c) => c.type === "text");

    expect(textChunks).toHaveLength(2);
  });
});

describe("mergeStreams", () => {
  it("should merge multiple streams", async () => {
    const writer1 = createStreamWriter("stream-1");
    const writer2 = createStreamWriter("stream-2");

    // Write to streams
    setTimeout(() => {
      writer1.writeText("from-1");
      writer1.close();
    }, 10);

    setTimeout(() => {
      writer2.writeText("from-2");
      writer2.close();
    }, 20);

    const merged = mergeStreams(writer1, writer2);
    const chunks: RuntimeStreamChunk[] = [];

    for await (const chunk of merged) {
      chunks.push(chunk);
      if (chunks.filter((c) => c.type === "done").length === 2) {
        break;
      }
    }

    expect(chunks.some((c) => c.streamId === "stream-1")).toBe(true);
    expect(chunks.some((c) => c.streamId === "stream-2")).toBe(true);
  });
});

describe("processStreamWithCallbacks", () => {
  it("should call appropriate callbacks", async () => {
    const writer = createStreamWriter();

    const callbacks = {
      onText: vi.fn(),
      onToolCall: vi.fn(),
      onProgress: vi.fn(),
      onDone: vi.fn(),
    };

    writer.writeText("hello");
    writer.writeToolCall("c1", "bash", { cmd: "ls" });
    writer.writeProgress("loading", "50%", { percent: 50 });
    writer.close();

    await processStreamWithCallbacks(writer, callbacks);

    expect(callbacks.onText).toHaveBeenCalledWith("hello", true);
    expect(callbacks.onToolCall).toHaveBeenCalledWith("c1", "bash", { cmd: "ls" });
    expect(callbacks.onProgress).toHaveBeenCalledWith("loading", "50%", 50);
    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it("should handle errors", async () => {
    const writer = createStreamWriter();

    const callbacks = {
      onError: vi.fn(),
    };

    writer.writeError("Something went wrong", "ERR_001", true);
    writer.close();

    await processStreamWithCallbacks(writer, callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith("Something went wrong", "ERR_001", true);
  });
});

describe("async iteration", () => {
  it("should support async iteration", async () => {
    const writer = createStreamWriter();

    writer.writeText("a");
    writer.writeText("b");
    writer.close();

    const chunks: RuntimeStreamChunk[] = [];
    for await (const chunk of writer) {
      chunks.push(chunk);
      if (chunk.type === "done") {
        break;
      }
    }

    expect(chunks).toHaveLength(3);
  });

  it("should wait for chunks when reading faster than writing", async () => {
    const writer = createStreamWriter();

    const readPromise = (async () => {
      const chunks: RuntimeStreamChunk[] = [];
      for await (const chunk of writer) {
        chunks.push(chunk);
        if (chunk.type === "done") {
          break;
        }
      }
      return chunks;
    })();

    // Write with delays
    await new Promise((r) => setTimeout(r, 10));
    writer.writeText("delayed");
    writer.close();

    const chunks = await readPromise;

    expect(chunks.some((c) => c.type === "text")).toBe(true);
  });
});
