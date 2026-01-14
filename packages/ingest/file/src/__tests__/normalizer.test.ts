import { canonicalizeText, computeCanonicalHash } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { Normalizer } from "../normalizer";
import { MarkdownParser } from "../parsers/markdown";

describe("ingest-file MDVP alignment", () => {
  const parser = new MarkdownParser();
  const normalizer = new Normalizer();

  it("preserves Markdown markers and intra-line whitespace", async () => {
    const md = Buffer.from(
      "# Title\r\n\r\n- item one\r\n- item  two\r\n\r\nParagraph with  double  spaces and   tabs\tstays.\r\n\r\n> quote line\r\n"
    );

    const result = await parser.parse(md);
    const meta = normalizer.toIngestionMeta(result, { filename: "test.md" });

    expect(meta.content).toBe(
      "# Title\n\n- item one\n- item  two\n\nParagraph with  double  spaces and   tabs\tstays.\n\n> quote line"
    );
  });

  it("derives sourceId from canonical hash for buffer sources", async () => {
    const raw = "# Alpha\r\n\r\nBeta";
    const buffer = Buffer.from(raw);
    const result = await parser.parse(buffer);
    const meta = normalizer.toIngestionMeta(result, { filename: "alpha.md", buffer });

    const canonical = canonicalizeText(raw);
    const expectedHash = computeCanonicalHash(canonical.blocks.map((text) => ({ text }))).docHash;

    expect(meta.content).toBe("# Alpha\n\nBeta");
    expect(meta.sourceId).toBe(`file-buffer://alpha.md:${expectedHash}`);
  });
});
