import { Command } from "commander";
import { ConfigStore, parseConfigValue } from "../utils/configStore";
import { writeStdout } from "../utils/terminal";

export function configCommand(): Command {
  return new Command("config")
    .description("Manage configuration")
    .addCommand(showConfigCommand())
    .addCommand(setConfigCommand());
}

function showConfigCommand(): Command {
  return new Command("show").description("Show current configuration").action(async () => {
    const store = new ConfigStore();
    const config = await store.load();
    writeStdout(JSON.stringify(config, null, 2));
  });
}

function setConfigCommand(): Command {
  return new Command("set")
    .description("Set a configuration value")
    .argument("<key>", "Configuration key")
    .argument("<value>", "Configuration value")
    .action(async (key: string, value: string) => {
      const store = new ConfigStore();
      const config = await store.load();
      config[key] = parseConfigValue(value);
      await store.save(config);
      writeStdout(`Set ${key} = ${value}`);
    });
}
