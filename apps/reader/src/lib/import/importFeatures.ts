"use client";

import type { ImportSourceType } from "@keepup/db";

function readBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

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
