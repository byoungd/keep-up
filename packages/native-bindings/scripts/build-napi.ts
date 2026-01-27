import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type NapiBuildOptions = {
  packageRoot?: string;
  cargoCwd?: string;
  args?: string[];
};

function readFlagValue(args: string[], flag: string): string | undefined {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));
}

function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    if (
      existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      existsSync(path.join(current, ".git"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveTargetBaseDir(cargoRoot: string): string {
  const envDir = process.env.CARGO_TARGET_DIR;
  if (envDir) {
    return path.isAbsolute(envDir) ? envDir : path.resolve(cargoRoot, envDir);
  }
  const repoRoot = findRepoRoot(cargoRoot) ?? cargoRoot;
  return path.join(repoRoot, ".cache", "cargo-target");
}

function resolveCargoCwd(args: string[], packageRoot: string, fallback: string): string {
  const cargoCwdFlag = readFlagValue(args, "--cargo-cwd");
  if (cargoCwdFlag) {
    return cargoCwdFlag;
  }
  const nativeCandidate = path.join(packageRoot, fallback, "Cargo.toml");
  if (existsSync(nativeCandidate)) {
    return fallback;
  }
  return ".";
}

export function runNapiBuild(options: NapiBuildOptions = {}): void {
  const packageRoot = options.packageRoot ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const fallbackCargoCwd = options.cargoCwd ?? "native";
  const cargoCwd = resolveCargoCwd(args, packageRoot, fallbackCargoCwd);
  const cargoRoot = path.resolve(packageRoot, cargoCwd);
  const targetBaseDir = resolveTargetBaseDir(cargoRoot);
  const napiArgs = ["build"];

  if (!hasFlag(args, "--cargo-cwd")) {
    napiArgs.push("--cargo-cwd", cargoCwd);
  }

  napiArgs.push(...args);

  // biome-ignore lint/suspicious/noConsole: Build script output
  console.log(`Running napi build (${path.relative(packageRoot, cargoRoot) || "."})...`);

  execFileSync("napi", napiArgs, {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CARGO_TARGET_DIR: targetBaseDir,
    },
  });
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  runNapiBuild();
}
