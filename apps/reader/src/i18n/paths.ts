import { routing } from "./navigation";

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function hasLocalePrefix(path: string, locale: string): boolean {
  const prefix = `/${locale}`;
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

export function buildLocalePath(path: string, locale: string): string {
  const normalized = normalizePath(path);
  // localePrefix is "as-needed" - only prefix non-default locales
  const shouldPrefix = locale !== routing.defaultLocale;

  if (!shouldPrefix || hasLocalePrefix(normalized, locale)) {
    return normalized;
  }

  return `/${locale}${normalized}`;
}

export function buildReaderPath(docId: string, locale: string): string {
  return buildLocalePath(`/reader/${encodeURIComponent(docId)}`, locale);
}

export function buildEditorPath(docId: string, locale: string): string {
  return buildLocalePath(`/editor?doc=${encodeURIComponent(docId)}`, locale);
}

export function buildProjectsPath(locale: string): string {
  return buildLocalePath("/projects", locale);
}
