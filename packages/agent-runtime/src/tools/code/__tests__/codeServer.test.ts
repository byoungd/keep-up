import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SECURITY_PRESETS, type ToolContext, type ToolPermissions } from "../../../types";
import { CodeToolServer } from "../codeServer";

type FilePermission = ToolPermissions["file"];

function createContext(filePermission: FilePermission): ToolContext {
  return {
    security: {
      ...SECURITY_PRESETS.safe,
      permissions: { ...SECURITY_PRESETS.safe.permissions, file: filePermission },
    },
  };
}

describe("CodeToolServer", () => {
  let dir: string;
  let filePath: string;
  let server: CodeToolServer;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ku0-code-server-"));
    filePath = join(dir, "sample.txt");
    await writeFile(filePath, ["alpha", "beta", "gamma"].join("\n"), "utf-8");
    server = new CodeToolServer();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("denies read_file when file access is disabled", async () => {
    const result = await server.callTool(
      { name: "read_file", arguments: { path: filePath } },
      createContext("none")
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("reads file content when permitted", async () => {
    const result = await server.callTool(
      { name: "read_file", arguments: { path: filePath, start_line: 1, end_line: 2 } },
      createContext("read")
    );

    expect(result.success).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("File:");
    expect(text).toContain("1: alpha");
    expect(text).toContain("2: beta");
  });

  it("lists files in a directory", async () => {
    const result = await server.callTool(
      { name: "list_files", arguments: { path: dir, max_depth: 1 } },
      createContext("read")
    );

    expect(result.success).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Files in");
    expect(text).toContain("sample.txt");
  });

  it("rejects edits when file access is read-only", async () => {
    const result = await server.callTool(
      {
        name: "edit_file",
        arguments: {
          path: filePath,
          edits: [{ start_line: 2, end_line: 2, replacement: "delta" }],
          validate_syntax: false,
        },
      },
      createContext("read")
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("performs a dry-run edit when permitted", async () => {
    const result = await server.callTool(
      {
        name: "edit_file",
        arguments: {
          path: filePath,
          edits: [{ start_line: 2, end_line: 2, replacement: "delta" }],
          dry_run: true,
          validate_syntax: false,
        },
      },
      createContext("workspace")
    );

    expect(result.success).toBe(true);
    const text = result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Edit successful");
    expect(text).toContain("diff");
  });
});
