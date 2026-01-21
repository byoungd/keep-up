export type FlagDefinition = {
  envVar?: string;
  defaultValue: boolean;
};

export type FlagStore<T extends Record<string, FlagDefinition>> = {
  flags: Record<keyof T, boolean>;
  getFlag: <K extends keyof T>(flag: K) => boolean;
  setOverride: <K extends keyof T>(flag: K, value: boolean) => void;
  clearOverrides: () => void;
};

function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

export function createFlagStore<T extends Record<string, FlagDefinition>>(
  definitions: T
): FlagStore<T> {
  const flags = {} as Record<keyof T, boolean>;
  const overrides: Partial<Record<keyof T, boolean>> = {};

  for (const [key, def] of Object.entries(definitions)) {
    const envVar = def.envVar;
    const envValue = typeof process !== "undefined" ? process.env?.[envVar ?? ""] : undefined;
    flags[key as keyof T] = readBooleanFlag(envValue, def.defaultValue);
  }

  return {
    flags,
    getFlag: (flag) => {
      if (flag in overrides) {
        return overrides[flag] as boolean;
      }
      return flags[flag];
    },
    setOverride: (flag, value) => {
      overrides[flag] = value;
    },
    clearOverrides: () => {
      for (const key of Object.keys(overrides)) {
        delete overrides[key as keyof T];
      }
    },
  };
}

export const DEFAULT_NATIVE_FLAGS = {
  native_accelerators_enabled: {
    envVar: "KU0_NATIVE_ACCELERATORS_ENABLED",
    defaultValue: false,
  },
} as const;

export const nativeFlagStore = createFlagStore(DEFAULT_NATIVE_FLAGS);
