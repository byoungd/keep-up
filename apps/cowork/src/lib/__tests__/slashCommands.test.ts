import { describe, expect, it } from "vitest";
import { getAvailableCommands, isPartialSlashCommand, parseSlashCommand } from "../slashCommands";

describe("parseSlashCommand", () => {
  describe("task commands", () => {
    it("should parse /task command with prompt", () => {
      const result = parseSlashCommand("/task create a new file");
      expect(result).toEqual({ type: "task", prompt: "create a new file" });
    });

    it("should parse /do command as task", () => {
      const result = parseSlashCommand("/do fix the bug");
      expect(result).toEqual({ type: "task", prompt: "fix the bug" });
    });

    it("should parse /run command as task", () => {
      const result = parseSlashCommand("/run build the project");
      expect(result).toEqual({ type: "task", prompt: "build the project" });
    });

    it("should parse task command without prompt", () => {
      const result = parseSlashCommand("/task");
      expect(result).toEqual({ type: "task", prompt: "" });
    });
  });

  describe("help command", () => {
    it("should parse /help command", () => {
      const result = parseSlashCommand("/help");
      expect(result).toEqual({ type: "help" });
    });
  });

  describe("chat mode", () => {
    it("should treat non-slash input as chat", () => {
      const result = parseSlashCommand("hello world");
      expect(result).toEqual({ type: "chat", content: "hello world" });
    });

    it("should treat unknown slash commands as chat", () => {
      const result = parseSlashCommand("/unknown command");
      expect(result).toEqual({ type: "chat", content: "/unknown command" });
    });

    it("should handle empty input", () => {
      const result = parseSlashCommand("");
      expect(result).toEqual({ type: "chat", content: "" });
    });

    it("should handle whitespace-only input", () => {
      const result = parseSlashCommand("   ");
      expect(result).toEqual({ type: "chat", content: "" });
    });
  });

  describe("case insensitivity", () => {
    it("should handle uppercase /TASK", () => {
      const result = parseSlashCommand("/TASK test");
      expect(result).toEqual({ type: "task", prompt: "test" });
    });
  });
});

describe("getAvailableCommands", () => {
  it("should return list of available commands", () => {
    const commands = getAvailableCommands();
    expect(commands).toHaveLength(4);
    expect(commands.map((c) => c.command)).toContain("/task");
    expect(commands.map((c) => c.command)).toContain("/help");
  });
});

describe("isPartialSlashCommand", () => {
  it("should return true for partial commands", () => {
    expect(isPartialSlashCommand("/")).toBe(true);
    expect(isPartialSlashCommand("/ta")).toBe(true);
  });

  it("should return false for complete commands", () => {
    expect(isPartialSlashCommand("/task test")).toBe(false);
  });

  it("should return false for non-slash input", () => {
    expect(isPartialSlashCommand("hello")).toBe(false);
  });
});
