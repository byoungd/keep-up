import { describe, expect, it } from "vitest";
import { parseSseText } from "./streamUtils";

describe("parseSseText", () => {
  it("returns empty for DONE or empty payload", () => {
    expect(parseSseText("")).toBe("");
    expect(parseSseText("[DONE]")).toBe("");
  });

  it("parses delta.content string", () => {
    const payload =
      '{"choices":[{"delta":{"content":"Hello"},"message":{"content":null}}],"model":"m"}';
    expect(parseSseText(payload)).toBe("Hello");
  });

  it("parses delta.content parts array", () => {
    const payload =
      '{"choices":[{"delta":{"content":[{"text":"Hello"},{"text":" world"}]}}],"model":"m"}';
    expect(parseSseText(payload)).toBe("Hello world");
  });

  it("parses message.content string fallback", () => {
    const payload = '{"choices":[{"message":{"content":"Full message"}}],"model":"m"}';
    expect(parseSseText(payload)).toBe("Full message");
  });

  it("parses message.content parts array fallback", () => {
    const payload =
      '{"choices":[{"message":{"content":[{"text":"Chunk"},{"text":"ed"}]}}],"model":"m"}';
    expect(parseSseText(payload)).toBe("Chunked");
  });

  it("parses choices.content parts array", () => {
    const payload =
      '{"choices":[{"content":[{"text":"Line "},{"type":"text","text":"two"}]}],"model":"m"}';
    expect(parseSseText(payload)).toBe("Line two");
  });

  it("ignores malformed JSON", () => {
    expect(parseSseText("{malformed")).toBe("");
  });
});
