import { createHash } from "node:crypto";
import {
  applyMarkdownLineOperations,
  buildMarkdownSemanticIndex,
  computeMarkdownContentHash,
  computeMarkdownLineHash,
  type MarkdownOperationEnvelope,
  resolveMarkdownSemanticTarget,
  splitMarkdownLines,
} from "@ku0/core";
import { getNativeMarkdownContent } from "@ku0/markdown-content-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { describe, expect, it } from "vitest";

import {
  blockIdVectors,
  contentHashVectors,
  frontmatterUpdateVectors,
  lineHashVectors,
  semanticVectors,
} from "../markdown/vectors";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function findFrontmatterRange(lines: string[]): { start: number; end: number } | null {
  let firstContent = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.trim().length) {
      firstContent = i;
      break;
    }
  }
  if (firstContent === -1) {
    return null;
  }
  const delimiter = lines[firstContent];
  if (delimiter !== "---" && delimiter !== "+++" && delimiter !== ";;;") {
    return null;
  }
  for (let i = firstContent + 1; i < lines.length; i += 1) {
    if (lines[i] === delimiter) {
      return { start: firstContent + 1, end: i + 1 };
    }
  }
  return null;
}

describe("Markdown content mode conformance", () => {
  it("matches LFCC_MD_LINE_V1 hashes", async () => {
    for (const vector of lineHashVectors) {
      const hash = await computeMarkdownLineHash(vector.lines, vector.range);
      const expected = sha256Hex(vector.canonical);
      expect(hash).toBe(expected);
    }
  });

  it("matches LFCC_MD_CONTENT_V1 hashes", async () => {
    for (const vector of contentHashVectors) {
      const hash = await computeMarkdownContentHash(vector.content, {
        ignore_frontmatter: vector.ignoreFrontmatter,
      });
      const expected = sha256Hex(vector.canonical);
      expect(hash).toBe(expected);
    }
  });

  it("resolves semantic targets deterministically", () => {
    for (const vector of semanticVectors) {
      const index = buildMarkdownSemanticIndex(vector.content.split("\n"));
      const result = resolveMarkdownSemanticTarget(vector.semantic, index, undefined);
      if (vector.expected) {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.range).toEqual(vector.expected);
        }
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe(vector.errorCode);
        }
      }
    }
  });

  it("updates frontmatter deterministically", async () => {
    for (const vector of frontmatterUpdateVectors) {
      const lines = splitMarkdownLines(vector.content);
      const frontmatterRange = findFrontmatterRange(lines);
      const range = frontmatterRange ?? { start: 1, end: Math.max(1, lines.length) };
      const envelope: MarkdownOperationEnvelope = {
        mode: "markdown",
        doc_id: "doc-1",
        doc_frontier: "frontier:1",
        preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: range }],
        ops: [
          {
            op: "md_update_frontmatter",
            precondition_id: "p1",
            target: { key_path: vector.key_path },
            value: vector.value,
            create_if_missing: vector.create_if_missing,
          },
        ],
      };

      const policy = vector.create_if_missing
        ? { allow_frontmatter: true, frontmatter_formats: ["json"], max_frontmatter_bytes: 1024 }
        : { allow_frontmatter: true, frontmatter_formats: ["yaml"], max_frontmatter_bytes: 1024 };

      const result = await applyMarkdownLineOperations(vector.content, envelope, {
        frontmatterPolicy: policy,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const fragment of vector.expectedContains) {
          expect(result.content).toContain(fragment);
        }
      }
    }
  });

  nativeFlagStore.setOverride("native_accelerators_enabled", true);
  const native = getNativeMarkdownContent();
  nativeFlagStore.clearOverrides();
  const blockIdTest = native ? it : it.skip;

  blockIdTest("computes block ids per LFCC_MD_BLOCK_V1", async () => {
    if (!native) {
      throw new Error("Native markdown content binding unavailable.");
    }

    for (const vector of blockIdVectors) {
      const parsed = native.parseMarkdownBlocks(vector.content);
      const blocks = parsed.structure.blocks;
      const match = blocks.find(
        (block) => block.type === vector.block_type && block.line_range.start === vector.range.start
      );
      expect(match).toBeDefined();
      if (!match) {
        continue;
      }
      const lines = splitMarkdownLines(vector.content);
      const lineHash = await computeMarkdownLineHash(lines, vector.range);
      const canonical = `${vector.canonical}${lineHash}`;
      const expected = sha256Hex(canonical);
      expect(match.block_id).toBe(expected);
    }
  });

  nativeFlagStore.clearOverrides();
});
