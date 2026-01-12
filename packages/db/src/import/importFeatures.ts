import type { ImportSourceType } from "../driver/types";

// Helper to safely read boolean flags from environment
function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

// Feature flags for import sources
// Note: These rely on the build system injecting process.env or replacing these strings
export const importFeatureFlags = {
  url: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_URL_ENABLED, false),
  rss: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_RSS_ENABLED, false),
  youtube: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_YOUTUBE_ENABLED, false),
};

export function isImportSourceEnabled(sourceType: ImportSourceType): boolean {
  if (sourceType === "file") {
    return true;
  }
  return importFeatureFlags[sourceType] ?? false;
}
