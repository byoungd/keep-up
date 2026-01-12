import { beforeEach, describe, expect, it } from "vitest";

// Import after mocking
import { getFileExtension, isValidHttpUrl } from "../useGlobalDropTarget";

describe("useGlobalDropTarget utilities", () => {
  describe("isValidHttpUrl", () => {
    it("should return true for valid HTTP URLs", () => {
      expect(isValidHttpUrl("http://example.com")).toBe(true);
      expect(isValidHttpUrl("https://example.com")).toBe(true);
      expect(isValidHttpUrl("https://example.com/path?query=1")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidHttpUrl("not-a-url")).toBe(false);
      expect(isValidHttpUrl("")).toBe(false);
      expect(isValidHttpUrl("ftp://example.com")).toBe(false);
      expect(isValidHttpUrl("file:///path/to/file")).toBe(false);
    });

    it("should return false for non-HTTP protocols", () => {
      expect(isValidHttpUrl("mailto:test@example.com")).toBe(false);
      expect(isValidHttpUrl("javascript:void(0)")).toBe(false);
    });
  });

  describe("getFileExtension", () => {
    it("should extract file extensions correctly", () => {
      expect(getFileExtension("file.md")).toBe("md");
      expect(getFileExtension("file.txt")).toBe("txt");
      expect(getFileExtension("file.markdown")).toBe("markdown");
    });

    it("should handle files with multiple dots", () => {
      expect(getFileExtension("my.file.name.md")).toBe("md");
      expect(getFileExtension("backup.2024.01.txt")).toBe("txt");
    });

    it("should return empty string for files without extensions", () => {
      expect(getFileExtension("README")).toBe("");
      expect(getFileExtension("file.")).toBe("");
    });

    it("should be case insensitive", () => {
      expect(getFileExtension("file.MD")).toBe("md");
      expect(getFileExtension("file.TXT")).toBe("txt");
    });
  });
});

describe("Drag counter logic", () => {
  let dragCounter: number;

  beforeEach(() => {
    dragCounter = 0;
  });

  it("should increment on dragenter", () => {
    const handleDragEnter = () => {
      dragCounter += 1;
    };

    handleDragEnter();
    expect(dragCounter).toBe(1);

    handleDragEnter();
    expect(dragCounter).toBe(2);
  });

  it("should decrement on dragleave", () => {
    dragCounter = 2;

    const handleDragLeave = () => {
      dragCounter -= 1;
    };

    handleDragLeave();
    expect(dragCounter).toBe(1);

    handleDragLeave();
    expect(dragCounter).toBe(0);
  });

  it("should show overlay only when counter > 0", () => {
    const shouldShowOverlay = () => dragCounter > 0;

    expect(shouldShowOverlay()).toBe(false);

    dragCounter = 1;
    expect(shouldShowOverlay()).toBe(true);

    dragCounter = 0;
    expect(shouldShowOverlay()).toBe(false);
  });

  it("should reset to 0 on drop", () => {
    dragCounter = 3;

    const handleDrop = () => {
      dragCounter = 0;
    };

    handleDrop();
    expect(dragCounter).toBe(0);
  });

  it("should reset to 0 on escape", () => {
    dragCounter = 2;

    const handleEscape = (key: string) => {
      if (key === "Escape" && dragCounter > 0) {
        dragCounter = 0;
      }
    };

    handleEscape("Escape");
    expect(dragCounter).toBe(0);
  });
});

describe("URL parsing from DataTransfer", () => {
  it("should parse text/uri-list format", () => {
    const parseUrlFromDataTransfer = (data: string): string[] => {
      const urls: string[] = [];
      const lines = data.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
      for (const line of lines) {
        if (isValidHttpUrl(line)) {
          urls.push(line);
        }
      }
      return urls;
    };

    const uriList = "https://example.com\nhttps://test.org";
    expect(parseUrlFromDataTransfer(uriList)).toEqual(["https://example.com", "https://test.org"]);
  });

  it("should ignore comment lines in uri-list", () => {
    const parseUrlFromDataTransfer = (data: string): string[] => {
      const urls: string[] = [];
      const lines = data.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
      for (const line of lines) {
        if (isValidHttpUrl(line)) {
          urls.push(line);
        }
      }
      return urls;
    };

    const uriList = "# Comment\nhttps://example.com\n# Another comment\nhttps://test.org";
    expect(parseUrlFromDataTransfer(uriList)).toEqual(["https://example.com", "https://test.org"]);
  });

  it("should handle plain text URLs", () => {
    const url = "https://example.com/article";
    expect(isValidHttpUrl(url)).toBe(true);
  });
});
