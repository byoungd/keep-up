import type { EditorView } from "prosemirror-view";
import * as React from "react";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  keywords?: string[];
  section?: "Basic" | "Media" | "AI" | "Advanced";
  perform: (view: EditorView) => void;
  shortcut?: string;
}

export interface CommandRegistryContextValue {
  commands: CommandAction[];
  registerCommand: (command: CommandAction) => () => void;
  filteredCommands: (query: string) => CommandAction[];
}

const CommandRegistryContext = React.createContext<CommandRegistryContextValue | null>(null);

export function useCommandRegistry() {
  const context = React.useContext(CommandRegistryContext);
  if (!context) {
    throw new Error("useCommandRegistry must be used within a CommandRegistryProvider");
  }
  return context;
}

export function CommandRegistryProvider({ children }: { children: React.ReactNode }) {
  const [commands, setCommands] = React.useState<CommandAction[]>([]);

  const registerCommand = React.useCallback((command: CommandAction) => {
    setCommands((prev) => {
      if (prev.find((c) => c.id === command.id)) {
        return prev;
      }
      return [...prev, command];
    });

    // Return unregister function
    return () => {
      setCommands((prev) => prev.filter((c) => c.id !== command.id));
    };
  }, []);

  const filteredCommands = React.useCallback(
    (query: string) => {
      if (!query) {
        return commands;
      }
      const lowerQuery = query.toLowerCase();
      return commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.keywords?.some((k) => k.toLowerCase().includes(lowerQuery)) ||
          cmd.description?.toLowerCase().includes(lowerQuery)
      );
    },
    [commands]
  );

  const value = React.useMemo(
    () => ({
      commands,
      registerCommand,
      filteredCommands,
    }),
    [commands, registerCommand, filteredCommands]
  );

  return (
    <CommandRegistryContext.Provider value={value}>{children}</CommandRegistryContext.Provider>
  );
}
