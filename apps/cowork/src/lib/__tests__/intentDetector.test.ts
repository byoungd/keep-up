import { describe, expect, it } from "vitest";
import { detectIntent, shouldPromptForTask } from "../intentDetector";

describe("detectIntent", () => {
  describe("task intent detection (Chinese)", () => {
    it("should detect direct action verbs as task", () => {
      const result = detectIntent("创建一个新文件");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });

    it("should detect polite task requests as task", () => {
      const result = detectIntent("帮我修改这个函数");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });

    it("should detect 请...创建 pattern as task", () => {
      const result = detectIntent("请帮我创建一个组件");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });
  });

  describe("task intent detection (English)", () => {
    it("should detect create commands as task", () => {
      const result = detectIntent("create a new component");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });

    it("should detect fix commands as task", () => {
      const result = detectIntent("fix the login bug");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });

    it("should detect polite requests as task", () => {
      const result = detectIntent("please create a new file");
      expect(result.intent).toBe("task");
      expect(result.confidence).toBe("high");
    });
  });

  describe("chat intent detection", () => {
    it("should detect greetings as chat", () => {
      expect(detectIntent("hello").intent).toBe("chat");
      expect(detectIntent("你好").intent).toBe("chat");
      expect(detectIntent("hi there").intent).toBe("chat");
    });

    it("should detect questions as chat", () => {
      expect(detectIntent("what is a promise?").intent).toBe("chat");
      expect(detectIntent("how does this work?").intent).toBe("chat");
      expect(detectIntent("什么是 React?").intent).toBe("chat");
    });

    it("should detect sentences ending with ? as chat", () => {
      const result = detectIntent("is this correct?");
      expect(result.intent).toBe("chat");
    });

    it("should detect explain requests as chat", () => {
      const result = detectIntent("explain how hooks work");
      expect(result.intent).toBe("chat");
    });
  });

  describe("edge cases", () => {
    it("should handle empty input", () => {
      const result = detectIntent("");
      expect(result.intent).toBe("chat");
      expect(result.confidence).toBe("high");
    });

    it("should default short messages to chat", () => {
      const result = detectIntent("ok");
      expect(result.intent).toBe("chat");
    });

    it("should default ambiguous messages to chat", () => {
      const result = detectIntent("this is a long message that doesn't match any patterns");
      expect(result.intent).toBe("chat");
      expect(result.confidence).toBe("low");
    });
  });
});

describe("shouldPromptForTask", () => {
  it("should not prompt for high confidence tasks", () => {
    expect(shouldPromptForTask({ intent: "task", confidence: "high", reason: "" })).toBe(false);
  });

  it("should prompt for medium confidence tasks", () => {
    expect(shouldPromptForTask({ intent: "task", confidence: "medium", reason: "" })).toBe(true);
  });

  it("should not prompt for chat", () => {
    expect(shouldPromptForTask({ intent: "chat", confidence: "high", reason: "" })).toBe(false);
  });
});
