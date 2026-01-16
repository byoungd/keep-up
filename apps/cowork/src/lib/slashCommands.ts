/**
 * Slash Command Parser
 * Parses user input for slash commands like /task, /do, /help
 */

export type SlashCommand =
  | { type: "task"; prompt: string }
  | { type: "help" }
  | { type: "chat"; content: string };

const SLASH_COMMANDS: Record<string, SlashCommand["type"]> = {
  "/task": "task",
  "/do": "task",
  "/run": "task",
  "/help": "help",
};

/**
 * Parse user input for slash commands
 * @param input Raw user input
 * @returns Parsed command with type and content
 */
export function parseSlashCommand(input: string): SlashCommand {
  const trimmed = input.trim();

  // Check for slash command prefix
  if (!trimmed.startsWith("/")) {
    return { type: "chat", content: trimmed };
  }

  // Extract command and rest of input
  const spaceIndex = trimmed.indexOf(" ");
  const command =
    spaceIndex > 0 ? trimmed.slice(0, spaceIndex).toLowerCase() : trimmed.toLowerCase();
  const rest = spaceIndex > 0 ? trimmed.slice(spaceIndex + 1).trim() : "";

  const commandType = SLASH_COMMANDS[command];

  if (!commandType) {
    // Unknown slash command, treat as chat
    return { type: "chat", content: trimmed };
  }

  switch (commandType) {
    case "task":
      return { type: "task", prompt: rest || "" };
    case "help":
      return { type: "help" };
    default:
      return { type: "chat", content: trimmed };
  }
}

/**
 * Get list of available slash commands for autocomplete
 */
export function getAvailableCommands(): Array<{ command: string; description: string }> {
  return [
    { command: "/task", description: "创建并执行任务" },
    { command: "/do", description: "创建并执行任务 (别名)" },
    { command: "/run", description: "创建并执行任务 (别名)" },
    { command: "/help", description: "显示帮助信息" },
  ];
}

/**
 * Check if input looks like an incomplete slash command
 */
export function isPartialSlashCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return false;
  }
  // If it's just "/" or a partial command without space
  return !trimmed.includes(" ") && trimmed.length < 10;
}
