"use client";

import { CommandRegistryProvider } from "@/lib/editor/commandRegistry";
import type { SlashMenuState } from "@/lib/editor/slashMenuPlugin";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import type { LoroRuntime } from "@ku0/lfcc-bridge";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

export type LfccEditorContextValue = {
  view: EditorView;
  runtime: LoroRuntime;
  slashMenuState?: SlashMenuState | null;
  syncSummary?: DiagnosticsSyncSummary;
};

const LfccEditorContext = React.createContext<LfccEditorContextValue | null>(null);

export function LfccEditorProvider({
  value,
  children,
}: {
  value: LfccEditorContextValue | null;
  children: React.ReactNode;
}) {
  return (
    <CommandRegistryProvider>
      <LfccEditorContext.Provider value={value}>{children}</LfccEditorContext.Provider>
    </CommandRegistryProvider>
  );
}

export function useLfccEditorContext(): LfccEditorContextValue | null {
  return React.useContext(LfccEditorContext);
}
