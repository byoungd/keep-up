import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listFilesMock = vi.fn(() => [{ path: "mock.txt", type: "file", size: 123 }]);

vi.mock(
  "@ku0/gitignore-rs",
  () => ({
    getNativeBinding: vi.fn(),
    hasNativeSupport: () => true,
    isIgnored: vi.fn(),
    listFiles: listFilesMock,
  }),
  { virtual: true }
);

describe("fileSystem listFiles (gitignore-rs)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-gitignore-test-"));
    listFilesMock.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses gitignore-rs when available", async () => {
    const { listFiles } = await import("../fileSystem");

    const entries = await listFiles(tempDir, {
      maxDepth: 2,
      includeHidden: true,
      respectGitignore: true,
    });

    expect(entries).toEqual([{ path: "mock.txt", type: "file", size: 123 }]);
    expect(listFilesMock).toHaveBeenCalledWith(tempDir, {
      maxDepth: 2,
      includeHidden: true,
      respectGitignore: true,
    });
  });
});
