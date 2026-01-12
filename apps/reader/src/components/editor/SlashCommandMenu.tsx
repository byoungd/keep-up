import { cn } from "@keepup/shared/utils";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Heading1,
  Heading2,
  Heading3,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  SearchX,
  Sparkles,
  Type,
  Video,
} from "lucide-react";
import type { SlashCommand, SlashMenuState } from "../../lib/editor/slashMenuPlugin";

export type SlashCommandMenuProps = {
  state: SlashMenuState;
  onSelectCommand: (command: SlashCommand) => void;
  onQueryChange?: (query: string) => void;
};

/**
 * Slash Command Menu (Top-Tier UX)
 * Uses `cmdk` for accessible command palette and `framer-motion` for transitions.
 */
export function SlashCommandMenu({ state, onSelectCommand, onQueryChange }: SlashCommandMenuProps) {
  // Focus trap handling usually done by cmdk, but needing manual position logic
  const position = state.position || { top: 0, left: 0 };

  const transitions = {
    popover: {
      initial: { opacity: 0, scale: 0.97 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.97 },
      transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as const },
    },
  };

  return (
    <AnimatePresence>
      {state.active && (
        <div
          className="fixed z-9999 pointer-events-auto"
          style={{
            top: 0,
            left: 0,
            transform: `translate(${position.left}px, ${position.top}px)`,
          }}
        >
          <motion.div {...transitions.popover} className="pointer-events-auto">
            <Command
              className="w-72 max-h-[320px] overflow-hidden rounded-xl border border-border/60 bg-popover/80 backdrop-blur-xl shadow-2xl flex flex-col"
              label="Slash Command Menu"
              role="menu"
              data-testid="slash-command-menu"
              loop
              onKeyDown={(e) => {
                // Prevent editor from stealing focus or events (hacky but needed for portal)
                e.stopPropagation();
              }}
            >
              <div className="flex items-center border-b border-border/50 px-3 py-2">
                <Sparkles className="mr-2 h-4 w-4 shrink-0 text-accent-indigo" />
                <Command.Input
                  autoFocus
                  placeholder="Type a command..."
                  value={state.query}
                  onValueChange={(value) => {
                    onQueryChange?.(value);
                  }}
                  className="flex h-5 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <Command.List className="overflow-y-auto overflow-x-hidden p-1.5 scroll-py-2 custom-scrollbar">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <SearchX className="h-5 w-5 text-muted-foreground/70" />
                  <span>No matches found</span>
                </Command.Empty>

                {Object.entries(groupCommandsByCategory(state.commands)).map(
                  ([category, commands]) => (
                    <Command.Group
                      key={category}
                      heading={getCategoryLabel(category)}
                      className="mb-2 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-2"
                    >
                      {commands.map((command, _index) => (
                        <CommandItem
                          key={command.id}
                          command={command}
                          isSelected={state.commands.indexOf(command) === state.selectedIndex}
                          onSelect={() => onSelectCommand(command)}
                        />
                      ))}
                    </Command.Group>
                  )
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function groupCommandsByCategory(commands: SlashCommand[]) {
  const groups: Record<string, SlashCommand[]> = {};
  for (const cmd of commands) {
    if (!groups[cmd.category]) {
      groups[cmd.category] = [];
    }
    groups[cmd.category].push(cmd);
  }

  // Enforce order: AI -> Text -> Media -> List -> Advanced
  const orderedGroups: Record<string, SlashCommand[]> = {};
  const order = ["ai", "text", "media", "list", "advanced"];

  for (const cat of order) {
    if (groups[cat]) {
      orderedGroups[cat] = groups[cat];
    }
  }

  // Add any remaining categories (fallback)
  for (const cat of Object.keys(groups)) {
    if (!orderedGroups[cat]) {
      orderedGroups[cat] = groups[cat];
    }
  }

  return orderedGroups;
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "ai":
      return "Magic";
    case "text":
      return "Basic Blocks";
    case "media":
      return "Media";
    case "list":
      return "Lists";
    case "advanced":
      return "Advanced";
    default:
      return category;
  }
}

function CommandItem({
  command,
  isSelected,
  onSelect,
}: { command: SlashCommand; isSelected: boolean; onSelect: () => void }) {
  const Icon = getIcon(command.id);
  const isAI = command.category === "ai";

  return (
    <Command.Item
      value={command.label}
      onSelect={onSelect}
      data-selected={isSelected}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-lg px-2 py-2 text-sm outline-none transition-colors",
        "data-[selected=true]:bg-accent-indigo/10 data-[selected=true]:text-accent-indigo",
        isSelected && "bg-accent-indigo/10",
        // Special styling for AI commands when selected
        isAI &&
          isSelected &&
          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-0 mr-3 transition-colors",
          isSelected && "border-accent-indigo/30 bg-accent-indigo/10",
          // AI Icon styling
          isAI &&
            "border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400",
          isAI &&
            isSelected &&
            "border-purple-300 bg-purple-100 dark:border-purple-700 dark:bg-purple-900/40"
        )}
      >
        {Icon}
      </div>
      <div className="flex flex-col">
        <span className={cn("font-medium", isAI && "text-purple-700 dark:text-purple-300")}>
          {command.label}
        </span>
        <span className="text-[10px] text-muted-foreground">{command.description}</span>
      </div>
    </Command.Item>
  );
}

const getIcon = (id: string) => {
  if (id.startsWith("ai_")) {
    return <Sparkles className="h-4 w-4" />;
  }

  switch (id) {
    case "text":
      return <Type className="h-4 w-4" />;
    case "heading1":
      return <Heading1 className="h-4 w-4" />;
    case "heading2":
      return <Heading2 className="h-4 w-4" />;
    case "heading3":
      return <Heading3 className="h-4 w-4" />;
    case "bulletList":
      return <List className="h-4 w-4" />;
    case "orderedList":
      return <ListOrdered className="h-4 w-4" />;
    case "blockquote":
      return <Quote className="h-4 w-4" />;
    case "divider":
      return <Minus className="h-4 w-4" />;
    case "video":
      return <Video className="h-4 w-4" />;
    case "embed":
      return <Link className="h-4 w-4" />;
    default:
      return <Box className="h-4 w-4" />;
  }
};
