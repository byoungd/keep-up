"use client";

import { useKeyboardShortcuts } from "@/context/KeyboardShortcutsContext";
import { useRouter } from "@/i18n/navigation";
import { buildProjectsPath } from "@/i18n/paths";
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  FileText,
  Focus,
  FolderKanban,
  Highlighter,
  Keyboard,
  type LucideIcon,
  Maximize2,
  Moon,
  PanelLeft,
  PanelRight,
  Rows2,
  Search,
  Sparkles,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Sun,
  X,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

export type CommandAction = {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  shortcut?: string[];
  section?: string;
  action: () => void;
};

const DEFAULT_SECTIONS = [
  "Quick Actions",
  "Navigation",
  "Split View",
  "Annotations",
  "AI",
  "Appearance",
  "Help",
];

export function useCommandPaletteLogic({
  additionalActions = [],
  onSearch,
}: {
  additionalActions?: CommandAction[];
  onSearch?: (query: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const { shortcuts, registerShortcut, unregisterShortcut } = useKeyboardShortcuts();

  // Register global toggle shortcut
  useEffect(() => {
    const toggleAction = {
      id: "toggle-command-palette",
      label: "Show Command Palette",
      keys: ["Cmd", "K"],
      section: "Navigation",
      action: () => setIsOpen((prev) => !prev),
    };
    registerShortcut(toggleAction);
    return () => unregisterShortcut(toggleAction.id);
  }, [registerShortcut, unregisterShortcut]);

  // Register core navigation shortcuts
  useEffect(() => {
    const coreActions: CommandAction[] = [
      {
        id: "new-document",
        label: "New Document",
        description: "Create a new document",
        icon: FileText,
        shortcut: ["Cmd", "N"],
        section: "Quick Actions",
        action: () => {
          setIsOpen(false);
          window.dispatchEvent(new CustomEvent("open-create-document"));
        },
      },
      {
        id: "ask-ai",
        label: "Ask AI",
        description: "Open AI assistant",
        icon: Sparkles,
        shortcut: ["Cmd", "J"],
        section: "Quick Actions",
        action: () => {
          window.dispatchEvent(new CustomEvent("open-ai-panel"));
          setIsOpen(false);
        },
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        description: "Toggle dark/light theme",
        icon: theme === "dark" ? Sun : Moon,
        section: "Appearance",
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          setIsOpen(false);
        },
      },
      {
        id: "go-to-projects",
        label: "Go to Projects",
        description: "View all topics",
        icon: FolderKanban,
        section: "Navigation",
        action: () => {
          router.push(buildProjectsPath(locale));
          setIsOpen(false);
        },
      },
      {
        id: "export-document",
        label: "Export Document",
        description: "Download as Markdown, HTML, or PDF",
        icon: Download,
        shortcut: ["Cmd", "Shift", "E"],
        section: "Quick Actions",
        action: () => {
          window.dispatchEvent(new CustomEvent("lfcc:open-export-dialog"));
          setIsOpen(false);
        },
      },
    ];

    for (const action of coreActions) {
      registerShortcut({
        id: action.id,
        label: action.label,
        description: action.description,
        keys: action.shortcut || [],
        section: action.section,
        action: action.action,
        // We pass the action directly to the shortcut context, but for the palette we might want to wrap it to close
      });
    }

    return () => {
      for (const a of coreActions) {
        unregisterShortcut(a.id);
      }
    };
  }, [registerShortcut, unregisterShortcut, theme, setTheme, router, locale]);

  // Helper to map shortcut IDs to icons
  const getShortcutIcon = useCallback(
    (id: string): LucideIcon => {
      switch (id) {
        case "new-document":
          return FileText;
        case "go-to-projects":
          return FolderKanban;
        case "ask-ai":
          return Sparkles;
        case "toggle-theme":
          return theme === "dark" ? Sun : Moon;
        case "toggle-command-palette":
          return Search;
        case "annotation-next":
          return ChevronRight;
        case "annotation-prev":
          return ChevronLeft;
        case "quick-highlight":
          return Highlighter;
        case "toggle-focus-mode":
          return Focus;
        case "keyboard-shortcuts":
          return Keyboard;
        case "export-document":
          return Download;
        // Split view commands
        case "split-editor-right":
          return SplitSquareHorizontal;
        case "split-editor-down":
          return SplitSquareVertical;
        case "toggle-split-direction":
          return Rows2;
        case "reset-split-ratio":
          return Columns2;
        case "close-split-view":
          return X;
        case "focus-left-pane":
          return PanelLeft;
        case "focus-right-pane":
          return PanelRight;
        case "swap-panes":
          return ArrowLeftRight;
        case "maximize-current-pane":
          return Maximize2;
        default:
          return ArrowRight;
      }
    },
    [theme]
  );

  // Combine context shortcuts with any additional ones prop-passed
  const contextActions: CommandAction[] = shortcuts.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    shortcut: s.keys,
    section: s.section,
    action: () => {
      s.action();
      setIsOpen(false);
    },
    icon: getShortcutIcon(s.id),
  }));

  const allActions = [...contextActions, ...additionalActions];

  // Group actions by section
  const groupedActions = allActions.reduce(
    (acc, action) => {
      const section = action.section || "Other";
      if (!acc[section]) {
        acc[section] = [];
      }
      acc[section].push(action);
      return acc;
    },
    {} as Record<string, CommandAction[]>
  );

  // Sort sections by default order
  const sortedSections = Object.keys(groupedActions).sort((a, b) => {
    const aIndex = DEFAULT_SECTIONS.indexOf(a);
    const bIndex = DEFAULT_SECTIONS.indexOf(b);
    if (aIndex === -1 && bIndex === -1) {
      return 0;
    }
    if (aIndex === -1) {
      return 1;
    }
    if (bIndex === -1) {
      return -1;
    }
    return aIndex - bIndex;
  });

  // Handle Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Reset query when closing
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const handleSelect = useCallback((action: CommandAction) => {
    action.action();
    // Action usually closes the palette, but if not:
    // setIsOpen(false); // We rely on the action wrapper to do this if needed
  }, []);

  const handleSearchSubmit = useCallback(() => {
    if (query.trim() && onSearch) {
      onSearch(query);
      setIsOpen(false);
    }
  }, [query, onSearch]);

  return {
    isOpen,
    setIsOpen,
    query,
    setQuery,
    sortedSections,
    groupedActions,
    handleSelect,
    handleSearchSubmit,
  };
}
