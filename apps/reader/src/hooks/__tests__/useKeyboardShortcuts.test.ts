import { describe, expect, it, vi } from "vitest";
import { createDefaultShortcuts } from "../useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  describe("createDefaultShortcuts", () => {
    it("should create empty array when no handlers provided", () => {
      const shortcuts = createDefaultShortcuts({});
      expect(shortcuts).toEqual([]);
    });

    it("should create slash menu shortcut when handler provided", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onToggleSlashMenu: handler });

      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].key).toBe("k");
      expect(shortcuts[0].meta).toBe(true);
    });

    it("should create annotation shortcut when handler provided", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onCreateAnnotation: handler });

      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].key).toBe("a");
      expect(shortcuts[0].meta).toBe(true);
      expect(shortcuts[0].shift).toBe(true);
    });

    it("should create escape shortcut when handler provided", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onEscape: handler });

      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0].key).toBe("Escape");
    });

    it("should create all shortcuts when all handlers provided", () => {
      const shortcuts = createDefaultShortcuts({
        onToggleSlashMenu: vi.fn(),
        onCreateAnnotation: vi.fn(),
        onEscape: vi.fn(),
      });

      expect(shortcuts).toHaveLength(3);
    });
  });

  describe("shortcut matching", () => {
    it("should match Cmd+K shortcut", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onToggleSlashMenu: handler });
      const shortcut = shortcuts[0];

      // Simulate matching logic
      const event = {
        key: "k",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      };

      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const metaMatch = shortcut.meta ? event.metaKey : true;

      expect(keyMatch).toBe(true);
      expect(metaMatch).toBe(true);
    });

    it("should match Cmd+Shift+A shortcut", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onCreateAnnotation: handler });
      const shortcut = shortcuts[0];

      const event = {
        key: "a",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      };

      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const metaMatch = shortcut.meta ? event.metaKey : true;
      const shiftMatch = shortcut.shift ? event.shiftKey : true;

      expect(keyMatch).toBe(true);
      expect(metaMatch).toBe(true);
      expect(shiftMatch).toBe(true);
    });

    it("should match Escape shortcut", () => {
      const handler = vi.fn();
      const shortcuts = createDefaultShortcuts({ onEscape: handler });
      const shortcut = shortcuts[0];

      const event = {
        key: "Escape",
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      };

      const keyMatch = event.key === shortcut.key;
      expect(keyMatch).toBe(true);
    });
  });
});
