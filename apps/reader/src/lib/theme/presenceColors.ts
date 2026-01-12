export const PRESENCE_COLOR_TOKENS = [
  "var(--color-presence-1)",
  "var(--color-presence-2)",
  "var(--color-presence-3)",
  "var(--color-presence-4)",
  "var(--color-presence-5)",
  "var(--color-presence-6)",
  "var(--color-presence-7)",
  "var(--color-presence-8)",
  "var(--color-presence-9)",
] as const;

export const DEFAULT_PRESENCE_COLOR = PRESENCE_COLOR_TOKENS[6];

export function getPresenceColorByIndex(index: number): string {
  const total = PRESENCE_COLOR_TOKENS.length;
  const normalized = ((index % total) + total) % total;
  return PRESENCE_COLOR_TOKENS[normalized] ?? DEFAULT_PRESENCE_COLOR;
}

export function getPresenceColorFromId(peerId: string): string {
  let hash = 0;
  for (let i = 0; i < peerId.length; i += 1) {
    hash = (hash << 5) - hash + peerId.charCodeAt(i);
    hash &= hash;
  }
  return getPresenceColorByIndex(Math.abs(hash));
}

export function getRandomPresenceColor(): string {
  return getPresenceColorByIndex(Math.floor(Math.random() * PRESENCE_COLOR_TOKENS.length));
}
