import { describe, expect, it } from "vitest";
import {
  applyMarkdownLineOperations,
  computeMarkdownLineHash,
  type MarkdownOperationEnvelope,
  splitMarkdownLines,
} from "../index.js";

const docId = "doc-1";
const frontier = "frontier:1";

describe("Markdown line-based operations", () => {
  it("applies replace and insert operations", async () => {
    const content = "alpha\nbravo\ncharlie\ndelta";
    const lines = splitMarkdownLines(content);
    const replaceRange = { start: 2, end: 3 };
    const insertAnchor = { start: 4, end: 4 };

    const replaceHash = await computeMarkdownLineHash(lines, replaceRange);
    const insertHash = await computeMarkdownLineHash(lines, insertAnchor);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          line_range: replaceRange,
          content_hash: replaceHash,
        },
        {
          v: 1,
          mode: "markdown",
          id: "p2",
          line_range: insertAnchor,
          content_hash: insertHash,
        },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: replaceRange },
          content: "BRAVO\nCHARLIE",
        },
        {
          op: "md_insert_lines",
          precondition_id: "p2",
          target: { after_line: 4 },
          content: "echo",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("alpha\nBRAVO\nCHARLIE\ndelta\necho");
    }
  });

  it("applies delete operations", async () => {
    const content = "one\ntwo\nthree";
    const lines = splitMarkdownLines(content);
    const range = { start: 2, end: 2 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: range, content_hash: hash }],
      ops: [{ op: "md_delete_lines", precondition_id: "p1", target: { line_range: range } }],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("one\nthree");
    }
  });

  it("rejects content hash mismatches", async () => {
    const content = "red\nblue\ncyan";
    const range = { start: 2, end: 2 };

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          line_range: range,
          content_hash: "deadbeef",
        },
      ],
      ops: [{ op: "md_delete_lines", precondition_id: "p1", target: { line_range: range } }],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_CONTENT_HASH_MISMATCH");
    }
  });

  it("rejects overlapping operations", async () => {
    const content = "a\nb\nc";
    const lines = splitMarkdownLines(content);
    const range1 = { start: 1, end: 2 };
    const range2 = { start: 2, end: 2 };

    const hash1 = await computeMarkdownLineHash(lines, range1);
    const hash2 = await computeMarkdownLineHash(lines, range2);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        { v: 1, mode: "markdown", id: "p1", line_range: range1, content_hash: hash1 },
        { v: 1, mode: "markdown", id: "p2", line_range: range2, content_hash: hash2 },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: range1 },
          content: "A\nB",
        },
        { op: "md_delete_lines", precondition_id: "p2", target: { line_range: range2 } },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_OPERATION_OVERLAP");
    }
  });
});
