import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const isRelease = args.has("--release");

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = path.join(packageRoot, "native");
const targetDir = path.join(nativeRoot, "target", isRelease ? "release" : "debug");
const distDir = path.join(packageRoot, "dist");

function getLibraryName() {
  if (process.platform === "win32") {
    return "persistence_store_rs.dll";
  }
  if (process.platform === "darwin") {
    return "libpersistence_store_rs.dylib";
  }
  return "libpersistence_store_rs.so";
}

execFileSync("cargo", ["build", ...(isRelease ? ["--release"] : [])], {
  cwd: nativeRoot,
  stdio: "inherit",
});

const source = path.join(targetDir, getLibraryName());
if (!existsSync(source)) {
  throw new Error(`Native library not found at ${source}`);
}

mkdirSync(distDir, { recursive: true });
const destination = path.join(distDir, "persistence_store_rs.node");
copyFileSync(source, destination);
