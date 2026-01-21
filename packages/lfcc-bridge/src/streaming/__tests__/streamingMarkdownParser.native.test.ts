import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { getNativeStreamingMarkdownParser } from "@ku0/streaming-markdown-rs/node";
import { describe, it } from "vitest";
import { StreamingMarkdownParser } from "../streamingMarkdownParser";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const nativeBinding = getNativeStreamingMarkdownParser();
nativeFlagStore.clearOverrides();

const testFn = nativeBinding ? it : it.skip;

type Fixture = {
  label: string;
  chunks: string[];
};

const fixtures: Fixture[] = [
  {
    label: "basic",
    chunks: ["# Title\n\nHello **world**\n\n", "- item one\n- item two\n"],
  },
  {
    label: "ordered-and-task",
    chunks: ["1. First\n2. Second\n", "- [x] done\n- [ ] todo\n"],
  },
  {
    label: "table",
    chunks: ["| A | B |\n| --- | --- |\n| 1 | 2 |\n"],
  },
  {
    label: "code-block",
    chunks: ["```js\nconst x = 1;\n", "console.log(x);\n```\nAfter\n"],
  },
  {
    label: "open-inline",
    chunks: ["Unclosed **bold"],
  },
];

describe("Streaming markdown native parity", () => {
  testFn("matches JS parser outputs per chunk", () => {
    if (!nativeBinding) {
      throw new Error("Native streaming markdown binding unavailable.");
    }

    for (const fixture of fixtures) {
      const jsParser = new StreamingMarkdownParser();
      const nativeParser = new nativeBinding.StreamingMarkdownParser();

      for (const [index, chunk] of fixture.chunks.entries()) {
        const expected = jsParser.push(chunk);
        const actual = nativeParser.push(chunk);
        assertParity(expected, actual, { label: `${fixture.label} chunk ${index}` });
      }

      const expectedFlush = jsParser.flush();
      const actualFlush = nativeParser.flush();
      assertParity(expectedFlush, actualFlush, { label: `${fixture.label} flush` });
    }
  });
});
