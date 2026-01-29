import { describe, expect, it } from "vitest";
import {
  applyMarkdownLineOperations,
  computeMarkdownBlockId,
  computeMarkdownLineHash,
  type MarkdownOperationEnvelope,
  splitMarkdownLines,
} from "../index.js";

const docId = "doc-1";
const frontier = "frontier:1";
const baseCanonicalizerPolicy = {
  version: "v1",
  mode: "normalized",
  line_ending: "lf",
  preserve: {
    trailing_whitespace: true,
    multiple_blank_lines: true,
    heading_style: true,
    list_marker_style: true,
    emphasis_style: true,
    fence_style: true,
  },
  normalize: {
    heading_style: "atx",
    list_marker: "-",
    emphasis_char: "*",
    fence_char: "~",
    fence_length: 4,
  },
};
const baseSanitizationPolicy = {
  version: "v1",
  allowed_block_types: [],
  allowed_mark_types: [],
  allow_html_blocks: true,
  allow_frontmatter: true,
  reject_unknown_structure: false,
  max_code_fence_lines: 100,
  link_url_policy: "strict",
  image_url_policy: "strict",
  max_file_lines: 1000,
  max_line_length: 1000,
  max_heading_depth: 6,
  max_list_depth: 6,
  max_frontmatter_bytes: 1024,
};

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

  it("resolves semantic preconditions for line ops", async () => {
    const content = "# Intro\nDetails";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: range },
          content: "# Introduction",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("# Introduction\nDetails");
    }
  });

  it("replaces inner code fence ranges via semantic targeting", async () => {
    const content = ["```ts", "const a = 1", "const b = 2", "```"].join("\n");
    const lines = splitMarkdownLines(content);
    const targetRange = { start: 3, end: 3 };
    const hash = await computeMarkdownLineHash(lines, targetRange);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: {
            kind: "code_fence",
            language: "ts",
            inner_target: { kind: "line_range", line_offset: { start: 2, end: 2 } },
          },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: targetRange },
          content: "const b = 99",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe(["```ts", "const a = 1", "const b = 99", "```"].join("\n"));
    }
  });

  it("rejects block operations with inner targets", async () => {
    const content = ["```ts", "const a = 1", "```"].join("\n");
    const lines = splitMarkdownLines(content);
    const range = { start: 2, end: 2 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: {
            kind: "code_fence",
            language: "ts",
            inner_target: { kind: "line_range", line_offset: { start: 1, end: 1 } },
          },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_block",
          precondition_id: "p1",
          target: {
            semantic: {
              kind: "code_fence",
              language: "ts",
              inner_target: { kind: "line_range", line_offset: { start: 1, end: 1 } },
            },
          },
          content: "```ts\nconst z = 1\n```",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_TARGET");
    }
  });

  it("replaces code symbols within fences", async () => {
    const content = ["```ts", 'function greet() { return "hi"; }', "const value = 1;", "```"].join(
      "\n"
    );
    const lines = splitMarkdownLines(content);
    const fenceRange = { start: 1, end: 4 };
    const fenceHash = await computeMarkdownLineHash(lines, fenceRange);
    const fenceId = await computeMarkdownBlockId(lines, fenceRange, "md_code_fence");

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          line_range: fenceRange,
          content_hash: fenceHash,
        },
      ],
      ops: [
        {
          op: "md_replace_code_symbol",
          precondition_id: "p1",
          target: {
            code_fence_id: fenceId,
            symbol: { kind: "function", name: "greet" },
          },
          content: 'function greet() { return "hello"; }',
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe(
        ["```ts", 'function greet() { return "hello"; }', "const value = 1;", "```"].join("\n")
      );
    }
  });

  it("inserts code members relative to symbols", async () => {
    const content = ["```ts", 'function greet() { return "hi"; }', "const value = 1;", "```"].join(
      "\n"
    );
    const lines = splitMarkdownLines(content);
    const fenceRange = { start: 1, end: 4 };
    const fenceHash = await computeMarkdownLineHash(lines, fenceRange);
    const fenceId = await computeMarkdownBlockId(lines, fenceRange, "md_code_fence");

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          line_range: fenceRange,
          content_hash: fenceHash,
        },
      ],
      ops: [
        {
          op: "md_insert_code_member",
          precondition_id: "p1",
          target: { code_fence_id: fenceId, after_symbol: "greet" },
          content: "const extra = 2;",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe(
        [
          "```ts",
          'function greet() { return "hi"; }',
          "const extra = 2;",
          "const value = 1;",
          "```",
        ].join("\n")
      );
    }
  });

  it("replaces semantic blocks", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_block",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          content: "# Introduction",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("# Introduction\nBody");
    }
  });

  it("inserts after semantic blocks", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_after",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          content: "Inserted",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("# Intro\nInserted\nBody");
    }
  });

  it("inserts before semantic blocks", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_before",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          content: "Inserted",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("Inserted\n# Intro\nBody");
    }
  });

  it("inserts code fences after semantic blocks", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_code_fence",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          language: "ts",
          content: 'console.log("hi");',
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expected = ["# Intro", "```ts", 'console.log("hi");', "```", "Body"].join("\n");
      expect(result.content).toBe(expected);
    }
  });

  it("rejects invalid code fence length", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_code_fence",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          content: 'console.log("hi");',
          fence_length: 2,
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_REQUEST");
    }
  });

  it("uses canonicalizer defaults for code fences", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_code_fence",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          language: "ts",
          content: 'console.log("hi");',
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope, {
      canonicalizerPolicy: baseCanonicalizerPolicy,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expected = ["# Intro", "~~~~ts", 'console.log("hi");', "~~~~", "Body"].join("\n");
      expect(result.content).toBe(expected);
    }
  });

  it("rejects disallowed code fence languages", async () => {
    const content = "# Intro\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 1 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "heading", heading_text: "Intro" },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_insert_code_fence",
          precondition_id: "p1",
          target: { semantic: { kind: "heading", heading_text: "Intro" } },
          language: "python",
          content: "print('hi')",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope, {
      sanitizationPolicy: {
        ...baseSanitizationPolicy,
        allowed_languages: ["ts"],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_LANGUAGE_DISALLOWED");
    }
  });

  it("rejects frontmatter when disallowed", async () => {
    const content = "---\nname: Example\n---\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 3 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: range, content_hash: hash }],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: range },
          content: "---\nname: Updated\n---",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope, {
      sanitizationPolicy: {
        ...baseSanitizationPolicy,
        allow_frontmatter: false,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_BLOCK_TYPE_DISALLOWED");
    }
  });

  it("updates frontmatter keys", async () => {
    const content = "---\nname: Example\n---\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 3 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: range, content_hash: hash }],
      ops: [
        {
          op: "md_update_frontmatter",
          precondition_id: "p1",
          target: { key_path: ["name"] },
          value: "Updated",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope, {
      frontmatterPolicy: {
        allow_frontmatter: true,
        frontmatter_formats: ["yaml"],
        max_frontmatter_bytes: 1024,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("name: Updated");
    }
  });

  it("creates frontmatter when missing", async () => {
    const content = "Body";
    const range = { start: 1, end: 1 };

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: range }],
      ops: [
        {
          op: "md_update_frontmatter",
          precondition_id: "p1",
          target: { key_path: ["title"] },
          value: "Created",
          create_if_missing: true,
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope, {
      frontmatterPolicy: {
        allow_frontmatter: true,
        frontmatter_formats: ["json"],
        max_frontmatter_bytes: 1024,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.startsWith(";;;\n")).toBe(true);
      expect(result.content).toContain('"title": "Created"');
    }
  });

  it("resolves frontmatter key preconditions for line ops", async () => {
    const content = "---\nname: Example\n---\nBody";
    const lines = splitMarkdownLines(content);
    const range = { start: 1, end: 3 };
    const hash = await computeMarkdownLineHash(lines, range);

    const envelope: MarkdownOperationEnvelope = {
      mode: "markdown",
      doc_id: docId,
      doc_frontier: frontier,
      preconditions: [
        {
          v: 1,
          mode: "markdown",
          id: "p1",
          semantic: { kind: "frontmatter_key", key_path: ["name"] },
          content_hash: hash,
        },
      ],
      ops: [
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: range },
          content: "---\nname: Updated\n---",
        },
      ],
    };

    const result = await applyMarkdownLineOperations(content, envelope);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("name: Updated");
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
