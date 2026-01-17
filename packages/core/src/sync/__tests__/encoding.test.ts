/**
 * Base64 encoding round-trip tests and performance benchmarks
 * @see P1.1 acceptance criteria
 */

import { describe, expect, it } from "vitest";
import { base64Decode, base64Encode } from "../encoding.js";

describe("base64Encode/base64Decode", () => {
  describe("round-trip correctness", () => {
    it("handles empty array", () => {
      const input = new Uint8Array(0);
      const encoded = base64Encode(input);
      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(input);
    });

    it("handles small arrays", () => {
      const input = new Uint8Array([0, 1, 2, 3, 255, 128, 64]);
      const encoded = base64Encode(input);
      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(input);
    });

    it("handles all byte values (0-255)", () => {
      const input = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        input[i] = i;
      }
      const encoded = base64Encode(input);
      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(input);
    });

    it("handles large arrays (1MB)", () => {
      const size = 1024 * 1024; // 1MB
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = i % 256;
      }
      const encoded = base64Encode(input);
      const decoded = base64Decode(encoded);
      expect(decoded.byteLength).toBe(size);
      expect(Buffer.compare(Buffer.from(decoded), Buffer.from(input))).toBe(0);
    });

    it("handles random data", () => {
      const size = 10000;
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = Math.floor(Math.random() * 256);
      }
      const encoded = base64Encode(input);
      const decoded = base64Decode(encoded);
      expect(decoded).toEqual(input);
    });

    it("handles chunks at boundary size (32KB)", () => {
      // Test around the CHUNK_SIZE boundary (0x8000 = 32768)
      const sizes = [32767, 32768, 32769, 65536, 65537];
      for (const size of sizes) {
        const input = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
          input[i] = i % 256;
        }
        const encoded = base64Encode(input);
        const decoded = base64Decode(encoded);
        expect(decoded).toEqual(input);
      }
    });
  });

  describe("encoding validity", () => {
    it("produces valid base64 string", () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const encoded = base64Encode(input);
      // Valid base64 chars: A-Z, a-z, 0-9, +, /, =
      expect(encoded).toMatch(/^[A-Za-z0-9+/=]*$/);
    });

    it("produces correct length", () => {
      // Base64 output length = ceil(input.length / 3) * 4
      const testCases = [
        { inputLen: 0, expectedLen: 0 },
        { inputLen: 1, expectedLen: 4 },
        { inputLen: 2, expectedLen: 4 },
        { inputLen: 3, expectedLen: 4 },
        { inputLen: 4, expectedLen: 8 },
        { inputLen: 6, expectedLen: 8 },
        { inputLen: 100, expectedLen: 136 },
      ];
      for (const { inputLen, expectedLen } of testCases) {
        const input = new Uint8Array(inputLen);
        const encoded = base64Encode(input);
        expect(encoded.length).toBe(expectedLen);
      }
    });
  });

  describe("performance benchmark", () => {
    const BENCHMARK_ITERATIONS = 100;

    it("encodes 1MB in reasonable time (<100ms avg)", () => {
      const size = 1024 * 1024; // 1MB
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = i % 256;
      }

      const start = performance.now();
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        base64Encode(input);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / BENCHMARK_ITERATIONS;

      // Log benchmark result (visible in verbose test output)
      // biome-ignore lint/suspicious/noConsole: benchmark output
      console.log(`[PERF] base64Encode 1MB avg: ${avgMs.toFixed(2)}ms`);
      expect(avgMs).toBeLessThan(100);
    });

    it("decodes 1MB in reasonable time (<100ms avg)", () => {
      const size = 1024 * 1024;
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = i % 256;
      }
      const encoded = base64Encode(input);

      const start = performance.now();
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        base64Decode(encoded);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / BENCHMARK_ITERATIONS;

      // biome-ignore lint/suspicious/noConsole: benchmark output
      console.log(`[PERF] base64Decode 1MB avg: ${avgMs.toFixed(2)}ms`);
      expect(avgMs).toBeLessThan(100);
    });

    it("round-trip throughput > 10MB/s", () => {
      const size = 1024 * 1024; // 1MB
      const input = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        input[i] = i % 256;
      }

      const iterations = 50;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const encoded = base64Encode(input);
        base64Decode(encoded);
      }
      const elapsed = performance.now() - start;
      const totalBytes = size * iterations * 2; // encode + decode
      const throughputMBps = totalBytes / (1024 * 1024) / (elapsed / 1000);

      // biome-ignore lint/suspicious/noConsole: benchmark output
      console.log(`[PERF] round-trip throughput: ${throughputMBps.toFixed(1)} MB/s`);
      expect(throughputMBps).toBeGreaterThan(10);
    });
  });
});
