"use client";

export function formatImportSourceLabel(ref: string): string {
  if (ref.startsWith("file:")) {
    const parts = ref.split(":");
    return parts[1] || ref;
  }

  if (ref.startsWith("rss:")) {
    const parts = ref.split(":");
    return parts[1] ? `RSS ${parts[1]}` : ref;
  }

  try {
    const url = new URL(ref);
    return url.hostname + (url.pathname.length > 1 ? url.pathname : "");
  } catch {
    return ref.slice(0, 30) + (ref.length > 30 ? "..." : "");
  }
}
