"use client";

import type { ConsentOverride } from "@/lib/ai/contextPrivacy";
import { evaluateConsent } from "@/lib/ai/contextPrivacy";
import * as React from "react";

type ConsentState = {
  globalAllow: boolean;
  docOverrides: Record<string, ConsentOverride>;
  disclosureAccepted: boolean;
};

const STORAGE_KEY = "ai-context-consent-v1";
const DEFAULT_STATE: ConsentState = {
  globalAllow: false,
  docOverrides: {},
  disclosureAccepted: false,
};

function parseState(raw: string | null): ConsentState {
  if (!raw) {
    return DEFAULT_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    const overrides: Record<string, ConsentOverride> = {};
    if (parsed.docOverrides && typeof parsed.docOverrides === "object") {
      for (const [key, value] of Object.entries(parsed.docOverrides)) {
        if (value === "allow" || value === "deny") {
          overrides[key] = value;
        }
      }
    }
    return {
      globalAllow: typeof parsed.globalAllow === "boolean" ? parsed.globalAllow : false,
      docOverrides: overrides,
      disclosureAccepted:
        typeof parsed.disclosureAccepted === "boolean" ? parsed.disclosureAccepted : false,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function useAiContextConsent(docId?: string) {
  const [state, setState] = React.useState<ConsentState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setState(parseState(stored));
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to persist context consent:", error);
    }
  }, [hydrated, state]);

  const docOverride = docId ? state.docOverrides[docId] : undefined;
  const decision = evaluateConsent({
    globalAllow: state.globalAllow,
    docOverride,
    disclosureAccepted: state.disclosureAccepted,
  });

  const setGlobalAllow = React.useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, globalAllow: value }));
  }, []);

  const setDocOverride = React.useCallback(
    (targetDocId: string, override: ConsentOverride | "inherit") => {
      if (!targetDocId) {
        return;
      }
      setState((prev) => {
        const nextOverrides = { ...prev.docOverrides };
        if (override === "inherit") {
          delete nextOverrides[targetDocId];
        } else {
          nextOverrides[targetDocId] = override;
        }
        return { ...prev, docOverrides: nextOverrides };
      });
    },
    []
  );

  const acceptDisclosure = React.useCallback(() => {
    setState((prev) => ({ ...prev, disclosureAccepted: true }));
  }, []);

  return {
    state,
    hydrated,
    docOverride,
    decision,
    setGlobalAllow,
    setDocOverride,
    acceptDisclosure,
  };
}
