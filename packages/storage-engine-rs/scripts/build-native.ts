import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const isRelease = args.has("--release");

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(packageRoot, "target", isRelease ? "release" : "debug");
const distDir = path.join(packageRoot, "dist");

function getLibraryName(): string {
  if (process.platform === "win32") {
    return "storage_engine_rs.dll";
  }
  if (process.platform === "darwin") {
    return "libstorage_engine_rs.dylib";
  }
  return "libstorage_engine_rs.so";
}

// biome-ignore lint/suspicious/noConsole: Build script output
console.log(`Building storage-engine-rs (${isRelease ? "release" : "debug"})...`);
execFileSync("cargo", ["build", ...(isRelease ? ["--release"] : [])], {
  cwd: packageRoot,
  stdio: "inherit",
});

const source = path.join(targetDir, getLibraryName());
if (!existsSync(source)) {
  throw new Error(`Native library not found at ${source}`);
}

mkdirSync(distDir, { recursive: true });
const destination = path.join(distDir, "storage_engine_rs.node");
copyFileSync(source, destination);
// biome-ignore lint/suspicious/noConsole: Build script output
console.log(`Copied native binding to ${destination}`);
