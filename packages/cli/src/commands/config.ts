import { Command } from "commander";
import {
  ConfigStore,
  parseConfigValue,
  setConfigValue,
  unsetConfigValue,
} from "../utils/configStore";
import { writeStdout } from "../utils/terminal";

export function configCommand(): Command {
  return new Command("config")
    .description("Manage configuration")
    .addCommand(showConfigCommand())
    .addCommand(setConfigCommand())
    .addCommand(unsetConfigCommand());
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
      setConfigValue(config, key, parseConfigValue(value));
      await store.save(config);
      writeStdout(`Set ${key} = ${value}`);
    });
}

function unsetConfigCommand(): Command {
  return new Command("unset")
    .description("Remove a configuration value")
    .argument("<key>", "Configuration key")
    .action(async (key: string) => {
      const store = new ConfigStore();
      const config = await store.load();
      const removed = unsetConfigValue(config, key);
      if (!removed) {
        writeStdout(`No value found for ${key}`);
        return;
      }
      await store.save(config);
      writeStdout(`Removed ${key}`);
    });
}
