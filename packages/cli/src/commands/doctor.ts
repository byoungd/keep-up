import { existsSync } from "node:fs";
import { getConfiguredProviders, resolveProviderFromEnv } from "@ku0/ai-core";
import { Command } from "commander";
import { ConfigStore } from "../utils/configStore";
import { resolveRuntimeConfigString } from "../utils/runtimeOptions";
import { resolveCliPath, resolveCliStateDir } from "../utils/statePaths";
import { writeStdout } from "../utils/terminal";
import { resolveTuiBinary, resolveTuiHost } from "../utils/tui";

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Check CLI configuration and environment")
    .action(async () => {
      const report = await collectDoctorReport();
      const exitCode = renderDoctorReport(report);
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });
}

type DoctorReport = {
  configPath: string;
  configExists: boolean;
  stateDir: string;
  provider: string;
  model: string;
  output: string;
  approvalMode: string;
  providers: string[];
  providerMissingEnv: boolean;
  tuiBinary?: string;
  tuiHost?: string;
};

async function collectDoctorReport(): Promise<DoctorReport> {
  const configStore = new ConfigStore();
  const config = await configStore.load();
  const configPath = resolveCliPath("cli-config.json");
  const stateDir = resolveCliStateDir();
  const providers = getConfiguredProviders();

  const provider =
    resolveRuntimeConfigString(undefined, config.provider, "KEEPUP_PROVIDER") ?? "auto";
  const model = resolveRuntimeConfigString(undefined, config.model, "KEEPUP_MODEL") ?? "auto";
  const output = resolveRuntimeConfigString(undefined, config.output, "KEEPUP_OUTPUT") ?? "text";
  const approvalMode =
    resolveRuntimeConfigString(undefined, config.approvalMode, "KEEPUP_APPROVAL_MODE") ?? "ask";
  const providerMissingEnv = isProviderMissingEnv(provider);

  return {
    configPath,
    configExists: existsSync(configPath),
    stateDir,
    provider,
    model,
    output,
    approvalMode,
    providers,
    providerMissingEnv,
    tuiBinary: resolveTuiBinary(),
    tuiHost: resolveTuiHost(),
  };
}

function renderDoctorReport(report: DoctorReport): number {
  writeStdout("Keepup Doctor");
  writeStdout(`- Config file: ${report.configPath} (${report.configExists ? "found" : "missing"})`);
  writeStdout(`- State dir: ${report.stateDir}`);
  writeStdout(`- Provider: ${report.provider}`);
  writeStdout(`- Model: ${report.model}`);
  writeStdout(`- Output: ${report.output}`);
  writeStdout(`- Approval mode: ${report.approvalMode}`);

  if (report.providers.length === 0) {
    writeStdout("- Providers configured: none (set OPENAI_API_KEY/ANTHROPIC_API_KEY/etc)");
  } else {
    writeStdout(`- Providers configured: ${report.providers.join(", ")}`);
    if (report.providerMissingEnv) {
      writeStdout(`- Provider ${report.provider} missing required environment config`);
    }
  }

  writeStdout(`- TUI binary: ${report.tuiBinary ?? "not found"}`);
  writeStdout(`- TUI host: ${report.tuiHost ?? "not found"}`);

  if (report.providers.length === 0 || report.providerMissingEnv) {
    return 1;
  }
  return 0;
}

function isProviderMissingEnv(provider: string): boolean {
  if (!provider || provider === "auto") {
    return false;
  }
  return !resolveProviderFromEnv(provider);
}
