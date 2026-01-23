import { getNativeMarkdownContent } from "@ku0/markdown-content-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, it } from "vitest";
import {
  applyMarkdownLineOperations,
  computeMarkdownContentHash,
  computeMarkdownLineHash,
  type MarkdownOperationEnvelope,
  splitMarkdownLines,
} from "../index.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeMarkdownContent();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

describe("Markdown content native parity", () => {
  testFn("matches line and content hashing", async () => {
    if (!native) {
      throw new Error("Native markdown content binding unavailable.");
    }

    const content = "---\nname: Test\n---\nLine 1\r\nLine 2";
    const lines = splitMarkdownLines(content);
    const range = { start: 2, end: 2 };

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    let expectedLine: string;
    let expectedContent: string;
    try {
      expectedLine = await computeMarkdownLineHash(lines, range);
      expectedContent = await computeMarkdownContentHash(content);
    } finally {
      nativeFlagStore.clearOverrides();
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", true);
    let actualLine: string;
    let actualContent: string;
    try {
      actualLine = await computeMarkdownLineHash(lines, range);
      actualContent = await computeMarkdownContentHash(content);
    } finally {
      nativeFlagStore.clearOverrides();
    }

    assertParity(expectedLine, actualLine, { label: "markdown line hash parity" });
    assertParity(expectedContent, actualContent, { label: "markdown content hash parity" });
  });

  testFn("matches line-based operations", async () => {
    if (!native) {
      throw new Error("Native markdown content binding unavailable.");
    }

    const content = "# Intro\nBody\nFooter";
    const lines = splitMarkdownLines(content);
    const range = { start: 2, end: 2 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: "doc-1",
      doc_frontier: "frontier:1",
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          line_range: range,
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: range },
          content: "Updated",
        },
      ],
    };

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    let expected: Awaited<ReturnType<typeof applyMarkdownLineOperations>>;
    try {
      expected = await applyMarkdownLineOperations(content, envelope);
    } finally {
      nativeFlagStore.clearOverrides();
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", true);
    let actual: Awaited<ReturnType<typeof applyMarkdownLineOperations>>;
    try {
      actual = await applyMarkdownLineOperations(content, envelope);
    } finally {
      nativeFlagStore.clearOverrides();
    }

    assertParity(expected, actual, { label: "markdown line ops parity" });
  });
});
