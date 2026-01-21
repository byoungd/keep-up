import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..", "..");

const expectedCandidate = path.join(packageRoot, "tokenizer_rs.node");

let binding: Record<string, unknown> = {};
let requiredPath = "";

vi.mock("node:fs", () => ({
  existsSync: (input: string) => input === expectedCandidate,
}));

vi.mock("node:module", () => ({
  createRequire: () => (input: string) => {
    requiredPath = input;
    return binding;
  },
}));

async function loadTokenizer() {
  const mod = await import("../node");
  return mod.getNativeTokenizer();
}

describe("native binding loader", () => {
  beforeEach(() => {
    binding = {};
    requiredPath = "";
    delete process.env.TOKENIZER_RS_NATIVE_PATH;
    vi.resetModules();
  });

  it("resolves platform-suffixed binary and camelCase exports", async () => {
    const compressedContext = {
      messages: [],
      totalTokens: 1,
      removedCount: 0,
      compressionRatio: 0,
      selectedIndices: [],
    };

    binding = {
      count_tokens: vi.fn(() => 3),
      count_tokens_batch: vi.fn(() => [1, 2]),
      estimate_json_tokens: vi.fn(() => 4),
      compress_context: vi.fn(() => compressedContext),
      compress_payload_zstd: vi.fn(() => null),
    };

    const tokenizer = await loadTokenizer();
    expect(tokenizer).not.toBeNull();
    if (!tokenizer) {
      throw new Error("Expected tokenizer");
    }

    expect(tokenizer.countTokens("hello", "cl100k_base")).toBe(3);
    expect(tokenizer.countTokensBatch(["a", "b"], "cl100k_base")).toEqual([1, 2]);
    expect(tokenizer.estimateJsonTokens({ value: "x" }, "cl100k_base")).toBe(4);
    expect(tokenizer.compressContext([], 10, 1, "cl100k_base")).toEqual(compressedContext);
    expect(requiredPath).toBe(expectedCandidate);
  });

  it("supports snake_case exports", async () => {
    const compressedContext = {
      messages: [],
      totalTokens: 2,
      removedCount: 0,
      compressionRatio: 0,
      selectedIndices: [],
    };

    binding = {
      count_tokens: vi.fn(() => 5),
      count_tokens_batch: vi.fn(() => [3, 4]),
      estimate_json_tokens: vi.fn(() => 6),
      compress_context: vi.fn(() => compressedContext),
      compress_payload_zstd: vi.fn(() => null),
    };

    const tokenizer = await loadTokenizer();
    expect(tokenizer).not.toBeNull();
    if (!tokenizer) {
      throw new Error("Expected tokenizer");
    }

    expect(tokenizer.countTokens("world", "cl100k_base")).toBe(5);
    expect(tokenizer.countTokensBatch(["c", "d"], "cl100k_base")).toEqual([3, 4]);
    expect(tokenizer.estimateJsonTokens({ value: "y" }, "cl100k_base")).toBe(6);
    expect(tokenizer.compressContext([], 10, 1, "cl100k_base")).toEqual(compressedContext);
  });
});
