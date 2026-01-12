"use client";

import * as React from "react";

import { DEFAULT_PRESENCE_COLOR, PRESENCE_COLOR_TOKENS } from "@/lib/theme/presenceColors";

const LOCAL_IDENTITY_KEY = "lfcc-local-identity";

export interface LocalIdentity {
  name: string;
  color: string;
}

const DEFAULT_IDENTITY: LocalIdentity = {
  name: "You",
  color: DEFAULT_PRESENCE_COLOR,
};

function loadIdentity(): LocalIdentity {
  if (typeof window === "undefined") {
    return DEFAULT_IDENTITY;
  }
  try {
    const stored = localStorage.getItem(LOCAL_IDENTITY_KEY);
    if (stored) {
      return JSON.parse(stored) as LocalIdentity;
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_IDENTITY;
}

function saveIdentity(identity: LocalIdentity): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(LOCAL_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for managing local user identity (name + color).
 * Persisted in localStorage, not in CRDT.
 */
export function useLocalIdentity() {
  const [identity, setIdentityState] = React.useState<LocalIdentity>(DEFAULT_IDENTITY);

  // Load from localStorage on mount
  React.useEffect(() => {
    setIdentityState(loadIdentity());
  }, []);

  const setIdentity = React.useCallback((update: Partial<LocalIdentity>) => {
    setIdentityState((prev) => {
      const next = { ...prev, ...update };
      saveIdentity(next);
      return next;
    });
  }, []);

  const setName = React.useCallback(
    (name: string) => setIdentity({ name: name.trim() || DEFAULT_IDENTITY.name }),
    [setIdentity]
  );

  const setColor = React.useCallback((color: string) => setIdentity({ color }), [setIdentity]);

  return {
    identity,
    setName,
    setColor,
    availableColors: PRESENCE_COLOR_TOKENS,
  };
}
