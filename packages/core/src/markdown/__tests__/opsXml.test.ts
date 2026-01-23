import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_MANIFEST, type MarkdownPolicyV1 } from "../../kernel/policy/types.js";
import { applyMarkdownOpsXml, mapMarkdownErrorToEnvelope, parseMarkdownOpsXml } from "../opsXml.js";

const createMarkdownPolicy = (overrides?: Partial<MarkdownPolicyV1>): MarkdownPolicyV1 => ({
  version: "v1",
  enabled: true,
  parser: {
    profile: "commonmark_0_30",
    extensions: {
      gfm_tables: true,
      gfm_task_lists: true,
      gfm_strikethrough: true,
      gfm_autolink: true,
      footnotes: true,
      wikilinks: true,
      math: true,
    },
    frontmatter_formats: ["yaml", "toml"],
  },
  canonicalizer: {
    version: "v1",
    mode: "source_preserving",
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
      fence_char: "`",
      fence_length: 3,
    },
  },
  sanitization: {
    version: "v1",
    allowed_block_types: ["md_heading", "md_paragraph"],
    allowed_mark_types: ["md_strong", "md_emphasis"],
    allow_html_blocks: true,
    allow_frontmatter: true,
    reject_unknown_structure: true,
    allowed_languages: undefined,
    blocked_languages: [],
    max_code_fence_lines: 200,
    link_url_policy: "moderate",
    image_url_policy: "permissive",
    max_file_lines: 2000,
    max_line_length: 400,
    max_heading_depth: 6,
    max_list_depth: 6,
    max_frontmatter_bytes: 8192,
  },
  targeting: {
    require_content_hash: false,
    require_context: false,
    max_semantic_search_lines: 400,
    max_context_prefix_chars: 200,
  },
  ...overrides,
});

const baseCapabilities = {
  ...DEFAULT_POLICY_MANIFEST.capabilities,
  markdown_content_mode: true,
  markdown_frontmatter: true,
  markdown_frontmatter_json: true,
  markdown_code_fence_syntax: true,
  markdown_line_targeting: true,
  markdown_semantic_targeting: true,
  markdown_gfm_tables: true,
  markdown_gfm_task_lists: true,
  markdown_gfm_strikethrough: true,
  markdown_gfm_autolink: true,
  markdown_footnotes: true,
  markdown_wikilinks: true,
  markdown_math: true,
};

describe("Markdown ops_xml parser", () => {
  it("parses markdown ops with decoded content", () => {
    const result = parseMarkdownOpsXml(
      `<md_replace_lines precondition="p1" start="1" end="2">alpha &amp; bravo</md_replace_lines>`
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ops).toEqual([
        {
          op: "md_replace_lines",
          precondition_id: "p1",
          target: { line_range: { start: 1, end: 2 } },
          content: "alpha & bravo",
        },
      ]);
    }
  });

  it("rejects mixed markdown and rich-text ops", () => {
    const result = parseMarkdownOpsXml(
      `<md_delete_lines precondition="p1" start="1" end="1"/><replace_spans></replace_spans>`
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_REQUEST");
      expect(result.error.message).toContain("Markdown ops cannot be mixed");
    }
  });

  it("rejects invalid numeric attributes", () => {
    const result = parseMarkdownOpsXml(
      `<md_replace_block precondition="p1" heading="# Title" nth="0">Body</md_replace_block>`
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_TARGET");
      expect(result.error.message).toContain("nth");
    }
  });
});

describe("Markdown ops_xml gateway helpers", () => {
  it("rejects extensions when capability is disabled", async () => {
    const policy = createMarkdownPolicy();
    const capabilities = { ...baseCapabilities, markdown_gfm_tables: false };

    const result = await applyMarkdownOpsXml(
      "alpha",
      {
        doc_id: "doc-1",
        doc_frontier: "frontier-1",
        ops_xml: `<md_delete_lines precondition="p1" start="1" end="1"/>`,
        preconditions: [{ v: 1, mode: "markdown", id: "p1", line_range: { start: 1, end: 1 } }],
      },
      { policy, capabilities }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_REQUEST");
    }
  });

  it("uses policy fence defaults when missing", async () => {
    const policy = createMarkdownPolicy({
      canonicalizer: {
        version: "v1",
        mode: "source_preserving",
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
      },
    });

    const result = await applyMarkdownOpsXml(
      "# Intro\nBody",
      {
        doc_id: "doc-1",
        doc_frontier: "frontier-1",
        ops_xml:
          '<md_insert_code_fence precondition="p1" heading="# Intro">console.log(1)</md_insert_code_fence>',
        preconditions: [
          {
            v: 1,
            mode: "markdown",
            id: "p1",
            semantic: { kind: "heading", heading_text: "Intro" },
          },
        ],
      },
      { policy, capabilities: baseCapabilities }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("# Intro\n~~~~\nconsole.log(1)\n~~~~\nBody");
    }
  });

  it("rejects frontmatter ops when frontmatter capability is disabled", async () => {
    const policy = createMarkdownPolicy();
    const capabilities = { ...baseCapabilities, markdown_frontmatter: false };

    const result = await applyMarkdownOpsXml(
      "---\nname: Example\n---\nBody",
      {
        doc_id: "doc-1",
        doc_frontier: "frontier-1",
        ops_xml: `<md_update_frontmatter precondition="p1" key="name">Updated</md_update_frontmatter>`,
        preconditions: [
          {
            v: 1,
            mode: "markdown",
            id: "p1",
            line_range: { start: 1, end: 3 },
          },
        ],
      },
      { policy, capabilities }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_FRONTMATTER_INVALID");
    }
  });

  it("maps markdown errors to envelope responses", () => {
    const mapped = mapMarkdownErrorToEnvelope({
      code: "MCM_CONTENT_HASH_MISMATCH",
      message: "Hash mismatch",
    });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("AI_PRECONDITION_FAILED");
  });
});
