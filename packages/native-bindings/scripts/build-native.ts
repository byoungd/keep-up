/**
 * Shared native module build script for Rust packages.
 *
 * Usage from a Rust package:
 *   tsx ../native-bindings/scripts/build-native.ts --release
 *
 * Or configure in package.json:
 *   "build": "tsx ../native-bindings/scripts/build-native.ts --release && tsc"
 *
 * Environment variables:
 *   CARGO_ARGS - Additional arguments to pass to cargo build
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const isRelease = args.has("--release");

// Determine package root from cwd (works when called from package directory)
const packageRoot = process.cwd();
const targetDir = path.join(packageRoot, "target", isRelease ? "release" : "debug");
const distDir = path.join(packageRoot, "dist");

// Read crate name from Cargo.toml
function getCrateName(): string {
  const cargoPath = path.join(packageRoot, "Cargo.toml");
  if (!existsSync(cargoPath)) {
    throw new Error(`Cargo.toml not found at ${cargoPath}`);
  }
  const content = readFileSync(cargoPath, "utf8");
  const match = content.match(/name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Could not parse crate name from Cargo.toml");
  }
  return match[1];
}

function getLibraryName(crateName: string): string {
  if (process.platform === "win32") {
    return `${crateName}.dll`;
  }
  if (process.platform === "darwin") {
    return `lib${crateName}.dylib`;
  }
  return `lib${crateName}.so`;
}

const crateName = getCrateName();

console.log(`Building ${crateName}${isRelease ? " (release)" : " (debug)"}...`);

const cargoArgs = process.env.CARGO_ARGS?.split(" ").filter(Boolean) ?? [];
execFileSync("cargo", ["build", ...(isRelease ? ["--release"] : []), ...cargoArgs], {
  cwd: packageRoot,
  stdio: "inherit",
});

const source = path.join(targetDir, getLibraryName(crateName));
if (!existsSync(source)) {
  throw new Error(`Native library not found at ${source}`);
}

mkdirSync(distDir, { recursive: true });
const destination = path.join(distDir, `${crateName}.node`);
copyFileSync(source, destination);

console.log(`✓ Copied ${crateName}.node to ${distDir}`);
