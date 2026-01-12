"use client";

import { SlashCommandMenu } from "@/components/editor/SlashCommandMenu";
import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { type SlashCommand, slashMenuKey } from "@/lib/editor/slashMenuPlugin";
import * as React from "react";
import { createPortal } from "react-dom";

/**
 * SlashMenuPortal
 * Renders the slash menu in a portal, synced with plugin state via context (no polling)
 */
export function SlashMenuPortal() {
  const context = useLfccEditorContext();

  const handleSelectCommand = React.useCallback(
    (command: SlashCommand) => {
      if (!context?.view) {
        return;
      }

      const { view } = context;
      // Execute the command
      command.execute(view);
      // Close the menu
      view.dispatch(view.state.tr.setMeta(slashMenuKey, { type: "close" }));
    },
    [context]
  );

  const handleQueryChange = React.useCallback(
    (query: string) => {
      if (!context?.view) {
        return;
      }
      const { view } = context;
      view.dispatch(
        view.state.tr
          .setMeta(slashMenuKey, { type: "updateQuery", query })
          .setMeta("slashMenuKeepOpen", true)
      );
    },
    [context]
  );

  const menuState = context?.slashMenuState;

  if (!menuState?.active) {
    return null;
  }

  return createPortal(
    <SlashCommandMenu
      state={menuState}
      onSelectCommand={handleSelectCommand}
      onQueryChange={handleQueryChange}
    />,
    document.body
  );
}
